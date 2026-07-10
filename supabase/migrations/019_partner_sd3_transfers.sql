-- Partner sD3 transfers between sponsor and downline members

create table if not exists public.partner_sd3_transfers (
  id uuid primary key default gen_random_uuid(),
  from_wallet text not null references public.profiles (wallet_address) on delete cascade,
  to_wallet text not null references public.profiles (wallet_address) on delete cascade,
  amount_sd3 numeric(18, 4) not null check (amount_sd3 > 0),
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists partner_sd3_transfers_from_idx
  on public.partner_sd3_transfers (from_wallet, created_at desc);

create index if not exists partner_sd3_transfers_to_idx
  on public.partner_sd3_transfers (to_wallet, created_at desc);

alter table public.partner_sd3_transfers enable row level security;
