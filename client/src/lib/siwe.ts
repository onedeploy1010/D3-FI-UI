import { SiweMessage } from 'siwe';

/**
 * SIWE (Sign-In With Ethereum) — replaces Privy JWT auth.
 * The wallet signs a nonce-bound message; the backend verifies the signature and
 * issues a short-lived session token that is sent on API calls (X-Session-Token).
 */
const SESSION_KEY = 'd3_siwe_token';
const SESSION_ADDR_KEY = 'd3_siwe_addr';

const BASE = `${(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/union`;
const APIKEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function getSessionAddress(): string | null {
  try {
    return localStorage.getItem(SESSION_ADDR_KEY);
  } catch {
    return null;
  }
}

export function clearSiweSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_ADDR_KEY);
  } catch {
    /* ignore */
  }
}

/** True when we already hold a session token for this exact address. */
export function hasValidSession(address: string): boolean {
  const tok = getSessionToken();
  const addr = getSessionAddress();
  return Boolean(tok && addr && addr.toLowerCase() === address.toLowerCase());
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: APIKEY,
      Authorization: `Bearer ${APIKEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `auth ${path} failed (${res.status})`);
  return json as T;
}

/**
 * Full SIWE handshake. `signMessageAsync` comes from wagmi's useSignMessage.
 * Stores + returns the session token.
 */
export async function siweSignIn(
  address: string,
  chainId: number,
  signMessageAsync: (args: { account: `0x${string}`; message: string }) => Promise<string>,
): Promise<string> {
  const { nonce } = await postJson<{ nonce: string }>('/auth/nonce', { address });

  const message = new SiweMessage({
    domain: window.location.host,
    address,
    statement: 'Sign in to D3 Finance.',
    uri: window.location.origin,
    version: '1',
    chainId,
    nonce,
  }).prepareMessage();

  const signature = await signMessageAsync({ account: address as `0x${string}`, message });

  const { token } = await postJson<{ token: string }>('/auth/verify', { message, signature });
  try {
    localStorage.setItem(SESSION_KEY, token);
    localStorage.setItem(SESSION_ADDR_KEY, address.toLowerCase());
  } catch {
    /* ignore storage errors */
  }
  return token;
}
