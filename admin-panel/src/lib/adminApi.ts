import { supabase } from './supabase';

const base = () => {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  if (!url) throw new Error('VITE_SUPABASE_URL not configured');
  return `${url}/functions/v1/admin`;
};

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error('未登录');
  return t;
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await token()}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? res.statusText);
  return body as T;
}

export type MemberRow = {
  walletAddress: string;
  isPartner: boolean;
  sd3Balance: number;
  pendingUsdtYield: number;
  marketLeaderStatus: string;
  joinedAt: string | null;
  sponsorWallet: string | null;
  teamPerformanceUsd: number;
  personalPerformanceUsd: number;
  dailyNewPerformanceUsd: number;
};

export type SubsidyTicket = {
  id: string;
  wallet_address: string;
  kind: string;
  amount_usd: number | null;
  purpose: string;
  status: string;
  team_performance_usd: number;
  daily_new_performance_usd: number;
  personal_performance_usd: number;
  applied_at: string;
  admin_note?: string | null;
};

export type SubsidyMessage = {
  id: string;
  ticket_id: string;
  author_type: string;
  author_name: string | null;
  body: string;
  created_at: string;
};

// ---- Security / Circuit-Breaker ----

export type PauseFlag = {
  flag: string;
  paused: boolean;
  reason: string | null;
  updated_at: string | null;
  auto_paused?: boolean;
};

export type RiskLimits = Record<string, number | string | boolean | null>;

export type SecuritySolvency = {
  ratio: number;
  liabilityUsdt: number;
  flashSwapReserveUsdt: number;
  healthy: boolean;
};

export type SecurityAlertCounts = { P0: number; P1: number; P2: number; P3: number };

export type SecurityOverview = {
  pauseFlags: PauseFlag[];
  limits: RiskLimits;
  solvency: SecuritySolvency;
  alertCounts: SecurityAlertCounts;
};

export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type AlertStatus = 'open' | 'ack' | 'resolved';

export type SecurityAlert = {
  id: string;
  severity: AlertSeverity;
  rule_id: string;
  title: string | null;
  detail?: unknown;
  entity_type?: string | null;
  entity_id?: string | null;
  status: AlertStatus;
  auto_paused?: boolean;
  created_at: string;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
};

export function getSecurityOverview() {
  return adminFetch<SecurityOverview>('/security/overview');
}

export function listSecurityAlerts(params?: { status?: string; severity?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== 'all') qs.set('status', params.status);
  if (params?.severity && params.severity !== 'all') qs.set('severity', params.severity);
  const q = qs.toString();
  return adminFetch<{ rows: SecurityAlert[] }>(`/security/alerts${q ? `?${q}` : ''}`);
}

export function ackAlert(id: string) {
  return adminFetch<{ ok?: boolean }>(`/security/alerts/${id}/ack`, { method: 'POST' });
}

export function pause(flag: string, reason: string) {
  return adminFetch<{ ok?: boolean }>('/security/pause', {
    method: 'POST',
    body: JSON.stringify({ flag, reason }),
  });
}

export function unpause(flag: string, reason: string) {
  // maker-checker: returns a pending approval (202); a second admin must approve.
  return adminFetch<{ ok?: boolean; approvalId?: string; pending?: boolean }>('/security/unpause', {
    method: 'POST',
    body: JSON.stringify({ flag, reason }),
  });
}

export function getRiskLimits() {
  return adminFetch<{ limits: RiskLimits }>('/security/limits');
}

export function updateRiskLimits(patch: Record<string, unknown>) {
  // maker-checker: returns a pending approval.
  return adminFetch<{ ok?: boolean; approvalId?: string; pending?: boolean }>('/security/limits', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}
