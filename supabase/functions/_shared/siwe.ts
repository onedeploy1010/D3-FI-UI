import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError, isEthAddress } from './wallet.ts';

/**
 * SIWE (Sign-In With Ethereum) backend — replaces Privy JWT for user identity.
 *
 * Flow:
 *   1. POST /auth/nonce  {address}            -> issueNonce            -> {nonce}
 *   2. wallet signs an EIP-4361 message embedding that nonce
 *   3. POST /auth/verify {message, signature} -> verifySiweAndIssueToken -> {token,...}
 *   4. API calls send  X-Session-Token: <token>  and are checked by verifySiweSession.
 *
 * The session token is a compact HMAC-SHA256 JWT (HS256) signed with the
 * SIWE_SESSION_SECRET env var via Web Crypto. Ownership of the wallet is proven
 * once, cryptographically, at login — so downstream routes trust the token's
 * subject as the acting wallet (no spoofable header is trusted for identity).
 *
 * Fails CLOSED: any missing secret, malformed input, bad signature, replayed or
 * expired nonce, or domain mismatch throws (HttpError) rather than authenticating.
 */

const NONCE_TTL_MS = 5 * 60 * 1000; // ~5 minutes
const SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

// ---------------------------------------------------------------------------
// base64url + HMAC helpers (Web Crypto — available in Deno and Node 20+)
// ---------------------------------------------------------------------------

function base64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Constant-time comparison of two byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Minimum entropy for the HMAC signing secret. Fails closed if too short. */
const MIN_SECRET_LEN = 32;

function requireSessionSecret(): string {
  const secret = Deno.env.get('SIWE_SESSION_SECRET');
  if (!secret) throw new HttpError(503, 'Auth not configured');
  if (secret.length < MIN_SECRET_LEN) {
    throw new HttpError(503, 'Auth misconfigured (weak session secret)');
  }
  return secret;
}

/**
 * The set of SIWE domains this backend accepts, from SIWE_ALLOWED_DOMAINS
 * (comma-separated, e.g. "d3-dapp.pages.dev,d3fi-ui.netlify.app,localhost:5173").
 * This is the ONLY source of truth for the anti-phishing domain check — the
 * request's own Origin/Host header is never trusted. Fails CLOSED if unset.
 */
