-- Faster deposit pool allocation (available wallets FIFO)

create index if not exists wallet_accounts_deposit_available_idx
  on public.wallet_accounts (created_at asc)
  where wallet_type = 'deposit' and status = 'available';
