-- Demo seed — wallet_address as primary key

insert into public.profiles (wallet_address, short_address, display_name, lang)
select v.wallet_address, v.short_address, v.display_name, v.lang
from (values
  ('0x1234567890abcdef1234567890abcdef12345678', '0x1234…5678', 'Demo Line Leader', 'zh'),
  ('0xabcdef1234567890abcdef1234567890abcdef01', '0xAbCd…Ef01', 'Committee A', 'zh'),
  ('0x9876543210fedcba9876543210fedcba98765432', '0x9876…5432', 'Committee B', 'zh')
) as v(wallet_address, short_address, display_name, lang)
where not exists (
  select 1 from public.profiles p where lower(p.wallet_address) = lower(v.wallet_address)
);

insert into public.shareholders (
  wallet_address, is_shareholder, genesis_dt_count, joined_at, join_fee_usdt,
  equity_share_pct, line_performance_usd, network_performance_usd, level_label, status
) values (
  '0x1234567890abcdef1234567890abcdef12345678', true, 1, '2026-07-08', 5000,
  2.24, 286400, 12800000, '发起人', 'active'
) on conflict (wallet_address) do update set
  is_shareholder = excluded.is_shareholder,
  equity_share_pct = excluded.equity_share_pct,
  line_performance_usd = excluded.line_performance_usd;

insert into public.union_lines (id, line_leader_wallet, root_wallet, name, total_members, total_performance_usd)
values (
  '00000000-0000-4000-8000-000000000010',
  '0x1234567890abcdef1234567890abcdef12345678',
  '0x1234567890abcdef1234567890abcdef12345678',
  '主线 Alpha', 48, 286400
) on conflict (id) do nothing;

insert into public.usd3_accounts (
  wallet_address, pending_usd3, claimed_lifetime_usd3, balance, available,
  self_pool_remaining, downline_pool_remaining, moved_to_fi, transferred_to_downline,
  self_quota, downline_quota
) values (
  '0x1234567890abcdef1234567890abcdef12345678',
  186.4, 1240, 320, 320, 120, 200, 500, 420, 620, 620
) on conflict (wallet_address) do update set
  pending_usd3 = excluded.pending_usd3,
  balance = excluded.balance;

insert into public.d3_accounts (wallet_address, pending_d3, claimed_lifetime_d3, claim_wallet_address)
values (
  '0x1234567890abcdef1234567890abcdef12345678', 12.8, 86.4,
  '0x1234567890abcdef1234567890abcdef12345678'
) on conflict (wallet_address) do update set pending_d3 = excluded.pending_d3;

insert into public.poc_scores (
  wallet_address, epoch_label, level_label, composite_score, level_diff_rate,
  diff_floor_pct, diff_ceil_pct,
  dim_h, dim_c, dim_a, dim_r, dim_e,
  raw_h_zh, raw_h_en, raw_c_zh, raw_c_en, raw_a_zh, raw_a_en,
  raw_r_zh, raw_r_en, raw_e_zh, raw_e_en, settled_at
) values (
  '0x1234567890abcdef1234567890abcdef12345678',
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
  -- Demo placeholder only; production lines get a unique Privy treasury on shareholder join / profile load
  '0x7a3f8c2e1b9d4a6f0e5c8b2d1a9f7e4c3b6d8a1f',
  '0x7a3f…a1f', '本线收益金库', 'Line treasury', 2, 3, 4280, 186.4
) on conflict (id) do nothing;

insert into public.committee_members (multisig_wallet_id, signer_wallet, role_zh, role_en, is_line_leader, sort_order, dividend_weight_pct)
select v.multisig_wallet_id, v.signer_wallet, v.role_zh, v.role_en, v.is_line_leader, v.sort_order, v.dividend_weight_pct
from (values
  ('00000000-0000-4000-8000-000000000020'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '线长', 'Line leader', true, 0, 40),
  ('00000000-0000-4000-8000-000000000020'::uuid, '0xabcdef1234567890abcdef1234567890abcdef01', '委员 A', 'Committee A', false, 1, 35),
  ('00000000-0000-4000-8000-000000000020'::uuid, '0x9876543210fedcba9876543210fedcba98765432', '委员 B', 'Committee B', false, 2, 25)
) as v(multisig_wallet_id, signer_wallet, role_zh, role_en, is_line_leader, sort_order, dividend_weight_pct)
where not exists (
  select 1 from public.committee_members cm
  where cm.multisig_wallet_id = v.multisig_wallet_id
    and lower(cm.signer_wallet) = lower(v.signer_wallet)
);

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

