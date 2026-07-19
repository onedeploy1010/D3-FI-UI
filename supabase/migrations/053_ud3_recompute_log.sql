-- UD3 (反向金) RESET + RE-SETTLE audit log.
--
-- The reset/re-settle engine (_shared/ud3Recompute.ts, driven by the treasury
-- `/internal/ud3-resettle` cron route) journals every APPLY run here: which mode
-- ran and the full summary JSON (per-table reset counts + per-intent re-settle
-- results + new UD3 totals). dryrun never writes.
--
-- Idempotent: create-if-not-exists throughout. RLS enabled with no permissive
-- policy = default-deny for anon/authenticated; service_role bypasses RLS so the
-- edge functions (service-role key) keep full access.

create table if not exists public.ud3_reset_log (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  mode text not null check (mode in ('dryrun', 'apply')),
  summary jsonb not null default '{}'::jsonb
);

alter table public.ud3_reset_log enable row level security;

-- Strip any default grants to browser-facing roles; grant only service_role.
revoke all on public.ud3_reset_log from anon, authenticated;
grant all on public.ud3_reset_log to service_role;

-- Recent-runs history lookup.
create index if not exists ud3_reset_log_ran_at_idx
  on public.ud3_reset_log (ran_at desc);

comment on table public.ud3_reset_log is
  'UD3 reset + re-settle run journal. One row per APPLY run; summary holds reset counts + re-settle results.';
