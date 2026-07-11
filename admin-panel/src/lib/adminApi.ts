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
