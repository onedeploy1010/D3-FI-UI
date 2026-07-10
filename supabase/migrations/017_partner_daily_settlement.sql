-- Partner daily USDT yield + sD3 (bribe) settlement

create table if not exists public.partner_accounts (
  wallet_address text primary key references public.profiles (wallet_address) on delete cascade,
  is_partner boolean not null default false,
  sd3_balance numeric(18, 4) not null default 0,
  pending_usdt_yield numeric(18, 4) not null default 0,
  lifetime_sd3_earned numeric(18, 4) not null default 0,
  lifetime_usdt_yield numeric(18, 4) not null default 0,
  joined_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_stake_positions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  intent_id uuid not null references public.stake_intents (id) on delete cascade,
  kind text not null check (kind in ('partner_join', 'crowdfund_stake')),
  principal_usdt numeric(18, 4) not null,
  daily_yield_usdt numeric(18, 6) not null,
  accrued_yield_usdt numeric(18, 4) not null default 0,
  claimed_yield_usdt numeric(18, 4) not null default 0,
  started_at timestamptz not null,
  unlock_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists partner_stake_positions_intent_uidx
  on public.partner_stake_positions (intent_id);

create index if not exists partner_stake_positions_wallet_active_idx
  on public.partner_stake_positions (wallet_address, status);

create table if not exists public.partner_yield_settlements (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  position_id uuid not null references public.partner_stake_positions (id) on delete cascade,
  settlement_date date not null,
  principal_usdt numeric(18, 4) not null,
  daily_rate_pct numeric(8, 4) not null,
  yield_usdt numeric(18, 4) not null,
  created_at timestamptz not null default now()
);

create unique index if not exists partner_yield_settlements_position_date_uidx
  on public.partner_yield_settlements (position_id, settlement_date);

create table if not exists public.partner_sd3_settlements (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  settlement_date date not null,
  team_performance_usd numeric(18, 4) not null default 0,
  daily_new_performance_usd numeric(18, 4) not null default 0,
  tier_rate_pct numeric(8, 4) not null default 0,
  sd3_amount numeric(18, 4) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists partner_sd3_settlements_wallet_date_uidx
  on public.partner_sd3_settlements (wallet_address, settlement_date);

create table if not exists public.partner_settlement_runs (
  settlement_date date primary key,
  status text not null default 'completed' check (status in ('running', 'completed', 'failed')),
  yield_rows integer not null default 0,
  sd3_rows integer not null default 0,
  error_message text null,
  ran_at timestamptz not null default now()
);

drop trigger if exists partner_accounts_updated_at on public.partner_accounts;
create trigger partner_accounts_updated_at before update on public.partner_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists partner_stake_positions_updated_at on public.partner_stake_positions;
create trigger partner_stake_positions_updated_at before update on public.partner_stake_positions
  for each row execute function public.set_updated_at();

alter table public.partner_accounts enable row level security;
alter table public.partner_stake_positions enable row level security;
alter table public.partner_yield_settlements enable row level security;
alter table public.partner_sd3_settlements enable row level security;
alter table public.partner_settlement_runs enable row level security;
