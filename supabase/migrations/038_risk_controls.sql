-- V-09/V-10: Flash-swap risk controls — withdrawal caps, solvency gate,
-- and a system-wide circuit-breaker / pause registry.
--
-- Two singleton-ish config tables read by _shared/riskControls.ts before any
-- flash-swap payout is debited. Both are RLS-locked (default-deny for anon /
-- authenticated); only service_role (used by edge functions) may read/write them.
--
-- Idempotent: create-if-not-exists tables, on-conflict-do-nothing seeds, and
-- guarded grants so re-running is harmless.

-- ---------------------------------------------------------------------------
-- risk_limits: singleton row (id = 1) holding all numeric withdrawal caps.
-- ---------------------------------------------------------------------------
create table if not exists public.risk_limits (
  id integer primary key default 1,
  max_withdraw_per_tx_usdt   numeric(18, 4) not null default 2000,
  max_user_daily_usdt        numeric(18, 4) not null default 5000,
  max_platform_hourly_usdt   numeric(18, 4) not null default 50000,
  min_solvency_ratio         numeric(8, 4)  not null default 1.0,
  updated_at timestamptz not null default now(),
  constraint risk_limits_singleton check (id = 1)
);

insert into public.risk_limits (id, max_withdraw_per_tx_usdt, max_user_daily_usdt, max_platform_hourly_usdt, min_solvency_ratio)
values (1, 2000, 5000, 50000, 1.0)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- system_pause_flags: named circuit-breakers. paused = true stops that surface.
-- ---------------------------------------------------------------------------
create table if not exists public.system_pause_flags (
  flag text primary key,
  paused boolean not null default false,
  reason text null,
  updated_at timestamptz not null default now()
);

insert into public.system_pause_flags (flag, paused) values
  ('flash_swap', false),
  ('deposits', false),
  ('settlement', false),
  ('treasury', false),
  ('rewards', false)
on conflict (flag) do nothing;

-- ---------------------------------------------------------------------------
-- Lock down: RLS default-deny + revoke anon/authenticated, grant service_role.
-- ---------------------------------------------------------------------------
alter table public.risk_limits enable row level security;
alter table public.system_pause_flags enable row level security;

revoke all on public.risk_limits from anon, authenticated;
revoke all on public.system_pause_flags from anon, authenticated;

grant select, insert, update, delete on public.risk_limits to service_role;
grant select, insert, update, delete on public.system_pause_flags to service_role;
