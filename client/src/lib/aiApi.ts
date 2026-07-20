import { isSupabaseClientConfigured, supabaseAnonKey, supabaseUrl } from './supabase';

// Client for the D3-AI analytics backend. In production it targets the Supabase
// Edge Function `ai` (…/functions/v1/ai/*); in local dev it falls back to the
// Express router mounted at `/api/*`. Mirrors marketApi/polymarketApi.

export type AiInit = { method?: string; body?: unknown; headers?: HeadersInit };

async function edgeFetch<T>(path: string, init: AiInit): Promise<T> {
  const url = `${supabaseUrl}/functions/v1/ai${path}`;
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey!,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as T;
}

async function devFetch<T>(path: string, init: AiInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `${path} failed: ${res.status}`);
  return data as T;
}

export async function aiFetch<T>(path: string, init: AiInit = {}): Promise<T> {
  if (isSupabaseClientConfigured) {
    try {
      return await edgeFetch<T>(path, init);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[ai] edge API failed, trying local /api', e);
        return devFetch<T>(path, init);
      }
      throw e;
    }
  }
  if (import.meta.env.DEV) return devFetch<T>(path, init);
  throw new Error('AI service unavailable — please try again later');
}
