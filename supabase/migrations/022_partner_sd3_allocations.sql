-- Per-event partner sD3 allocation rows (direct / upline split with source wallet)

create table if not exists public.partner_sd3_allocations (
  id uuid primary key default gen_random_uuid(),
  recipient_wallet text not null references public.profiles (wallet_address) on delete cascade,
  source_wallet text not null references public.profiles (wallet_address) on delete cascade,
  settlement_date date not null,
  intent_id uuid null references public.stake_intents (id) on delete set null,
  event_amount_usd numeric(18, 4) not null default 0,
  tier_rate_pct numeric(8, 4) not null default 0,
  reward_share_pct numeric(8, 4) not null default 0,
  role text not null check (role in ('direct', 'upline')),
  sd3_amount numeric(18, 4) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists partner_sd3_allocations_recipient_date_idx
  on public.partner_sd3_allocations (recipient_wallet, settlement_date desc);

create index if not exists partner_sd3_allocations_settlement_date_idx
  on public.partner_sd3_allocations (settlement_date desc);

alter table public.partner_sd3_allocations enable row level security;
