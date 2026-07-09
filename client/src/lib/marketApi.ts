import { isSupabaseClientConfigured, supabaseAnonKey, supabaseUrl } from './supabase';

function requireSupabase() {
  if (!isSupabaseClientConfigured || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY');
  }
}

/** Public market reads via Supabase Edge Function `market` (CoinGecko live data). */
export async function marketPublicFetch<T>(path: string): Promise<T> {
  requireSupabase();
  const url = `${supabaseUrl}/functions/v1/market${path}`;
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

/** Dev fallback when Supabase env is missing — local Express `/api`. */
async function marketDevFallback<T>(apiPath: string): Promise<T> {
  const res = await fetch(`/api${apiPath}`);
  if (!res.ok) throw new Error(`${apiPath} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function marketFetch<T>(functionPath: string, apiPath = functionPath): Promise<T> {
  if (isSupabaseClientConfigured) {
    try {
      return await marketPublicFetch<T>(functionPath);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[market] Supabase failed, trying local /api', e);
        return marketDevFallback<T>(apiPath);
      }
      throw e;
    }
  }
  if (import.meta.env.DEV) return marketDevFallback<T>(apiPath);
  throw new Error('Market API unavailable — configure VITE_SUPABASE_URL');
}
