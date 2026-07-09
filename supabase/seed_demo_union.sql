-- Demo line-leader union bundle (idempotent)
-- Wallet: 0x1234567890abcdef1234567890abcdef12345678 (lowercase canonical)

-- ── Core profile + 发起人股东 ───────────────────────────────────────────────
update public.profiles
set display_name = '演示线长',
    short_address = '0x1234…5678',
    lang = 'zh',
    updated_at = now()
where lower(wallet_address) = lower('0x1234567890AbCdEf1234567890AbCdEf12345678');

insert into public.shareholders (
  wallet_address, is_shareholder, genesis_dt_count, joined_at, join_fee_usdt,
  equity_share_pct, line_performance_usd, network_performance_usd, level_label, status
)
select
  p.wallet_address, true, 1, '2026-07-08'::timestamptz, 5000,
  2.24, 286400, 12800000, '发起人', 'active'
from public.profiles p
where lower(p.wallet_address) = lower('0x1234567890AbCdEf1234567890AbCdEf12345678')
on conflict (wallet_address) do update set
  is_shareholder = true,
  genesis_dt_count = 1,
  joined_at = '2026-07-08'::timestamptz,
  equity_share_pct = 2.24,
  line_performance_usd = 286400,
  network_performance_usd = 12800000,
  level_label = '发起人',
  status = 'active';

-- ── 资产账户 ─────────────────────────────────────────────────────────────────
insert into public.usd3_accounts (
  wallet_address, pending_usd3, claimed_lifetime_usd3, balance, available,
  self_pool_remaining, downline_pool_remaining, moved_to_fi, transferred_to_downline,
  self_quota, downline_quota
)
select
  p.wallet_address, 186.4, 1240, 320, 320, 120, 200, 500, 420, 620, 620
from public.profiles p
where lower(p.wallet_address) = lower('0x1234567890AbCdEf1234567890AbCdEf12345678')
on conflict (wallet_address) do update set
  pending_usd3 = 186.4,
  claimed_lifetime_usd3 = 1240,
  balance = 320,
  available = 320,
  self_pool_remaining = 120,
  downline_pool_remaining = 200;

insert into public.d3_accounts (wallet_address, pending_d3, claimed_lifetime_d3, claim_wallet_address)
select p.wallet_address, 12.8, 86.4, p.wallet_address
from public.profiles p
where lower(p.wallet_address) = lower('0x1234567890AbCdEf1234567890AbCdEf12345678')
on conflict (wallet_address) do update set
  pending_d3 = 12.8,
  claimed_lifetime_d3 = 86.4;

-- ── 线 + 多签 ────────────────────────────────────────────────────────────────
insert into public.union_lines (id, line_leader_wallet, root_wallet, name, total_members, total_performance_usd)
select
  '00000000-0000-4000-8000-000000000010'::uuid,
  p.wallet_address,
  p.wallet_address,
  '主线 Alpha', 52, 312800
from public.profiles p
where lower(p.wallet_address) = lower('0x1234567890AbCdEf1234567890AbCdEf12345678')
on conflict (id) do update set
  total_members = 52,
  total_performance_usd = 312800;

insert into public.multisig_wallets (
  id, line_id, wallet_type, treasury_address, short_address, label_zh, label_en,
  threshold, total_signers, balance_usd3, balance_d3
) values (
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000010',
  'line',
  '0x7a3f8c2e1b9d4a6f0e5c8b2d1a9f7e4c3b6d8a1f',
  '0x7a3f…a1f', '本线收益金库', 'Line treasury', 2, 3, 4280, 186.4
) on conflict (id) do update set balance_usd3 = 4280, balance_d3 = 186.4;

-- ── 下线 / 委员 profiles ─────────────────────────────────────────────────────
insert into public.profiles (wallet_address, short_address, display_name, lang) values
  ('0xabcdef1234567890abcdef1234567890abcdef01', '0xabcd…ef01', '委员 A · 王磊', 'zh'),
  ('0x9876543210fedcba9876543210fedcba98765432', '0x9876…5432', '委员 B · 李敏', 'zh'),
  ('0x1111222233334444555566667777888899990000', '0x1111…0000', '直推 A3 · 陈浩', 'zh'),
  ('0xaaaa1111bbbb2222cccc3333dddd4444eeee5555', '0xaaaa…5555', '直推 A4 · 赵婷', 'zh'),
  ('0xaa11bb22cc33dd44ee55ff660011223344556677', '0xaa11…6677', '下线 B1-1', 'zh'),
  ('0xbb11223344556677889900aabbccddeeff001122', '0xbb11…1122', '下线 B1-2', 'zh'),
  ('0xcc223344556677889900aabbccddeeff00112233', '0xcc22…2233', '下线 B2-1', 'zh'),
  ('0xdd3344556677889900aabbccddeeff0011223344', '0xdd33…3344', '下线 B2-2', 'zh'),
  ('0xee44556677889900aabbccddeeff001122334455', '0xee44…4455', '下线 C1-1', 'zh')
