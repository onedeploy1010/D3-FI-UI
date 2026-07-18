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

export const api = {
  wallets: () => adminFetch<{ ok: boolean; wallets?: InfraWallet[] } & Record<string, unknown>>('/wallets'),
  transfers: () => adminFetch<{ transfers?: TreasuryTransfer[] }>('/treasury/transfers'),
  proposeTransfer: (payload: { toAddress: string; amountUsdt: number }) =>
    adminFetch<{ ok: boolean; id?: string; status?: string }>('/treasury/transfers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  broadcastTransfer: (id: string) =>
    adminFetch<{ ok: boolean }>(`/treasury/transfers/${id}/broadcast`, { method: 'POST' }),
  approvals: () => adminFetch<{ approvals?: PendingApproval[] }>('/approvals'),
};

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
