import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  '';

if (!url || !anonKey) {
  console.warn('[d3-multisig] Missing VITE_SUPABASE_URL or publishable key');
}

/** Shared Supabase project (same as main app / admin-panel). Own storage key so
 *  a multisig session doesn't collide with an admin-panel session on the same host. */
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'd3-multisig-supabase-auth',
    detectSessionInUrl: false,
  },
});

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;

export function shortAddr(a: string | null | undefined): string {
  const s = (a ?? '').trim();
  if (s.length < 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export function fmt(n: number | string | null | undefined, digits = 2): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0';
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
