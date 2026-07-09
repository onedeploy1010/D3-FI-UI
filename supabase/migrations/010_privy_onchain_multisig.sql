-- Privy on-chain multisig fields

alter table public.multisig_wallets
  add column if not exists privy_wallet_id text;

alter table public.multisig_proposals
  add column if not exists privy_rpc_body jsonb,
  add column if not exists onchain_status text not null default 'off'
    check (onchain_status in ('off', 'awaiting_signatures', 'submitted', 'confirmed', 'failed'));

alter table public.multisig_signatures
  add column if not exists authorization_signature text;

alter table public.committee_members
  add column if not exists privy_auth_key_id text;

comment on column public.multisig_wallets.privy_wallet_id is 'Privy wallet id (treasury owned by key quorum)';
comment on column public.multisig_proposals.privy_rpc_body is 'Privy /v1/wallets/{id}/rpc body all signers must authorize';
comment on column public.multisig_signatures.authorization_signature is 'Base64 Privy authorization signature over privy_rpc_body';
