-- Partner program global crowdfund / join treasury (company multisig via Privy)

alter table public.multisig_wallets drop constraint if exists multisig_wallets_wallet_type_check;
alter table public.multisig_wallets add constraint multisig_wallets_wallet_type_check
  check (wallet_type in ('line', 'dao', 'partner'));

alter table public.multisig_proposals drop constraint if exists multisig_proposals_wallet_type_check;
alter table public.multisig_proposals add constraint multisig_proposals_wallet_type_check
  check (wallet_type in ('line', 'dao', 'partner'));

create unique index if not exists multisig_partner_singleton_idx
  on public.multisig_wallets (wallet_type) where wallet_type = 'partner';

insert into public.multisig_wallets (
  id, line_id, wallet_type, treasury_address, short_address, label_zh, label_en,
  threshold, total_signers, balance_usd3, balance_d3
) values (
  '00000000-0000-4000-8000-000000000040',
  null,
  'partner',
  '0x4a8c1f2e9b0d3c6a5f8e7d1c0b9a8f7e6d5c4b3a',
  '0x4a8c…b3a',
  '合伙人众筹金库',
  'Partner crowdfund treasury',
  3,
  5,
  0,
  0
) on conflict (id) do nothing;
