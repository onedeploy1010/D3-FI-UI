import { SiweMessage } from 'siwe';

/**
 * SIWE (Sign-In With Ethereum) for partner login. The wallet signs a nonce-bound
 * message; the union edge function verifies it and issues a session token sent as
 * X-Session-Token on subsequent calls. (Ported from the main app.)
 */
const SESSION_KEY = 'd3ms_siwe_token';
const SESSION_ADDR_KEY = 'd3ms_siwe_addr';

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

export function hasValidSession(address: string): boolean {
  const tok = getSessionToken();
  const addr = getSessionAddress();
  return Boolean(tok && addr && addr.toLowerCase() === address.toLowerCase());
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: APIKEY, Authorization: `Bearer ${APIKEY}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `auth ${path} failed (${res.status})`);
  return json as T;
}

export async function siweSignIn(
  address: string,
  chainId: number,
  signMessageAsync: (args: { account: `0x${string}`; message: string }) => Promise<string>,
): Promise<string> {
  const { nonce } = await postJson<{ nonce: string }>('/auth/nonce', { address });
  const message = new SiweMessage({
    domain: window.location.host,
    address,
    statement: 'Sign in to D3 多签系统.',
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
    /* ignore */
  }
  return token;
}

/** Fetch the partner's union profile (needs a SIWE session). Used to verify is_partner. */
export async function fetchPartnerProfile(wallet: string): Promise<{
  partnerAccount?: { is_partner?: boolean } | null;
} & Record<string, unknown>> {
  const token = getSessionToken();
  const res = await fetch(`${BASE}/profile/${encodeURIComponent(wallet)}`, {
    headers: {
      apikey: APIKEY,
      Authorization: `Bearer ${APIKEY}`,
      ...(token ? { 'X-Session-Token': token } : {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `profile failed (${res.status})`);
  return json;
}