-- ── Reference data (replaces protocolData / rewardData / unionData mocks) ─────

insert into public.v_level_tiers (level_label, personal_req, large_area_req, small_area_req, diff_range, sort_order) values
  ('V1', '200U', '3,000U', '—', '3%–10%', 0),
  ('V3', '1,000U', '60,000U', '—', '8%–22%', 1),
  ('V5', '3,000U', '400,000U', '120,000U', '16%–38%', 2),
  ('V7', '7,000U', '3,000,000U', '900,000U', '25%–55%', 3),
  ('V12', '50,000U', '300,000,000U', '90,000,000U', '50%–85%', 4)
on conflict (level_label) do update set
  personal_req = excluded.personal_req,
  large_area_req = excluded.large_area_req,
  small_area_req = excluded.small_area_req,
  diff_range = excluded.diff_range;

insert into public.gauges (id, epoch_number, name, bribe_usd, apy_label, pool_weight_label, emission_share_label, lp_fees_usd, sort_order) values
  ('usdt', 42, 'D3/USDT LP', 45000, '24.5%', '35%', '38%', 12400, 0),
  ('bnb', 42, 'D3/BNB LP', 28000, '18.2%', '22%', '24%', 8100, 1),
  ('eth', 42, 'D3/ETH LP', 12000, '15.8%', '15%', '16%', 4200, 2)
on conflict (id) do update set
  bribe_usd = excluded.bribe_usd,
  apy_label = excluded.apy_label;

insert into public.protocol_config (key, value_json, label_zh, label_en) values
  ('referral_reward_rate', '0.3', '推荐奖励总比例', 'Referral reward rate'),
  ('referral_dusd_self_rate', '0.15', '推荐自留比例', 'Referral self rate'),
  ('referral_dusd_transferable_rate', '0.15', '推荐可转让比例', 'Referral transferable rate'),
  ('union_join_fee_usdt', '5000', '股东入盟费用', 'Shareholder join fee'),
  ('union_self_share', '0.5', 'UD3 自留份额', 'UD3 self share'),
  ('union_transferable_share', '0.5', 'UD3 可转让份额', 'UD3 transferable share')
on conflict (key) do update set value_json = excluded.value_json;

insert into public.reward_stream_docs (id, title_zh, title_en, asset_zh, asset_en, where_zh, where_en, desc_zh, desc_en, sort_order) values
  ('governance', '治理分红', 'Governance dividends', 'USDT', 'USDT', '收益 → 总览', 'Earn → Overview', 'veD3 投票：贿赂 + LP 手续费 + DT 权重分红等，结算后以 USDT 直接领取到钱包。与推荐奖励无关。', 'veD3 votes: bribes, LP fees, DT weight share, etc. — claimed as USDT directly to your wallet. Not referral rewards.', 0),
  ('static', '静态质押收益', 'Static yield', 'D3', 'D3', '收益 → 总览', 'Earn → Overview', '按锁仓期限与全网质押率计算日化；30 天线性释放。', 'Daily yield by lock period & network stake rate; 30d linear vesting.', 1),
  ('poc', '动态 · PoC 级差', 'Dynamic · PoC diff.', 'D3 / USDT', 'D3 / USDT', '我的 → 推荐 / 收益', 'Me → Refer / Earn', '下级动态收益 × 你的实际级差（V 级门槛 + PoC 决定）。180 天线性释放。', 'Downline dynamic × your rate (V level + PoC). 180d linear vesting.', 2),
  ('pon', '动态 · PoN 算力奖', 'Dynamic · PoN bonus', 'D3 / USDT', 'D3 / USDT', '我的 → 推荐 / 收益', 'Me → Refer / Earn', '(个人小区算力 ÷ 全网算力) × 递减系数 × PoN 池；与级差叠加。', '(Your small-area hashpower ÷ network) × decay × PoN pool; stacks with PoC diff.', 3),
  ('referral', '推荐奖励（入金 30%）', 'Referral (30% of entry)', '100% UD3', '100% UD3', '推荐页 + 资产 → UD3', 'Refer tab + Assets → UD3', '下级入金的 30% 全部以 UD3 入账，用于质押投资，不可提现。其中 15% 自留 + 15% 可转让直推下线。', '30% of downline entry paid entirely in UD3 for staking/investment — not withdrawable. 15% self + 15% transferable to direct downline.', 4),
  ('dusd', 'UD3 推荐份额', 'UD3 referral share', 'UD3（入金 30%）', 'UD3 (30% of entry)', '资产 → UD3', 'Assets → UD3', '推荐奖励全部记入 UD3 余额；可转让额度仅来自其中 15%，且只能转给直推下线用于质押。', 'All referral rewards credit as UD3; transferable quota is the 15% slice only, to direct downline for staking.', 5)
