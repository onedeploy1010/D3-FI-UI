import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  '';

if (!url || !anonKey) {
  console.warn('[d3-admin] Missing VITE_SUPABASE_URL or publishable key');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'd3-admin-supabase-auth',
    detectSessionInUrl: false,
  },
});

export const w = (a: string | null | undefined) => (a ?? '').toLowerCase();

export function shortAddr(a: string) {
  const s = a.trim();
  if (s.length < 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export function fmtUsd(n: number | string | null | undefined, digits = 2) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0';
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
