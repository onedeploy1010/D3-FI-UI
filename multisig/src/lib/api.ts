import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

/**
 * Calls the SHARED `admin` edge function. A super_partner's Supabase Auth token
 * is already authorized for treasury.read/write + security.read, so the standalone
 * multisig app reuses the existing backend rather than adding a new one.
 */
const ADMIN_BASE = `${SUPABASE_URL}/functions/v1/admin`;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? '';
  return {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
}

export async function adminFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${ADMIN_BASE}${path}`, {
    ...opts,
    headers: { ...(await authHeader()), ...(opts?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(body?.error ?? body?.message ?? `HTTP ${res.status}`);
  }
  return body as T;
}

// ── Typed views the super-partner screens use ────────────────────────────────

export type InfraWallet = {
  wallet_type: string;
  address: string;
  bnb: number | string;
  usdt: number | string;
};

export type TreasuryTransfer = {
  id: string;
  to_address: string;
  amount_usdt: number | string;
  status: string;
  turnkey_activity_id?: string | null;
  proposed_by?: string | null;
  created_at: string;
};

export type PendingApproval = {
  id: string;
  action: string;
  target_type?: string;
  status: string;
  requested_by?: string;
  created_at: string;
};

export type AllowlistRow = {
  id: string;
  address: string;
  label?: string | null;
  asset?: string | null;
  created_at?: string;
};

export type PauseFlag = { flag: string; paused: boolean; reason?: string | null; updated_at?: string };

export type Solvency = {
  ratio?: number;
  reserveUsdt?: number;
  liabilityUsdt?: number;
  healthy?: boolean;
  minRatio?: number;
} | null;

export type SecurityOverview = {
  ok: boolean;
  pauseFlags: PauseFlag[];
  limits: Record<string, unknown> | null;
  solvency: Solvency;
  alertCounts: Record<string, number> | null;
};

export const api = {
  wallets: () => adminFetch<{ ok: boolean; wallets?: InfraWallet[] } & Record<string, unknown>>('/wallets'),
  transfers: () => adminFetch<{ transfers?: TreasuryTransfer[] }>('/treasury/transfers'),
  allowlist: () => adminFetch<{ rows?: AllowlistRow[] }>('/treasury/allowlist'),
  addAllowlist: (payload: { address: string; label?: string }) =>
    adminFetch<{ ok: boolean; entry?: AllowlistRow }>('/treasury/allowlist', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  removeAllowlist: (address: string) =>
    adminFetch<{ ok: boolean }>(`/treasury/allowlist/${address}`, { method: 'DELETE' }),
  proposeTransfer: (payload: {
    asset?: 'usdt' | 'bnb';
    toAddress: string;
    amount: number;
    requestKey: string;
    note?: string;
  }) =>
    adminFetch<{ ok: boolean; transfer?: TreasuryTransfer }>('/treasury/transfers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  broadcastTransfer: (id: string) =>
    adminFetch<{ ok: boolean; transfer?: TreasuryTransfer }>(`/treasury/transfers/${id}/broadcast`, {
      method: 'POST',
    }),
  approvals: () => adminFetch<{ approvals?: PendingApproval[] }>('/approvals'),
  securityOverview: () => adminFetch<SecurityOverview>('/security/overview'),
  securityAlerts: () => adminFetch<{ rows?: SecurityAlert[] }>('/security/alerts?status=open'),
  admins: () => adminFetch<{ rows?: AdminRow[] }>('/admins'),
};

export type AdminRow = {
  userId: string;
  username: string;
  role: string;
  permissions: string[];
  createdAt?: string | null;
};

export type SecurityAlert = {
  id: string;
  severity?: string;
  kind?: string;
  title?: string;
  message?: string;
  created_at: string;
};

/** Idempotency key for a treasury transfer proposal. */
export function newRequestKey(): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  return `ms-${rnd}`;
}

/** Deep-link into the Turnkey dashboard for a pending consensus activity.
 *  NOTE: exact URL must be confirmed against the live Turnkey console. */
export function turnkeyActivityUrl(activityId?: string | null): string {
  const base = import.meta.env.VITE_TURNKEY_DASHBOARD_BASE ?? 'https://app.turnkey.com';
  const org = import.meta.env.VITE_TURNKEY_ORG_ID ?? '';
  const qs = new URLSearchParams();
  if (org) qs.set('organizationId', org);
  if (activityId) qs.set('activityId', activityId);
  const suffix = qs.toString();
  return `${base}/dashboard/activity${suffix ? `?${suffix}` : ''}`;
}
