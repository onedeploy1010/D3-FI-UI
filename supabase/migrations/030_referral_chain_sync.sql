-- On-chain referral binding: block cursor for the Bound/Rebound event backstop sync.
-- The user binds on-chain from their own wallet (pays gas); the backend syncs the
-- ReferralRegistry graph into `referrals` as an index cache.

create table if not exists public.chain_sync_cursors (
  key        text primary key,
  last_block bigint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.chain_sync_cursors is
  'Last processed block per on-chain sync job (e.g. key=referral_registry).';
