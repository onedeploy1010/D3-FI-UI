-- Turnkey Payment Orchestration: single HD deposits wallet + derived accounts

alter table public.wallet_accounts drop constraint if exists wallet_accounts_wallet_type_check;
alter table public.wallet_accounts add constraint wallet_accounts_wallet_type_check
  check (wallet_type in ('deposit', 'deposit_hd', 'settlement', 'treasury', 'gas'));

create unique index if not exists wallet_accounts_deposit_hd_uidx
  on public.wallet_accounts (turnkey_wallet_id)
  where wallet_type = 'deposit_hd';

create index if not exists wallet_accounts_deposit_derivation_idx
  on public.wallet_accounts ((metadata->>'derivation_index'))
  where wallet_type = 'deposit' and metadata ? 'derivation_index';