on conflict (id) do nothing;

insert into public.union_equity_items (key, pct, zh, en, rule_zh, rule_en, sort_order) values
  ('team', 35, '初创核心团队', 'Core team', '锁仓 4 年线性释放', '4y linear vesting', 0),
  ('contrib', 10, '业绩贡献者', 'Top contributors', '合伙人线业绩排名 4/3/2/1%', 'Line performance ranks', 1),
  ('refer', 5, '推荐合伙人', 'Partner referral', '推荐新合伙人入线加权', 'New partner referral weight', 2),
  ('perf', 40, '业绩加权（全员）', 'Performance pool', '按全网真实业绩比例动态分配', 'By network real performance', 3),
  ('dao', 10, '协议 DAO 储备', 'Protocol DAO', '多签控制生态扩张', 'Multisig ecosystem reserve', 4)
on conflict (key) do nothing;

insert into public.union_revenue_items (id, zh, en, source_zh, source_en, cycle_zh, cycle_en, usd3_zh, usd3_en, d3_zh, d3_en, sort_order) values
  ('fees', '手续费收入', 'Trading fees', '买入 3% + 卖出 3% 滑点，按权益比例分配', '3% buy + 3% sell slippage, by equity share', '每 Epoch（30 天）结算', 'Per Epoch (30 days)', '结算为 UD3 资产', 'Settled as UD3', '同期权益折算 D3 份额', 'D3 share by equity weight', 0),
  ('treasury', '市值管理收入', 'Treasury yield', '国库自营做市套利 + 贿赂佣金 10% 分配部分', 'Treasury MM arb + 10% bribe commission share', '每月多签分配', 'Monthly multisig', '套利与佣金 · 结算为 UD3', 'Arb & commission · settled as UD3', '排放层 / 国库 D3 结算', 'Emission / treasury D3 settlement', 1),
  ('line', '分线收益', 'Line revenue', '本线 Gauge 运营 + 贿赂抽成 + 本线手续费', 'Line Gauge ops + bribe cut + line fees', '每月线长多签发放', 'Monthly line-leader multisig', '本线手续费与贿赂 · 结算为 UD3', 'Line fees & bribe · settled as UD3', '本线排放引导 D3', 'Line-guided D3 emission', 2)
on conflict (id) do nothing;

insert into public.union_rule_cards (id, title_zh, title_en, body_zh, body_en, tag_zh, tag_en, accent, sort_order) values
  ('qualify', '股东资格', 'Qualification', '支付 5,000 USDT 认购创世 DT，成为发起人股东，解锁资产与团队。', 'Pay 5,000 USDT for Genesis DT to become a founding shareholder and unlock Assets & Team.', '入盟门槛', 'Entry', '#E0568F', 0),
  ('channels', '业绩分红', 'Performance dividends', 'UD3 协议内资产 + D3 链上代币，两条独立结算通道，分别入账。', 'UD3 in-app asset and D3 on-chain token — two separate settlement channels.', '双通道', 'Dual channel', '#6366f1', 1),
  ('usd3-source', 'UD3 来源', 'UD3 sources', '手续费滑点（每 Epoch 30 天）+ 市值管理 + 分线收益，统一结算为 UD3 协议资产。', 'Trading fees (per 30-day Epoch) + treasury yield + line revenue — settled as UD3.', '协议内', 'In-app', '#22c55e', 2),
  ('usd3-use', 'UD3 用途', 'UD3 usage', '50% 转入 D3-Fi 投资质押，50% 可转给伞下线的 D3-Fi 账户；不可提现到钱包。', '50% to D3-Fi staking, 50% transferable to downline D3-Fi — not withdrawable to wallet.', '50 / 50', '50 / 50', '#f59e0b', 3),
  ('d3', 'D3 分红', 'D3 dividends', '按权益占比折算的代币分红，链上透明结算，每月由多签 / 线长复核发放。', 'Equity-weighted token dividends — on-chain, distributed monthly via multisig.', '链上', 'On-chain', '#B23A6E', 4),
  ('principle', '分红原则', 'Core rule', '有业绩才有分红，无业绩不保底。所有分配与全网真实业绩挂钩。', 'Performance required — no floor guarantee. All payouts tied to real network results.', '底线', 'No floor', '#8A2B57', 5)