function allowedDomains(): string[] {
  return (Deno.env.get('SIWE_ALLOWED_DOMAINS') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function hmacKey(usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(requireSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
}

async function hmacSign(input: string): Promise<Uint8Array> {
  const key = await hmacKey(['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return new Uint8Array(sig);
}

type SessionPayload = { sub: string; iat: number; exp: number };

async function signSessionJwt(payload: SessionPayload): Promise<string> {
  const enc = (o: unknown) => base64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}`;
  const sig = await hmacSign(signingInput);
  return `${signingInput}.${base64urlEncode(sig)}`;
}

// ---------------------------------------------------------------------------
// EIP-4361 (SIWE) message parsing — only the fields we authenticate against.
// ---------------------------------------------------------------------------

type ParsedSiwe = { domain?: string; address?: string; nonce?: string; uri?: string };

/**
 * Parse the subset of an EIP-4361 message we need. The message is produced by
 * the `siwe` library's `prepareMessage()`; line 0 is
 *   "${domain} wants you to sign in with your Ethereum account:"
 * line 1 is the address, and labelled fields (Nonce:, URI:, ...) follow.
 */
function parseSiweMessage(message: string): ParsedSiwe {
  const lines = message.split('\n');
  const out: ParsedSiwe = {};

  const header = lines[0]?.match(/^(\S+) wants you to sign in with your Ethereum account:$/);
  if (header) out.domain = header[1];

  const addr = lines[1]?.trim();
  if (addr && isEthAddress(addr)) out.address = addr;

  for (const line of lines) {
    const nonce = line.match(/^Nonce: (.+)$/);
    if (nonce) out.nonce = nonce[1].trim();
    const uri = line.match(/^URI: (.+)$/);
    if (uri) out.uri = uri[1].trim();
  }
  return out;
}

/**
 * Recover the EOA that produced a personal_sign signature over `message`.
 * viem is dynamically imported so this heavy dep never enters the static module
 * graph (keeps `verifySiweSession` importable in non-Deno/test contexts).
 */
async function recoverSigner(message: string, signature: string): Promise<string> {
  // deno-lint-ignore no-explicit-any
  const viem: any = await import('npm:viem@2');
  return viem.recoverMessageAddress({
    message,
    signature: signature as `0x${string}`,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Issue and persist a fresh single-use nonce for `address` (~5 min TTL). */
export async function issueNonce(
  sb: SupabaseClient,
  address: string,
): Promise<{ nonce: string }> {
  if (!isEthAddress(address)) throw new HttpError(400, 'Invalid address');

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  const { error } = await sb.from('siwe_nonces').insert({
    address: address.toLowerCase(),
    nonce,
    expires_at: new Date(Date.now() + NONCE_TTL_MS).toISOString(),
    used: false,
  });
  if (error) throw new HttpError(502, error.message);

  return { nonce };
}

export interface VerifySiweInput {
  message: string;
  signature: string;
}

/**
 * Verify a completed SIWE handshake and mint a session token.
 *
 * Checks (all fail CLOSED):
 *   - message parses and carries a valid address + nonce
 *   - SIWE `domain` is a member of the server-side SIWE_ALLOWED_DOMAINS allowlist.
 *     The request's own Origin/Host header is NEVER trusted here — otherwise a
 *     phishing site serving its own Host could satisfy the check and take over
 *     the account. If the allowlist is unset the endpoint fails closed (503).
 *   - recovered signer == message address
 *   - the nonce exists, is unused, and unexpired — consumed atomically (single UPDATE)
 */
export async function verifySiweAndIssueToken(
  sb: SupabaseClient,
  { message, signature }: VerifySiweInput,
): Promise<{ token: string; address: string; expiresAt: string }> {
  if (typeof message !== 'string' || typeof signature !== 'string') {
    throw new HttpError(400, 'message and signature required');
  }

  const parsed = parseSiweMessage(message);
  if (!parsed.address || !isEthAddress(parsed.address)) {
    throw new HttpError(400, 'Invalid SIWE message address');
  }
  if (!parsed.nonce) throw new HttpError(400, 'Missing SIWE nonce');

  // Domain binding (anti-phishing): the SIWE domain must be a member of the
  // server-side allowlist. This is the ONLY accepted source — never the request
  // host. Fail closed if the allowlist has not been configured.
  const allow = allowedDomains();
  if (allow.length === 0) throw new HttpError(503, 'Auth not configured (no allowed domains)');
  const domain = parsed.domain?.toLowerCase();
  if (!domain || !allow.includes(domain)) {
    throw new HttpError(401, 'SIWE domain not allowed');
  }

  // Recover the signer and require it to match the claimed address.
  let recovered: string;
  try {
    recovered = await recoverSigner(message, signature);
  } catch {
    throw new HttpError(401, 'Signature verification failed');
  }
  if (recovered.toLowerCase() !== parsed.address.toLowerCase()) {
    throw new HttpError(401, 'Signature does not match address');
  }

  // Consume the nonce ATOMICALLY: mark used only if currently unused + unexpired
  // + bound to this address. A single UPDATE ... RETURNING makes replays impossible.
  const { data: claimed, error } = await sb
    .from('siwe_nonces')
    .update({ used: true })
    .eq('nonce', parsed.nonce)
    .eq('address', parsed.address.toLowerCase())
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .select('nonce')
    .maybeSingle();
  if (error) throw new HttpError(502, error.message);
  if (!claimed) throw new HttpError(401, 'Invalid or expired nonce');

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + SESSION_TTL_SEC;
  const address = parsed.address.toLowerCase();
  const token = await signSessionJwt({ sub: address, iat, exp });

  return { token, address, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Read the session token off a request, if present. */
export function getSessionToken(req: Request): string | null {
  return req.headers.get('x-session-token')?.trim() || null;
}

/**
 * Verify the X-Session-Token JWT and return the proven wallet address
 * (lowercased). Throws HttpError(401) on any missing/malformed/invalid/expired
 * token. HMAC signature is compared in constant time.
 */
export async function verifySiweSession(req: Request): Promise<string> {
  const token = getSessionToken(req);
  if (!token) throw new HttpError(401, 'Session token required (X-Session-Token)');

  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Malformed session token');
  const [headerB64, payloadB64, sigB64] = parts;

  let provided: Uint8Array;
  try {
    provided = base64urlDecode(sigB64);
  } catch {
    throw new HttpError(401, 'Invalid session token');
  }
  const expected = await hmacSign(`${headerB64}.${payloadB64}`);
  if (!timingSafeEqual(expected, provided)) {
    throw new HttpError(401, 'Invalid session signature');
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
  } catch {
    throw new HttpError(401, 'Invalid session payload');
  }
  if (typeof payload.exp !== 'number' || !payload.sub || !isEthAddress(payload.sub)) {
    throw new HttpError(401, 'Invalid session claims');
  }
  if (Math.floor(Date.now() / 1000) >= payload.exp) {
    throw new HttpError(401, 'Session expired');
  }

  return payload.sub.toLowerCase();
}
