-- Turnkey treasury infrastructure: deposit → settlement → treasury (BSC USDT)

-- ── Wallet accounts ───────────────────────────────────────────────────────────
create table if not exists public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  wallet_address text null references public.profiles (wallet_address) on delete set null,
  batch_id uuid null,
  turnkey_wallet_id text not null,
  turnkey_wallet_account_id text null,
  address text not null,
  chain_id integer not null,
  chain_name text not null default 'bsc',
  token_symbol text not null default 'USDT',
  token_contract text not null,
  wallet_type text not null check (wallet_type in ('deposit', 'settlement', 'treasury', 'gas')),
  status text not null default 'available'
    check (status in ('available', 'assigned', 'active', 'sweeping', 'settled', 'archived', 'frozen')),
  assigned_at timestamptz null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wallet_accounts_address_chain_uidx
  on public.wallet_accounts (lower(address), chain_id);

create index if not exists wallet_accounts_type_status_idx
  on public.wallet_accounts (wallet_type, status);

create index if not exists wallet_accounts_wallet_batch_idx
  on public.wallet_accounts (wallet_address, batch_id)
  where wallet_type = 'deposit';

-- ── Stake / join intents ──────────────────────────────────────────────────────
create table if not exists public.stake_intents (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  intent_type text not null check (intent_type in ('partner_join', 'crowdfund_stake')),
  amount_usdt numeric(18, 4) not null,
  deposit_wallet_id uuid null references public.wallet_accounts (id) on delete set null,
  status text not null default 'awaiting_payment'
    check (status in (
      'awaiting_payment', 'detected', 'confirmed', 'credited',
      'sweep_pending', 'sweeping', 'completed', 'expired', 'failed', 'suspicious'
    )),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stake_intents_wallet_status_idx
  on public.stake_intents (wallet_address, status);

-- ── Deposit records ───────────────────────────────────────────────────────────
create table if not exists public.deposit_records (
  id uuid primary key default gen_random_uuid(),
  wallet_address text null references public.profiles (wallet_address) on delete set null,
  batch_id uuid null,
  intent_id uuid null references public.stake_intents (id) on delete set null,
  deposit_wallet_id uuid not null references public.wallet_accounts (id),
  deposit_address text not null,
  chain_id integer not null,
  token_symbol text not null default 'USDT',
  token_contract text not null,
  expected_amount numeric(36, 18) not null,
  received_amount numeric(36, 18) not null default 0,
  tx_hash text null,
  confirmations integer not null default 0,
  status text not null default 'pending'
    check (status in (
      'pending', 'detected', 'confirmed', 'credited',
      'sweep_pending', 'swept', 'failed', 'suspicious'
    )),
  detected_at timestamptz null,
  confirmed_at timestamptz null,
  credited_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists deposit_records_tx_hash_uidx
  on public.deposit_records (chain_id, lower(tx_hash))
  where tx_hash is not null;

-- ── Sweep jobs ────────────────────────────────────────────────────────────────
create table if not exists public.sweep_jobs (
  id uuid primary key default gen_random_uuid(),
  from_wallet_id uuid not null references public.wallet_accounts (id),
  from_address text not null,
  to_wallet_id uuid not null references public.wallet_accounts (id),
  to_address text not null,
  chain_id integer not null,
  token_symbol text not null default 'USDT',
  token_contract text not null,
  amount numeric(36, 18) not null,
  gas_wallet_id uuid null references public.wallet_accounts (id),
  tx_hash text null,
  job_type text not null check (job_type in ('deposit_to_settlement', 'settlement_to_treasury')),
  status text not null default 'queued'
    check (status in ('queued', 'signing', 'broadcasted', 'confirmed', 'failed', 'manual_review')),
  retry_count integer not null default 0,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Treasury ledger ───────────────────────────────────────────────────────────
create table if not exists public.treasury_ledger (
  id uuid primary key default gen_random_uuid(),
  ledger_type text not null check (ledger_type in (
    'deposit_credit', 'sweep_to_settlement', 'settlement_to_treasury', 'adjustment', 'refund'
  )),
  wallet_address text null references public.profiles (wallet_address) on delete set null,
  batch_id uuid null,
  wallet_id uuid null references public.wallet_accounts (id),
  chain_id integer not null,
  token_symbol text not null default 'USDT',
  amount numeric(36, 18) not null,
  direction text not null check (direction in ('debit', 'credit')),
  tx_hash text null,
  reference_id uuid null,
  status text not null default 'posted',
  created_at timestamptz not null default now()
);

-- ── Audit logs ────────────────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('system', 'admin', 'turnkey_policy', 'webhook')),
  actor_id text null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  old_value jsonb null,
  new_value jsonb null,
  ip_address text null,
  created_at timestamptz not null default now()
);

-- ── updated_at triggers ───────────────────────────────────────────────────────
drop trigger if exists wallet_accounts_updated_at on public.wallet_accounts;
create trigger wallet_accounts_updated_at before update on public.wallet_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists stake_intents_updated_at on public.stake_intents;
create trigger stake_intents_updated_at before update on public.stake_intents
  for each row execute function public.set_updated_at();

drop trigger if exists deposit_records_updated_at on public.deposit_records;
create trigger deposit_records_updated_at before update on public.deposit_records
  for each row execute function public.set_updated_at();

drop trigger if exists sweep_jobs_updated_at on public.sweep_jobs;
create trigger sweep_jobs_updated_at before update on public.sweep_jobs
  for each row execute function public.set_updated_at();

-- ── RLS: users see only own deposit intents; never settlement/treasury wallets ─
alter table public.wallet_accounts enable row level security;
alter table public.stake_intents enable row level security;
alter table public.deposit_records enable row level security;
alter table public.treasury_ledger enable row level security;
alter table public.sweep_jobs enable row level security;
alter table public.audit_logs enable row level security;

-- Service role bypasses RLS; anon/authenticated blocked by default (edge functions use service role)

create policy "stake_intents_read_own" on public.stake_intents for select using (false);
create policy "deposit_records_read_own" on public.deposit_records for select using (false);
create policy "wallet_accounts_no_public_deposit" on public.wallet_accounts for select using (false);