on conflict (id) do nothing;

-- Team member profiles + referrals
insert into public.profiles (wallet_address, short_address, display_name, lang)
select v.wallet_address, v.short_address, v.display_name, v.lang
from (values
  ('0x1111222233334444555566667777888899990000', '0x1111…0000', 'Direct A3', 'zh'),
  ('0xaaaabbbbccccddddeeeeffff0011223344556677', '0xAAaa…6677', 'Downline B1', 'zh'),
  ('0xbb11223344556677889900aabbccddeeff001122', '0xBb11…1122', 'Downline B2', 'zh')
) as v(wallet_address, short_address, display_name, lang)
where not exists (
  select 1 from public.profiles p where lower(p.wallet_address) = lower(v.wallet_address)
);

insert into public.referrals (wallet_address, sponsor_wallet_address, referral_type, status) values
  ('0xabcdef1234567890abcdef1234567890abcdef01', '0x1234567890abcdef1234567890abcdef12345678', 'shareholder', 'active'),
  ('0x9876543210fedcba9876543210fedcba98765432', '0x1234567890abcdef1234567890abcdef12345678', 'shareholder', 'active'),
  ('0x1111222233334444555566667777888899990000', '0x1234567890abcdef1234567890abcdef12345678', 'partner', 'active'),
  ('0x1234567890abcdef1234567890abcdef12345678', '0xabcdef1234567890abcdef1234567890abcdef01', 'partner', 'active')
on conflict (wallet_address, sponsor_wallet_address) do nothing;

-- Team tree for demo line leader
insert into public.team_nodes (
  id, line_id, wallet_address, parent_node_id, level_label,
  personal_usd, team_usd, direct_count, team_count, is_direct
) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000010', '0x1234567890abcdef1234567890abcdef12345678', null, 'V5', 3200, 286400, 3, 48, false),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000010', '0xabcdef1234567890abcdef1234567890abcdef01', '00000000-0000-4000-8000-000000000101', 'V3', 1100, 98000, 2, 18, true),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000010', '0x9876543210fedcba9876543210fedcba98765432', '00000000-0000-4000-8000-000000000101', 'V2', 2400, 72000, 2, 14, true),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000010', '0x1111222233334444555566667777888899990000', '00000000-0000-4000-8000-000000000101', 'V1', 200, 41400, 1, 12, true),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000010', '0xaaaabbbbccccddddeeeeffff0011223344556677', '00000000-0000-4000-8000-000000000102', 'V1', 280, 42000, 0, 8, false),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000010', '0xbb11223344556677889900aabbccddeeff001122', '00000000-0000-4000-8000-000000000102', 'V2', 450, 18000, 0, 5, false)
on conflict (id) do update set
  line_id = excluded.line_id,
  wallet_address = excluded.wallet_address,
  parent_node_id = excluded.parent_node_id,
  level_label = excluded.level_label,
  personal_usd = excluded.personal_usd,
  team_usd = excluded.team_usd;

-- DAO multisig wallet
insert into public.multisig_wallets (
  id, line_id, wallet_type, treasury_address, short_address, label_zh, label_en,
  threshold, total_signers, balance_usd3, balance_d3
) values (
  '00000000-0000-4000-8000-000000000030',
  null,
  'dao',
  '0x9e2d1c0b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d',
  '0x9e2d…e3d', '协议 DAO 储备', 'Protocol DAO reserve', 3, 5, 128400, 4200
) on conflict (id) do nothing;