on conflict (wallet_address) do update set display_name = excluded.display_name;

-- 委员 + 部分下线为股东
insert into public.shareholders (
  wallet_address, is_shareholder, genesis_dt_count, joined_at, join_fee_usdt,
  equity_share_pct, line_performance_usd, network_performance_usd, level_label, status
) values
  ('0xabcdef1234567890abcdef1234567890abcdef01', true, 1, '2026-06-15', 5000, 0.42, 98000, 420000, 'V3', 'active'),
  ('0x9876543210fedcba9876543210fedcba98765432', true, 1, '2026-06-20', 5000, 0.38, 72000, 310000, 'V2', 'active'),
  ('0x1111222233334444555566667777888899990000', true, 1, '2026-07-01', 5000, 0.12, 41400, 98000, 'V1', 'active'),
  ('0xaaaa1111bbbb2222cccc3333dddd4444eeee5555', true, 1, '2026-07-03', 5000, 0.08, 28600, 52000, 'V1', 'active')
on conflict (wallet_address) do update set
  is_shareholder = true,
  status = 'active',
  line_performance_usd = excluded.line_performance_usd;

insert into public.referrals (wallet_address, sponsor_wallet_address, referral_type, status)
select v.wallet_address, p.wallet_address, v.referral_type, 'active'
from public.profiles p
cross join (values
  ('0xabcdef1234567890abcdef1234567890abcdef01', 'shareholder'),
  ('0x9876543210fedcba9876543210fedcba98765432', 'shareholder'),
  ('0x1111222233334444555566667777888899990000', 'partner'),
  ('0xaaaa1111bbbb2222cccc3333dddd4444eeee5555', 'partner'),
  ('0xaa11bb22cc33dd44ee55ff660011223344556677', 'partner'),
  ('0xbb11223344556677889900aabbccddeeff001122', 'partner'),
  ('0xcc223344556677889900aabbccddeeff00112233', 'partner'),
  ('0xdd3344556677889900aabbccddeeff0011223344', 'partner'),
  ('0xee44556677889900aabbccddeeff001122334455', 'partner')
) as v(wallet_address, referral_type)
where lower(p.wallet_address) = lower('0x1234567890AbCdEf1234567890AbCdEf12345678')
on conflict (wallet_address, sponsor_wallet_address) do nothing;

-- 二级推荐：委员 A 的下线
insert into public.referrals (wallet_address, sponsor_wallet_address, referral_type, status) values
  ('0xaa11bb22cc33dd44ee55ff660011223344556677', '0xabcdef1234567890abcdef1234567890abcdef01', 'partner', 'active'),
  ('0xbb11223344556677889900aabbccddeeff001122', '0xabcdef1234567890abcdef1234567890abcdef01', 'partner', 'active'),
  ('0xcc223344556677889900aabbccddeeff00112233', '0x9876543210fedcba9876543210fedcba98765432', 'partner', 'active'),
  ('0xdd3344556677889900aabbccddeeff0011223344', '0x9876543210fedcba9876543210fedcba98765432', 'partner', 'active'),
  ('0xee44556677889900aabbccddeeff001122334455', '0x1111222233334444555566667777888899990000', 'partner', 'active')
on conflict (wallet_address, sponsor_wallet_address) do nothing;

