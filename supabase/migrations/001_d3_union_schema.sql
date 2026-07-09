-- D3 Shareholder Alliance — wallet_address (0x…) as user primary key
-- Run in Supabase SQL Editor

create extension if not exists "pgcrypto";

-- ── Profiles — wallet is the user id ─────────────────────────────────────────
create table if not exists public.profiles (
  wallet_address text primary key
    check (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  privy_user_id text,
  display_name text,
  short_address text,
  lang text not null default 'zh' check (lang in ('zh', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_wallet_lower_idx on public.profiles (lower(wallet_address));

-- ── Referrals ────────────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  sponsor_wallet_address text references public.profiles (wallet_address) on delete set null,
  referral_type text not null default 'partner'
    check (referral_type in ('partner', 'shareholder')),
  status text not null default 'active'
    check (status in ('pending', 'active', 'inactive')),
  join_tx_hash text,
  referred_at timestamptz not null default now(),
  performance_weight numeric(18, 6) not null default 0,
  unique (wallet_address, sponsor_wallet_address)
);

create index if not exists idx_referrals_sponsor on public.referrals (sponsor_wallet_address);

-- ── Shareholders ─────────────────────────────────────────────────────────────
create table if not exists public.shareholders (
  wallet_address text primary key references public.profiles (wallet_address) on delete cascade,
  is_shareholder boolean not null default false,
  genesis_dt_count integer not null default 0 check (genesis_dt_count >= 0),
  joined_at timestamptz,
  join_fee_usdt numeric(18, 2) not null default 5000,
  join_tx_hash text,
  equity_share_pct numeric(8, 4) not null default 0,
  line_performance_usd numeric(18, 2) not null default 0,
  network_performance_usd numeric(18, 2) not null default 0,
  level_label text not null default '发起人',
  status text not null default 'locked'
    check (status in ('locked', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Union lines ──────────────────────────────────────────────────────────────
create table if not exists public.union_lines (
  id uuid primary key default gen_random_uuid(),
  line_leader_wallet text not null references public.profiles (wallet_address) on delete cascade,
  name text,
  root_wallet text references public.profiles (wallet_address) on delete set null,
  total_members integer not null default 0,
  total_performance_usd numeric(18, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- ── Team nodes ───────────────────────────────────────────────────────────────
create table if not exists public.team_nodes (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.union_lines (id) on delete cascade,
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  parent_node_id uuid references public.team_nodes (id) on delete set null,
  level_label text not null default 'V0',
  personal_usd numeric(18, 2) not null default 0,
  team_usd numeric(18, 2) not null default 0,
  direct_count integer not null default 0,
  team_count integer not null default 0,
  is_direct boolean not null default false,
  created_at timestamptz not null default now(),
  unique (line_id, wallet_address)
);

-- ── Multisig wallets ───────────────────────────────────────────────────────────
create table if not exists public.multisig_wallets (
  id uuid primary key default gen_random_uuid(),
  line_id uuid references public.union_lines (id) on delete cascade,
  wallet_type text not null check (wallet_type in ('line', 'dao')),
  treasury_address text not null,
  short_address text,
  label_zh text,
  label_en text,
  threshold integer not null check (threshold > 0),
  total_signers integer not null check (total_signers >= threshold),
  balance_usd3 numeric(18, 4) not null default 0,
  balance_d3 numeric(18, 6) not null default 0,
  privy_key_quorum_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists multisig_treasury_lower_idx on public.multisig_wallets (lower(treasury_address));

-- ── Committee members ────────────────────────────────────────────────────────
create table if not exists public.committee_members (
  id uuid primary key default gen_random_uuid(),
  multisig_wallet_id uuid not null references public.multisig_wallets (id) on delete cascade,
  signer_wallet text not null
    check (signer_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  role_zh text,
  role_en text,
  is_line_leader boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists committee_signer_idx on public.committee_members (multisig_wallet_id, lower(signer_wallet));

-- ── Multisig proposals & signatures ──────────────────────────────────────────
create table if not exists public.multisig_proposals (
  id uuid primary key default gen_random_uuid(),
  multisig_wallet_id uuid not null references public.multisig_wallets (id) on delete cascade,
  wallet_type text not null check (wallet_type in ('line', 'dao')),
  title_zh text not null,
  title_en text not null,
  desc_zh text,
  desc_en text,
  period_zh text,
  period_en text,
  usd3_amount numeric(18, 4) not null default 0,
  d3_amount numeric(18, 6) not null default 0,
  beneficiary_count integer not null default 0,
  proposer_wallet text,
  status text not null default 'pending'
    check (status in ('pending', 'executed', 'rejected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  executed_at timestamptz,
  tx_hash text
);

create table if not exists public.multisig_signatures (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.multisig_proposals (id) on delete cascade,
  signer_wallet text not null,
  signed_at timestamptz
);

create unique index if not exists multisig_sig_idx on public.multisig_signatures (proposal_id, lower(signer_wallet));

-- ── Asset accounts ───────────────────────────────────────────────────────────
create table if not exists public.usd3_accounts (
  wallet_address text primary key references public.profiles (wallet_address) on delete cascade,
  pending_usd3 numeric(18, 4) not null default 0,
  claimed_lifetime_usd3 numeric(18, 4) not null default 0,
  balance numeric(18, 4) not null default 0,
  available numeric(18, 4) not null default 0,
  self_pool_remaining numeric(18, 4) not null default 0,
  downline_pool_remaining numeric(18, 4) not null default 0,
  moved_to_fi numeric(18, 4) not null default 0,
  transferred_to_downline numeric(18, 4) not null default 0,
  self_quota numeric(18, 4) not null default 0,
  downline_quota numeric(18, 4) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.d3_accounts (
  wallet_address text primary key references public.profiles (wallet_address) on delete cascade,
  pending_d3 numeric(18, 6) not null default 0,
  claimed_lifetime_d3 numeric(18, 6) not null default 0,
  claim_wallet_address text,
  updated_at timestamptz not null default now()
);

create table if not exists public.dividend_accruals (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  asset_type text not null check (asset_type in ('usd3', 'd3')),
  stream_id text not null check (stream_id in ('fees', 'treasury', 'line')),
  amount numeric(18, 6) not null default 0,
  period_label text,
  cycle_type text not null check (cycle_type in ('epoch', 'monthly')),
  status text not null default 'pending'
    check (status in ('pending', 'claimable', 'claimed', 'none')),
  source_zh text,
  source_en text,
  settled_at timestamptz,
  claimed_at timestamptz,
  tx_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_dividend_wallet on public.dividend_accruals (wallet_address, asset_type);

create table if not exists public.usd3_transfers (
  id uuid primary key default gen_random_uuid(),
  from_wallet text not null references public.profiles (wallet_address) on delete cascade,
  to_wallet text references public.profiles (wallet_address) on delete set null,
  to_address text,
  amount numeric(18, 4) not null check (amount > 0),
  transfer_type text not null check (transfer_type in ('to_fi', 'to_downline')),
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed')),
  tx_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.fi_positions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  position_type text not null
    check (position_type in ('lp', 'burn_bond', 'spot', 'governance', 've_lock')),
  asset_pair text,
  principal_usd3 numeric(18, 4),
  principal_d3 numeric(18, 6),
  principal_usdt numeric(18, 2),
  lock_days integer,
  locked_until timestamptz,
  status text not null default 'active'
    check (status in ('active', 'matured', 'withdrawn')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Triggers ─────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists shareholders_updated_at on public.shareholders;
create trigger shareholders_updated_at before update on public.shareholders
  for each row execute function public.set_updated_at();

drop trigger if exists usd3_accounts_updated_at on public.usd3_accounts;
create trigger usd3_accounts_updated_at before update on public.usd3_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists d3_accounts_updated_at on public.d3_accounts;
create trigger d3_accounts_updated_at before update on public.d3_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists fi_positions_updated_at on public.fi_positions;
create trigger fi_positions_updated_at before update on public.fi_positions
  for each row execute function public.set_updated_at();

-- ── RLS: wallet owner reads own rows (via auth.jwt wallet claim or service role) ─
alter table public.profiles enable row level security;
alter table public.referrals enable row level security;
alter table public.shareholders enable row level security;
alter table public.usd3_accounts enable row level security;
alter table public.d3_accounts enable row level security;
alter table public.dividend_accruals enable row level security;
alter table public.fi_positions enable row level security;

create policy "profiles_read_own" on public.profiles for select using (
  lower(wallet_address) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
);

create policy "shareholders_read_own" on public.shareholders for select using (
  lower(wallet_address) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
);

create policy "usd3_read_own" on public.usd3_accounts for select using (
  lower(wallet_address) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
);

create policy "d3_read_own" on public.d3_accounts for select using (
  lower(wallet_address) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
);