insert into public.committee_members (multisig_wallet_id, signer_wallet, role_zh, role_en, is_line_leader, sort_order)
select v.multisig_wallet_id, v.signer_wallet, v.role_zh, v.role_en, v.is_line_leader, v.sort_order
from (values
  ('00000000-0000-4000-8000-000000000030'::uuid, '0xabcdef1234567890abcdef1234567890abcdef01', '核心委员', 'Core committee', false, 0),
  ('00000000-0000-4000-8000-000000000030'::uuid, '0x9876543210fedcba9876543210fedcba98765432', '生态委员', 'Ecosystem', false, 1),
  ('00000000-0000-4000-8000-000000000030'::uuid, '0x1111222233334444555566667777888899990000', '风控委员', 'Risk', false, 2),
  ('00000000-0000-4000-8000-000000000030'::uuid, '0xaaaabbbbccccddddeeeeffff0011223344556677', '运营委员', 'Ops', false, 3),
  ('00000000-0000-4000-8000-000000000030'::uuid, '0xbb11223344556677889900aabbccddeeff001122', '社区委员', 'Community', false, 4)
) as v(multisig_wallet_id, signer_wallet, role_zh, role_en, is_line_leader, sort_order)
where not exists (
  select 1 from public.committee_members cm
  where cm.multisig_wallet_id = v.multisig_wallet_id
    and lower(cm.signer_wallet) = lower(v.signer_wallet)
);

-- Multisig proposals
insert into public.multisig_proposals (
  id, multisig_wallet_id, wallet_type, title_zh, title_en, desc_zh, desc_en,
  period_zh, period_en, usd3_amount, d3_amount, beneficiary_count,
  proposer_wallet, status, created_at, expires_at, executed_at, tx_hash
) values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000020',
    'line',
    '2026年7月本线分红发放', 'Jul 2026 line dividend distribution',
    '按本线业绩向 48 名股东分配 UD3 + D3', 'Distribute UD3 + D3 to 48 line shareholders by performance',
    '2026年7月', 'Jul 2026', 186.4, 12.8, 48,
    '0x1234567890abcdef1234567890abcdef12345678', 'pending',
    '2026-07-28', '2026-08-02', null, null
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000020',
    'line',
    '2026年6月本线分红发放', 'Jun 2026 line dividend distribution',
    '月度分红已执行，链上可查', 'Monthly dividend executed — verifiable on-chain',
    '2026年6月', 'Jun 2026', 142.3, 9.6, 45,
    '0x1234567890abcdef1234567890abcdef12345678', 'executed',
    '2026-06-28', '2026-07-02', '2026-06-29 09:12+00',
    '0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890'
  )
on conflict (id) do nothing;

insert into public.multisig_signatures (proposal_id, signer_wallet, signed_at)
select v.proposal_id, v.signer_wallet, v.signed_at::timestamptz
from (values
  ('00000000-0000-4000-8000-000000000201'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '2026-07-28 14:20+00'),
  ('00000000-0000-4000-8000-000000000202'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '2026-06-28 10:15+00'),
  ('00000000-0000-4000-8000-000000000202'::uuid, '0xabcdef1234567890abcdef1234567890abcdef01', '2026-06-28 16:40+00'),
  ('00000000-0000-4000-8000-000000000202'::uuid, '0x9876543210fedcba9876543210fedcba98765432', '2026-06-29 09:05+00')
) as v(proposal_id, signer_wallet, signed_at)
where not exists (
  select 1 from public.multisig_signatures ms
  where ms.proposal_id = v.proposal_id
    and lower(ms.signer_wallet) = lower(v.signer_wallet)
);

