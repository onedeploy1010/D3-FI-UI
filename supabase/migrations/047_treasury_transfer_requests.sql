-- Treasury transfer requests — outbound transfers from the 2/3 multisig treasury.
--
-- The admin fund-management page (POST /treasury/transfer) records one row per
-- proposed transfer and submits a Turnkey SIGN_TRANSACTION activity. Because the
-- treasury wallet is guarded by a 2/3 consensus policy, the activity returns
-- CONSENSUS_NEEDED and the row sits in `awaiting_consensus` until 2 of 3 root
-- signers approve it in the Turnkey panel. The admin then hits
-- POST /treasury/transfers/{id}/broadcast which polls the activity, and once
-- approved broadcasts the signed tx and records the hash.
--
-- Lifecycle of `status`:
--   awaiting_consensus -> broadcast -> confirmed        (multisig happy path)
--   awaiting_consensus -> failed                        (rejected / expired)
--   submitted -> confirmed                              (dev single-signer path)
--
-- Idempotent create-if-not-exists. RLS enabled, no permissive policy =
-- default-deny for anon/authenticated; service_role (edge functions) bypasses RLS.

create table if not exists public.treasury_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  asset text not null
    check (asset in ('usdt', 'bnb')),
  to_address text not null,
  amount numeric not null
    check (amount > 0),
  from_wallet_id uuid,
  from_address text,
  turnkey_activity_id text,
  status text not null default 'awaiting_consensus'
    check (status in ('awaiting_consensus', 'submitted', 'broadcast', 'confirmed', 'failed')),
  tx_hash text,
  note text,
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  broadcast_at timestamptz
);

alter table public.treasury_transfer_requests enable row level security;

revoke all on public.treasury_transfer_requests from anon, authenticated;
grant all on public.treasury_transfer_requests to service_role;

-- Recent-first listing for the admin fund-management view.
create index if not exists treasury_transfer_requests_created_idx
  on public.treasury_transfer_requests (created_at desc);

-- Fast lookup of the still-pending queue.
create index if not exists treasury_transfer_requests_pending_idx
  on public.treasury_transfer_requests (status)
  where status in ('awaiting_consensus', 'submitted', 'broadcast');

comment on table public.treasury_transfer_requests is
  'Outbound treasury transfers proposed from the admin panel; each maps to a Turnkey SIGN_TRANSACTION activity awaiting 2/3 multisig approval before broadcast.';
