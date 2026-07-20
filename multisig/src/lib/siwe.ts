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
    // Unified with the main app's statement. EIP-4361 statement must be ASCII —
    // non-ASCII (e.g. 中文) makes the SIWE ABNF parser reject the message.
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
    /* ignore */
  }
  return token;
}

export type PartnerProfile = {
  partnerAccount?: {
    is_partner?: boolean;
    ud3_balance?: number;
    lifetime_ud3_earned?: number;
    pending_d3_yield?: number;
    joined_at?: string | null;
  } | null;
  partnerTeamStats?: {
    personalPerformanceUsd?: number;
    teamPerformanceUsd?: number;
    dailyNewPerformanceUsd?: number;
    smallAreaPerformanceUsd?: number;
  } | null;
  partnerDownlineWallets?: string[];
  partnerStakePositions?: Array<{ principal_usdt?: number; staked_d3?: number; kind?: string }>;
} & Record<string, unknown>;

/** Fetch the partner's union profile (needs a SIWE session). Used to verify is_partner + 业绩. */
export async function fetchPartnerProfile(wallet: string): Promise<PartnerProfile> {
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

// ── Partner subsidy (union, SIWE-authed) ─────────────────────────────────────
async function unionAuthed<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      apikey: APIKEY,
      Authorization: `Bearer ${APIKEY}`,
      'Content-Type': 'application/json',
      ...(token ? { 'X-Session-Token': token } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `union ${path} (${res.status})`);
  return json as T;
}

export type SubsidyKind = 'partner_subsidy' | 'market_subsidy';
export type SubsidyQuota = {
  ratePct: number;
  basePerformanceUsd: number;
  cap: number;
  reserved: number;
  remaining: number;
};
export type SubsidyTicket = {
  id: string;
  kind: string;
  amount_usd: number;
  purpose?: string | null;
  status: string;
  application_type?: string | null;
  created_at?: string;
  applied_at?: string;
};

export const partnerApi = {
  subsidyQuota: (kind: SubsidyKind) =>
    unionAuthed<{ ok: boolean; quota: SubsidyQuota }>(`/partner/subsidy-quota?kind=${kind}`),
  subsidyTickets: () => unionAuthed<{ ok: boolean; tickets: SubsidyTicket[] }>('/partner/subsidy-tickets'),
  createSubsidy: (body: {
    kind: SubsidyKind | 'market_leader';
    amountUsd: number;
    purpose?: string;
    applicationType?: 'reserve' | 'reimbursement';
    receiptPaths?: string[];
  }) => unionAuthed<{ ok: boolean; ticket: SubsidyTicket }>('/partner/subsidy-tickets', { method: 'POST', body: JSON.stringify(body) }),
};