-- Dividend accruals (union performance + referral rewards)
insert into public.dividend_accruals (
  id, wallet_address, asset_type, stream_id, amount, period_label, cycle_type,
  status, source_zh, source_en, settled_at, created_at, multisig_proposal_id
) values
  ('00000000-0000-4000-8000-000000000301', '0x1234567890abcdef1234567890abcdef12345678', 'usd3', 'fees', 68.2, 'Epoch #42', 'epoch', 'pending', '手续费滑点', 'Trading slippage', now(), now(), null),
  ('00000000-0000-4000-8000-000000000302', '0x1234567890abcdef1234567890abcdef12345678', 'usd3', 'treasury', 42.6, '2026年7月', 'monthly', 'multisig_pending', '市值管理', 'Treasury yield', now(), now(), '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000303', '0x1234567890abcdef1234567890abcdef12345678', 'usd3', 'line', 75.6, '2026年7月本线', 'monthly', 'multisig_pending', '分线手续费 + 贿赂', 'Line fees + bribe', now(), now(), '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000304', '0x1234567890abcdef1234567890abcdef12345678', 'd3', 'fees', 4.1, 'Epoch #42', 'epoch', 'pending', '手续费权益 D3', 'Fee equity D3', now(), now(), null),
  ('00000000-0000-4000-8000-000000000305', '0x1234567890abcdef1234567890abcdef12345678', 'd3', 'treasury', 3.2, '2026年7月', 'monthly', 'multisig_pending', '市值管理 D3', 'Treasury D3', now(), now(), '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000306', '0x1234567890abcdef1234567890abcdef12345678', 'd3', 'line', 5.5, '2026年7月本线', 'monthly', 'multisig_pending', '分线排放 D3', 'Line emission D3', now(), now(), '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000307', '0x1234567890abcdef1234567890abcdef12345678', 'usd3', 'fees', 98.5, 'Epoch #41', 'epoch', 'claimed', '手续费滑点', 'Trading slippage', '2026-07-06', '2026-07-06', null),
  ('00000000-0000-4000-8000-000000000308', '0x1234567890abcdef1234567890abcdef12345678', 'usd3', 'line', 43.7, '2026年6月', 'monthly', 'claimed', '分线手续费 + 贿赂', 'Line fees + bribe', '2026-07-01', '2026-07-01', null),
  ('00000000-0000-4000-8000-000000000309', '0x1234567890abcdef1234567890abcdef12345678', 'd3', 'fees', 9.6, 'Epoch #42', 'epoch', 'claimable', '手续费权益 D3', 'Fee equity D3', '2026-07-07', '2026-07-07', null),
  ('00000000-0000-4000-8000-000000000310', '0x1234567890abcdef1234567890abcdef12345678', 'd3', 'line', 7.2, '2026年6月', 'monthly', 'claimed', '分线排放 D3', 'Line emission D3', '2026-07-01', '2026-07-01', null),
  ('00000000-0000-4000-8000-000000000311', '0x1234567890abcdef1234567890abcdef12345678', 'usd3', 'referral', 150, 'Epoch #42', 'epoch', 'claimed', '推荐奖励', 'Referral reward', '2026-07-06', '2026-07-06', null),
  ('00000000-0000-4000-8000-000000000312', '0x1234567890abcdef1234567890abcdef12345678', 'usd3', 'dynamic', 0, 'Epoch #42', 'epoch', 'none', 'PoC 级差', 'PoC differential', '2026-07-05', '2026-07-05', null),
  ('00000000-0000-4000-8000-000000000313', '0x1234567890abcdef1234567890abcdef12345678', 'usd3', 'dynamic', 0, 'Epoch #42', 'epoch', 'none', 'PoN 算力奖', 'PoN bonus', '2026-07-04', '2026-07-04', null)
on conflict (id) do update set amount = excluded.amount, status = excluded.status, multisig_proposal_id = excluded.multisig_proposal_id;

-- Demo LP / ve lock positions
insert into public.fi_positions (
  id, wallet_address, position_type, asset_pair, principal_d3, principal_usdt, lock_days, locked_until, status, metadata
) values
  (
    '00000000-0000-4000-8000-000000000401',
    '0x1234567890abcdef1234567890abcdef12345678',
    've_lock', 'D3', 1600, null, 90, now() + interval '60 days', 'active', '{"apy": "0.45%"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    '0x1234567890abcdef1234567890abcdef12345678',
    'lp', 'D3/USDT', null, 5000, 180, now() + interval '120 days', 'active', '{"apy": "0.65%"}'::jsonb
  )
on conflict (id) do nothing;

-- User notifications (D3 protocol)
insert into public.user_notifications (
  id, wallet_address, title_zh, title_en, message_zh, message_en, category, link_path, is_read
) values
  (
    '00000000-0000-4000-8000-000000000501',
    '0x1234567890abcdef1234567890abcdef12345678',
    'Epoch #42 进入投票期',
    'Epoch #42 voting is open',
    '贿赂池新增 $180K，请及时分配 veD3 投票权重。',
    'Bribe pool added $180K — allocate your veD3 voting weight.',
    'protocol', '/d3fi', false
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    '0x1234567890abcdef1234567890abcdef12345678',
    'UD3 分红待领取',
    'UD3 dividend claimable',
    '本 Epoch 手续费通道有 186.4 UD3 待入账，可在资产页领取。',
    '186.4 UD3 from fee channel is pending — claim in Assets.',
    'dividend', '/union', false
  ),
  (
    '00000000-0000-4000-8000-000000000503',
    '0x1234567890abcdef1234567890abcdef12345678',
    '多签提案待签名',
    'Multisig proposal pending',
    '2026年7月本线分红发放提案等待 2/3 委员签名确认。',
    'Jul 2026 line dividend proposal awaits 2/3 committee signatures.',
    'multisig', '/union', false
  ),
  (
    '00000000-0000-4000-8000-000000000504',
    '0x1234567890abcdef1234567890abcdef12345678',
    '推荐奖励已入账',
    'Referral reward credited',
    '下级入金产生 150 UD3 推荐奖励，已记入账户余额。',
    '150 UD3 referral reward from downline entry credited to your balance.',
    'referral', '/d3fi', true
  )
