import type { UnionProfileBundle } from './d3fiTypes';
import {
  clearDemoWalletSession,
  DEMO_LINE_LEADER_WALLET,
  isDemoWallet,
  readDemoWalletFromSession,
} from './demoWallet';
import { isSupabaseClientConfigured, supabaseUrl, supabaseAnonKey } from './supabase';
import { formatWalletAddress } from './wallet';

export type { UnionProfileBundle };

type TokenGetter = () => Promise<string | null>;

let accessTokenGetter: TokenGetter | null = null;

export function setUnionAccessTokenGetter(getter: TokenGetter) {
  accessTokenGetter = getter;
}

function requireSupabase() {
  if (!isSupabaseClientConfigured || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('Backend service not configured');
  }
}

async function buildFunctionHeaders(wallet: string): Promise<Record<string, string>> {
  const address = formatWalletAddress(wallet);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${supabaseAnonKey}`,
    apikey: supabaseAnonKey!,
    'X-Wallet-Address': address,
  };

  const demoSession = readDemoWalletFromSession();
  if (demoSession && isDemoWallet(address)) {
    headers['X-Demo-Mode'] = '1';
  } else if (accessTokenGetter) {
    const token = await accessTokenGetter();
    if (token) headers['X-Privy-Token'] = token;
  }

  return headers;
}

/** Call Supabase Edge Function `union` (replaces local /api/union). */
export async function unionFetch<T>(
  path: string,
  wallet: string,
  init?: RequestInit,
): Promise<T> {
  requireSupabase();
  const authHeaders = await buildFunctionHeaders(wallet);
  const url = `${supabaseUrl}/functions/v1/union${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return body as T;
}

/** Public reads — no wallet / Privy required. */
export async function unionPublicFetch<T>(path: string): Promise<T> {
  requireSupabase();
  const url = `${supabaseUrl}/functions/v1/union${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey!,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return body as T;
}

export function ensureUnionProfile(
  wallet: string,
  opts?: { lang?: 'zh' | 'en'; privyUserId?: string; displayName?: string },
) {
  return unionFetch<{ profile: unknown; created: boolean }>('/profile', wallet, {
    method: 'POST',
    body: JSON.stringify({
      lang: opts?.lang ?? 'zh',
      displayName: opts?.displayName,
    }),
  });
}

export function fetchUnionProfile(wallet: string) {
  return unionFetch<UnionProfileBundle>(`/profile/${encodeURIComponent(wallet)}`, wallet);
}

/** Public — whether sponsor wallet has registered (connected) before. */
export function checkSponsorRegistered(sponsorWallet: string) {
  return unionPublicFetch<{ registered: boolean }>(
    `/sponsor/${encodeURIComponent(sponsorWallet)}/registered`,
  );
}

export function claimUsd3(wallet: string) {
  return unionFetch<{ usd3Account: unknown }>('/usd3/claim', wallet, { method: 'POST' });
}

export function joinShareholder(wallet: string, opts?: { joinTxHash?: string; sponsorWallet?: string }) {
  return unionFetch<{ shareholder: unknown }>('/shareholders/join', wallet, {
    method: 'POST',
    body: JSON.stringify(opts ?? {}),
  });
}

export function bindReferral(
  wallet: string,
  sponsorWallet: string,
  referralType: 'partner' | 'shareholder' = 'partner',
) {
  return unionFetch<{ referral: unknown; created: boolean }>('/referrals/bind', wallet, {
    method: 'POST',
    body: JSON.stringify({ sponsorWallet, referralType }),
  });
}

export function createMultisigProposal(
  wallet: string,
  body?: { periodZh?: string; periodEn?: string; beneficiaryCount?: number },
) {
  return unionFetch<{ proposal: unknown }>('/multisig/proposals', wallet, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export function signMultisigProposal(wallet: string, proposalId: string) {
  return unionFetch<{ ok: boolean; signedCount: number; threshold: number; executed: boolean }>(
    `/multisig/proposals/${encodeURIComponent(proposalId)}/sign`,
    wallet,
    { method: 'POST' },
  );
}

export function addCommitteeMember(
  wallet: string,
  body: { signerWallet: string; roleZh?: string; roleEn?: string; dividendWeightPct?: number },
) {
  return unionFetch<{ member: unknown }>('/multisig/committee', wallet, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateCommitteeMember(
  wallet: string,
  memberId: string,
  body: { roleZh?: string; roleEn?: string; dividendWeightPct?: number },
) {
  return unionFetch<{ member: unknown }>(`/multisig/committee/${encodeURIComponent(memberId)}`, wallet, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function removeCommitteeMember(wallet: string, memberId: string) {
  return unionFetch<{ ok: boolean }>(`/multisig/committee/${encodeURIComponent(memberId)}`, wallet, {
    method: 'DELETE',
  });
}
