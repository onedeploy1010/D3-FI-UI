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

insert into public.poc_scores (
  wallet_address, epoch_label, level_label, composite_score, level_diff_rate,
  diff_floor_pct, diff_ceil_pct,
  dim_h, dim_c, dim_a, dim_r, dim_e,
  raw_h_zh, raw_h_en, raw_c_zh, raw_c_en, raw_a_zh, raw_a_en,
  raw_r_zh, raw_r_en, raw_e_zh, raw_e_en, settled_at
) values (
  '0x1234567890AbCdEf1234567890AbCdEf1234567890',
  '#42', 'V5', 78.4, 28.6, 16, 38,
  72, 85, 68, 91, 56,
  '质押 D3 价值 $3,200', 'Staked D3 value $3,200',
  '大区+小区总业绩 $556,400', 'Large+small area $556,400',
  '30天新增 $42,000', '30d new deposits $42,000',
  '续投+未提现比例 91%', 'Renewal + unwithdrawn 91%',
  '新增有效户 12 (≥100U)', '12 new valid (≥100U)',
  '2026-07-06'
) on conflict (wallet_address) do update set
  composite_score = excluded.composite_score,
  level_diff_rate = excluded.level_diff_rate,
  epoch_label = excluded.epoch_label,
  level_label = excluded.level_label;

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

-- Protocol epoch + bribe market (D3-Fi announcements)
insert into public.protocol_epochs (
  epoch_number, label, phase, bribe_pool_added_usd, bribe_pool_tvl_usd,
  monthly_emission_d3, settlement_at, is_current
) values (
  42, '#42', 'voting', 180000, 2400000, 35000,
  now() + interval '5 days 12 hours', true
) on conflict (epoch_number) do update set
  is_current = true,
  bribe_pool_added_usd = excluded.bribe_pool_added_usd,
  bribe_pool_tvl_usd = excluded.bribe_pool_tvl_usd,
  monthly_emission_d3 = excluded.monthly_emission_d3,
  settlement_at = excluded.settlement_at;

update public.protocol_epochs set is_current = false where epoch_number <> 42;

insert into public.bribe_projects (
  id, epoch_number, name, name_zh, gauge, bribe_amount_usd, per_vote_usd,
  deadline_at, status, description_zh, description_en, website, total_votes, voters, sort_order
) values
  ('alpha', 42, 'Project Alpha', 'Alpha 协议', 'D3/USDT LP', 45000, 0.12,
   now() + interval '3 days 14 hours', 'active',
   '跨链流动性聚合协议，寻求 D3 排放以深化 D3/USDT 池深度。',
   'Cross-chain liquidity aggregator seeking D3 emissions to deepen the D3/USDT pool.',
   'https://alpha.example', 375000, 128, 0),
  ('beta', 42, 'Project Beta', 'Beta DeFi', 'D3/BNB LP', 28000, 0.08,
   now() + interval '3 days 14 hours', 'active',
   'BNB 链上借贷市场，通过贿赂争取 Gauge 权重与流动性激励。',
   'BNB Chain lending market competing for Gauge weight and liquidity incentives via bribes.',
   'https://beta.example', 350000, 96, 1),
  ('gamma', 42, 'Project Gamma', 'Gamma Labs', 'D3/ETH LP', 12000, 0.05,
   now() + interval '3 days 14 hours', 'active',
   'ETH 生态衍生品协议，投放 USDT 贿赂换取 veD3 投票支持。',
   'ETH ecosystem derivatives protocol depositing USDT bribes for veD3 voting support.',
   'https://gamma.example', 240000, 64, 2),
  ('delta', 41, 'Project Delta', 'Delta 稳定币', 'D3/USDT LP', 8500, 0.03,
   now() - interval '2 days', 'ended',
   '算法稳定币项目，上 Epoch 贿赂已结算完毕。',
   'Algorithmic stablecoin project; last Epoch bribe fully settled.',
   'https://delta.example', 283000, 82, 3)
on conflict (id) do update set
  bribe_amount_usd = excluded.bribe_amount_usd,
  status = excluded.status,
  epoch_number = excluded.epoch_number;