on conflict (id) do nothing;

-- Live line leader: 0x871512590eE68bFDcf713Ee31dF882777106D2f4
insert into public.profiles (wallet_address, short_address, display_name, lang) values
  ('0x871512590eE68bFDcf713Ee31dF882777106D2f4', '0x8715…D2f4', 'Line Leader', 'zh')
on conflict (wallet_address) do update set display_name = excluded.display_name;

insert into public.shareholders (
  wallet_address, is_shareholder, genesis_dt_count, joined_at, join_fee_usdt,
  equity_share_pct, line_performance_usd, network_performance_usd, level_label, status
) values (
  '0x871512590eE68bFDcf713Ee31dF882777106D2f4', true, 1, now(), 5000,
  2.24, 0, 0, '发起人', 'active'
) on conflict (wallet_address) do update set
  is_shareholder = true,
  status = 'active',
  level_label = '发起人';

insert into public.referrals (wallet_address, sponsor_wallet_address, referral_type, status) values
  ('0x871512590eE68bFDcf713Ee31dF882777106D2f4', '0x1234567890abcdef1234567890abcdef12345678', 'shareholder', 'active')
on conflict (wallet_address, sponsor_wallet_address) do update set status = 'active';

insert into public.usd3_accounts (wallet_address) values
  ('0x871512590eE68bFDcf713Ee31dF882777106D2f4')
on conflict (wallet_address) do nothing;

insert into public.d3_accounts (wallet_address, claim_wallet_address) values
  ('0x871512590eE68bFDcf713Ee31dF882777106D2f4', '0x871512590eE68bFDcf713Ee31dF882777106D2f4')
on conflict (wallet_address) do nothing;

insert into public.union_lines (id, line_leader_wallet, root_wallet, name, total_members, total_performance_usd)
values (
  '00000000-0000-4000-8000-000000000011',
  '0x871512590eE68bFDcf713Ee31dF882777106D2f4',
  '0x871512590eE68bFDcf713Ee31dF882777106D2f4',
  '主线', 1, 0
) on conflict (id) do update set line_leader_wallet = excluded.line_leader_wallet;

insert into public.multisig_wallets (
  id, line_id, wallet_type, treasury_address, short_address, label_zh, label_en,
  threshold, total_signers, balance_usd3, balance_d3
) values (
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000011',
  'line',
  '0x871512590eE68bFDcf713Ee31dF882777106D2f4',
  '0x8715…D2f4', '本线收益金库', 'Line treasury', 2, 3, 0, 0
) on conflict (id) do nothing;

insert into public.committee_members (multisig_wallet_id, signer_wallet, role_zh, role_en, is_line_leader, sort_order, dividend_weight_pct)
select
  '00000000-0000-4000-8000-000000000021'::uuid,
  '0x871512590eE68bFDcf713Ee31dF882777106D2f4',
  '线长', 'Line leader', true, 0, 100
where not exists (
  select 1 from public.committee_members cm
  where cm.multisig_wallet_id = '00000000-0000-4000-8000-000000000021'::uuid
    and lower(cm.signer_wallet) = lower('0x871512590eE68bFDcf713Ee31dF882777106D2f4')
);

insert into public.team_nodes (
  id, line_id, wallet_address, parent_node_id, level_label,
  personal_usd, team_usd, direct_count, team_count, is_direct
) values (
  '00000000-0000-4000-8000-000000000107',
  '00000000-0000-4000-8000-000000000011',
  '0x871512590eE68bFDcf713Ee31dF882777106D2f4',
  null, '发起人', 0, 0, 0, 1, false
) on conflict (line_id, wallet_address) do update set level_label = excluded.level_label;

-- Partner program demo (requires migrations 017 + 022):
--   psql $DATABASE_URL -f supabase/seed_partner_demo.sql
