-- UD3 reward engine (档位 + V1~V6 极差). Separate from legacy partner_sd3_* tables.

alter table public.partner_accounts
  add column if not exists ud3_balance numeric(24, 6) not null default 0,
  add column if not exists lifetime_ud3_earned numeric(24, 6) not null default 0,
  add column if not exists ud3_tier_id smallint,
  add column if not exists ud3_v_level smallint;

comment on column public.partner_accounts.ud3_balance is 'Claimable UD3 balance';
comment on column public.partner_accounts.lifetime_ud3_earned is 'Lifetime UD3 earned (direct + differential)';
comment on column public.partner_accounts.ud3_tier_id is 'Cached 档位 1-6 based on total perf';
comment on column public.partner_accounts.ud3_v_level is 'Cached V-level 1-6';

-- Per deposit generation + 60/40 split snapshot
create table if not exists public.partner_ud3_events (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid references public.stake_intents(id) on delete set null,
  depositor_wallet text not null,
  referrer_wallet text not null,
  deposit_usdt numeric(24, 6) not null,
  referrer_total_perf_usdt numeric(24, 6) not null default 0,
  tier_id smallint,
  tier_rate_pct numeric(8, 2) not null default 0,
  generated_ud3 numeric(24, 6) not null,
  direct_ud3 numeric(24, 6) not null,
  network_pool_ud3 numeric(24, 6) not null,
  network_allocated_ud3 numeric(24, 6) not null default 0,
  network_remaining_ud3 numeric(24, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists partner_ud3_events_referrer_idx
  on public.partner_ud3_events (lower(referrer_wallet), created_at desc);
create index if not exists partner_ud3_events_depositor_idx
  on public.partner_ud3_events (lower(depositor_wallet), created_at desc);
create unique index if not exists partner_ud3_events_intent_uidx
  on public.partner_ud3_events (intent_id)
  where intent_id is not null;

-- Ledger lines: direct / differential / catchup remainder
create table if not exists public.partner_ud3_ledger (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.partner_ud3_events(id) on delete cascade,
  recipient_wallet text not null,
  role text not null check (role in ('direct', 'differential', 'reserve')),
  v_level smallint,
  v_share_pct numeric(8, 2),
  gap_pct numeric(8, 2),
  ud3_amount numeric(24, 6) not null,
  created_at timestamptz not null default now()
);

create index if not exists partner_ud3_ledger_recipient_idx
  on public.partner_ud3_ledger (lower(recipient_wallet), created_at desc);
create index if not exists partner_ud3_ledger_event_idx
  on public.partner_ud3_ledger (event_id);

-- Calculation audit log (JSON payloads for simulator / support)
create table if not exists public.partner_ud3_calc_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.partner_ud3_events(id) on delete set null,
  kind text not null default 'settle',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Admin-configurable thresholds (single row)
create table if not exists public.partner_ud3_settings (
  id smallint primary key default 1 check (id = 1),
  tiers jsonb not null default '[]'::jsonb,
  v_levels jsonb not null default '[]'::jsonb,
  direct_share numeric(8, 4) not null default 0.6,
  network_share numeric(8, 4) not null default 0.4,
  plan_min_stake_usdt numeric(24, 6) not null default 100,
  updated_at timestamptz not null default now()
);

insert into public.partner_ud3_settings (id)
values (1)
on conflict (id) do nothing;
