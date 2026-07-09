-- Demo seed — wallet_address as primary key

insert into public.profiles (wallet_address, short_address, display_name, lang) values
  ('0x1234567890AbCdEf1234567890AbCdEf1234567890', '0x1234…7890', 'Demo Line Leader', 'zh'),
  ('0xAbCdEf1234567890AbCdEf1234567890AbCdEf01', '0xAbCd…Ef01', 'Committee A', 'zh'),
  ('0x9876543210FeDcBa9876543210FeDcBa98765432', '0x9876…5432', 'Committee B', 'zh')
on conflict (wallet_address) do update set display_name = excluded.display_name;

insert into public.shareholders (
  wallet_address, is_shareholder, genesis_dt_count, joined_at, join_fee_usdt,
  equity_share_pct, line_performance_usd, network_performance_usd, level_label, status
) values (
  '0x1234567890AbCdEf1234567890AbCdEf1234567890', true, 1, '2026-07-08', 5000,
  2.24, 286400, 12800000, '发起人', 'active'
) on conflict (wallet_address) do update set
  is_shareholder = excluded.is_shareholder,
  equity_share_pct = excluded.equity_share_pct,
  line_performance_usd = excluded.line_performance_usd;

insert into public.union_lines (id, line_leader_wallet, root_wallet, name, total_members, total_performance_usd)
values (
  '00000000-0000-4000-8000-000000000010',
  '0x1234567890AbCdEf1234567890AbCdEf1234567890',
  '0x1234567890AbCdEf1234567890AbCdEf1234567890',
  '主线 Alpha', 48, 286400
) on conflict (id) do nothing;

insert into public.usd3_accounts (
  wallet_address, pending_usd3, claimed_lifetime_usd3, balance, available,
  self_pool_remaining, downline_pool_remaining, moved_to_fi, transferred_to_downline,
  self_quota, downline_quota
) values (
  '0x1234567890AbCdEf1234567890AbCdEf1234567890',
  186.4, 1240, 320, 320, 120, 200, 500, 420, 620, 620
) on conflict (wallet_address) do update set
  pending_usd3 = excluded.pending_usd3,
  balance = excluded.balance;

insert into public.d3_accounts (wallet_address, pending_d3, claimed_lifetime_d3, claim_wallet_address)
values (
  '0x1234567890AbCdEf1234567890AbCdEf1234567890', 12.8, 86.4,
  '0x1234567890AbCdEf1234567890AbCdEf1234567890'
) on conflict (wallet_address) do update set pending_d3 = excluded.pending_d3;

insert into public.multisig_wallets (
  id, line_id, wallet_type, treasury_address, short_address, label_zh, label_en,
  threshold, total_signers, balance_usd3, balance_d3
) values (
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000010',
  'line',
  '0x7a3f8c2e1b9d4a6f0e5c8b2d1a9f7e4c3b6d8a1f',
  '0x7a3f…a1f', '本线收益金库', 'Line treasury', 2, 3, 4280, 186.4
) on conflict (id) do nothing;

insert into public.committee_members (multisig_wallet_id, signer_wallet, role_zh, role_en, is_line_leader, sort_order)
values
  ('00000000-0000-4000-8000-000000000020', '0x1234567890AbCdEf1234567890AbCdEf1234567890', '线长', 'Line leader', true, 0),
  ('00000000-0000-4000-8000-000000000020', '0xAbCdEf1234567890AbCdEf1234567890AbCdEf01', '委员 A', 'Committee A', false, 1),
  ('00000000-0000-4000-8000-000000000020', '0x9876543210FeDcBa9876543210FeDcBa98765432', '委员 B', 'Committee B', false, 2);