-- ── 团队树（4 层）────────────────────────────────────────────────────────────
insert into public.team_nodes (
  id, line_id, wallet_address, parent_node_id, level_label,
  personal_usd, team_usd, direct_count, team_count, is_direct
) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000010', '0x1234567890abcdef1234567890abcdef12345678', null, 'V5', 3200, 312800, 4, 52, false),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000010', '0xabcdef1234567890abcdef1234567890abcdef01', '00000000-0000-4000-8000-000000000101', 'V3', 1100, 98000, 2, 18, true),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000010', '0x9876543210fedcba9876543210fedcba98765432', '00000000-0000-4000-8000-000000000101', 'V2', 2400, 72000, 2, 14, true),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000010', '0x1111222233334444555566667777888899990000', '00000000-0000-4000-8000-000000000101', 'V1', 200, 41400, 1, 12, true),
  ('00000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-000000000010', '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555', '00000000-0000-4000-8000-000000000101', 'V1', 350, 28600, 0, 6, true),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000010', '0xaa11bb22cc33dd44ee55ff660011223344556677', '00000000-0000-4000-8000-000000000102', 'V1', 280, 42000, 0, 8, false),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000010', '0xbb11223344556677889900aabbccddeeff001122', '00000000-0000-4000-8000-000000000102', 'V2', 450, 18000, 0, 5, false),
  ('00000000-0000-4000-8000-000000000109', '00000000-0000-4000-8000-000000000010', '0xcc223344556677889900aabbccddeeff00112233', '00000000-0000-4000-8000-000000000103', 'V1', 320, 15200, 0, 4, false),
  ('00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000010', '0xdd3344556677889900aabbccddeeff0011223344', '00000000-0000-4000-8000-000000000103', 'V1', 180, 9800, 0, 3, false),
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000010', '0xee44556677889900aabbccddeeff001122334455', '00000000-0000-4000-8000-000000000104', 'V0', 120, 6200, 0, 2, false)
on conflict (line_id, wallet_address) do update set
  parent_node_id = excluded.parent_node_id,
  level_label = excluded.level_label,
  personal_usd = excluded.personal_usd,
  team_usd = excluded.team_usd,
  direct_count = excluded.direct_count,
  team_count = excluded.team_count,
  is_direct = excluded.is_direct;

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

-- ── 分红明细 + 多签提案 ──────────────────────────────────────────────────────
insert into public.multisig_proposals (
  id, multisig_wallet_id, wallet_type, title_zh, title_en, desc_zh, desc_en,
  period_zh, period_en, usd3_amount, d3_amount, beneficiary_count,
  proposer_wallet, status, created_at, expires_at
) values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000020', 'line',
    '2026年7月本线分红发放', 'Jul 2026 line dividend distribution',
    '按本线业绩向 52 名成员分配 USD3 + D3', 'Distribute USD3 + D3 to 52 line members',
    '2026年7月', 'Jul 2026', 186.4, 12.8, 52,
    '0x1234567890abcdef1234567890abcdef12345678', 'pending',
    '2026-07-28', '2026-08-02'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000020', 'line',
    '2026年6月本线分红发放', 'Jun 2026 line dividend distribution',
    '月度分红已执行', 'Monthly dividend executed',
    '2026年6月', 'Jun 2026', 142.3, 9.6, 45,
    '0x1234567890abcdef1234567890abcdef12345678', 'executed',
    '2026-06-28', '2026-07-02'
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
  where ms.proposal_id = v.proposal_id and lower(ms.signer_wallet) = lower(v.signer_wallet)
);

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
  ('00000000-0000-4000-8000-000000000311', '0x1234567890abcdef1234567890abcdef12345678', 'usd3', 'referral', 150, 'Epoch #42', 'epoch', 'claimed', '推荐奖励', 'Referral reward', '2026-07-06', '2026-07-06', null)
on conflict (id) do update set amount = excluded.amount, status = excluded.status;

insert into public.fi_positions (
  id, wallet_address, position_type, asset_pair, principal_d3, principal_usdt, lock_days, locked_until, status, metadata
) values
  ('00000000-0000-4000-8000-000000000401', '0x1234567890abcdef1234567890abcdef12345678', 've_lock', 'D3', 1600, null, 90, now() + interval '60 days', 'active', '{"apy": "0.45%"}'::jsonb),
  ('00000000-0000-4000-8000-000000000402', '0x1234567890abcdef1234567890abcdef12345678', 'lp', 'D3/USDT', null, 5000, 180, now() + interval '120 days', 'active', '{"apy": "0.65%"}'::jsonb)
on conflict (id) do nothing;

insert into public.user_notifications (
  id, wallet_address, title_zh, title_en, message_zh, message_en, category, link_path, is_read
) values
  ('00000000-0000-4000-8000-000000000502', '0x1234567890abcdef1234567890abcdef12345678', 'USD3 分红待领取', 'USD3 dividend claimable', '本 Epoch 有 186.4 USD3 待入账。', '186.4 USD3 pending this Epoch.', 'dividend', '/union', false),
  ('00000000-0000-4000-8000-000000000503', '0x1234567890abcdef1234567890abcdef12345678', '多签提案待签名', 'Multisig pending', '7月本线分红提案等待委员签名。', 'Jul line dividend awaits committee signatures.', 'multisig', '/union', false)
on conflict (id) do nothing;
