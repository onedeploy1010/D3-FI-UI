-- Flash-swap wallet for yield withdrawals + settlement split routing

alter table public.wallet_accounts drop constraint if exists wallet_accounts_wallet_type_check;
alter table public.wallet_accounts add constraint wallet_accounts_wallet_type_check
  check (wallet_type in ('deposit', 'deposit_hd', 'settlement', 'treasury', 'gas', 'flash_swap'));

alter table public.sweep_jobs drop constraint if exists sweep_jobs_job_type_check;
alter table public.sweep_jobs add constraint sweep_jobs_job_type_check
  check (job_type in (
    'deposit_to_settlement',
    'settlement_to_treasury',
    'settlement_to_flash_swap',
    'yield_flash_withdraw'
  ));

alter table public.treasury_ledger drop constraint if exists treasury_ledger_ledger_type_check;
alter table public.treasury_ledger add constraint treasury_ledger_ledger_type_check
  check (ledger_type in (
    'deposit_credit',
    'sweep_to_settlement',
    'settlement_to_treasury',
    'settlement_to_flash_swap',
    'yield_flash_withdraw',
    'adjustment',
    'refund'
  ));

create table if not exists public.partner_yield_withdrawals (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  amount_usdt numeric(18, 4) not null,
  status text not null default 'pending'
    check (status in ('pending', 'signing', 'broadcasted', 'confirmed', 'failed', 'manual_review')),
  tx_hash text null,
  sweep_job_id uuid null references public.sweep_jobs (id) on delete set null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_yield_withdrawals_wallet_idx
  on public.partner_yield_withdrawals (wallet_address, created_at desc);

drop trigger if exists partner_yield_withdrawals_updated_at on public.partner_yield_withdrawals;
create trigger partner_yield_withdrawals_updated_at before update on public.partner_yield_withdrawals
  for each row execute function public.set_updated_at();

alter table public.partner_yield_withdrawals enable row level security;

alter table public.sweep_jobs
  add column if not exists reference_id uuid null;
