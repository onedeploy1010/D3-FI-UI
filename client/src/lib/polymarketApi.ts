import { isSupabaseClientConfigured, supabaseAnonKey, supabaseUrl } from './supabase';

export type PolymarketLeaderboardResponse = {
  traders: unknown[];
  fetchedAt: string;
  status: 'ok' | 'error' | 'partial';
  errorMsg?: string;
  loading?: boolean;
};

function requireSupabase() {
  if (!isSupabaseClientConfigured || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('Backend service not configured');
  }
}

async function polymarketPublicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  requireSupabase();
  const url = `${supabaseUrl}/functions/v1/polymarket${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey!,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return body as T;
}

async function polymarketDevFallback<T>(apiPath: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${apiPath}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `${apiPath} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function polymarketFetch<T>(functionPath: string, apiPath = functionPath, init?: RequestInit): Promise<T> {
  if (isSupabaseClientConfigured) {
    try {
      return await polymarketPublicFetch<T>(functionPath, init);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[polymarket] remote API failed, trying local /api', e);
        return polymarketDevFallback<T>(apiPath, init);
      }
      throw e;
    }
  }
  if (import.meta.env.DEV) return polymarketDevFallback<T>(apiPath, init);
  throw new Error('Polymarket data unavailable — please try again later');
}

export function fetchPolymarketLeaderboard(type: 'top' | 'rising' = 'top') {
  return polymarketFetch<PolymarketLeaderboardResponse>(
    `/leaderboard?type=${type}`,
    `/polymarket/leaderboard?type=${type}`,
  );
}

export function refreshPolymarketLeaderboard() {
  return polymarketFetch<{ ok: boolean }>('/refresh', '/polymarket/refresh', { method: 'POST' });
}

export function fetchPolymarketPositions(address: string) {
  const enc = encodeURIComponent(address);
  return polymarketFetch<{
    source: 'live' | 'generated';
    positions: unknown[];
    address: string;
    profileUrl: string;
    count: number;
  }>(`/positions/${enc}`, `/copytrade/polymarket/${enc}`);
}

export function resolvePolymarketUsername(username: string) {
  const enc = encodeURIComponent(username.replace(/^@/, ''));
  return polymarketFetch<{
    address: string;
    username: string;
    profileUrl: string;
    error?: string;
  }>(`/resolve/${enc}`, `/copytrade/polymarket/resolve/${enc}`);
}
