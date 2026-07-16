-- Partner program demo seed for line-leader wallet 0x1234…5678 (NEW UD3 / D3-value model).
-- sD3 is retired: reward = UD3 (1 UD3 = 1 USDT); stake yield accrues as released D3
-- and exits by VALUE (principal × 6). Numbers are static/consistent (frontend displays
-- them; no client-side recompute → no drift with backend formulas).

-- ── Profiles ────────────────────────────────────────────────────────────────
insert into public.profiles (wallet_address, short_address, display_name, lang)
select v.wallet_address, v.short_address, v.display_name, v.lang
from (values
  ('0x1234567890abcdef1234567890abcdef12345678', '0x1234…5678', 'Demo Line Leader', 'zh'),
  ('0x1111222233334444555566667777888899990000', '0x1111…0000', 'Direct A3', 'zh'),
  ('0xaaaabbbbccccddddeeeeffff0011223344556677', '0xAAaa…6677', 'Downline B1', 'zh'),
  ('0xbb11223344556677889900aabbccddeeff001122', '0xBb11…1122', 'Downline B2', 'zh'),
  ('0xabcdef1234567890abcdef1234567890abcdef01', '0xAbCd…Ef01', 'A3-1', 'zh'),
  ('0x9876543210fedcba9876543210fedcba98765432', '0x9876…5432', 'B2-1', 'zh'),
  ('0xcc223344556677889900aabbccddeeff00112233', '0xCc22…2233', 'B2-2', 'zh'),
  ('0xdeadbeef00000000000000000000000000000001', '0xDeAd…0001', 'A3-Sub', 'zh')
) as v(wallet_address, short_address, display_name, lang)
where not exists (
  select 1 from public.profiles p where lower(p.wallet_address) = lower(v.wallet_address)
);

-- ── Partner referral tree ────────────────────────────────────────────────────
insert into public.referrals (wallet_address, sponsor_wallet_address, referral_type, status, performance_weight)
values
  ('0x1234567890abcdef1234567890abcdef12345678', '0xabcdef1234567890abcdef1234567890abcdef01', 'partner', 'active', 6500),
  ('0x1111222233334444555566667777888899990000', '0x1234567890abcdef1234567890abcdef12345678', 'partner', 'active', 2100),
  ('0xaaaabbbbccccddddeeeeffff0011223344556677', '0x1234567890abcdef1234567890abcdef12345678', 'partner', 'active', 1500),
  ('0xbb11223344556677889900aabbccddeeff001122', '0x1234567890abcdef1234567890abcdef12345678', 'partner', 'active', 800),
  ('0xabcdef1234567890abcdef1234567890abcdef01', '0x1111222233334444555566667777888899990000', 'partner', 'active', 500),
  ('0x9876543210fedcba9876543210fedcba98765432', '0xbb11223344556677889900aabbccddeeff001122', 'partner', 'active', 400),
  ('0xcc223344556677889900aabbccddeeff00112233', '0xbb11223344556677889900aabbccddeeff001122', 'partner', 'active', 350),
  ('0xdeadbeef00000000000000000000000000000001', '0xabcdef1234567890abcdef1234567890abcdef01', 'partner', 'active', 38800)
on conflict (wallet_address, sponsor_wallet_address) do update set
  referral_type = excluded.referral_type,
  status = excluded.status,
  performance_weight = excluded.performance_weight;

-- ── Partner account: UD3 reward balance + released-but-unswapped D3 ──────────
-- ud3_balance 1800 UD3 (= 1800 USDT) reward; pending_d3_yield 155.2 D3 ready to flash-swap.
insert into public.partner_accounts (
  wallet_address, is_partner, ud3_balance, lifetime_ud3_earned,
  pending_d3_yield, lifetime_d3_yield, pending_usdt_yield, lifetime_usdt_yield,
  joined_at, market_leader_status
) values (
  '0x1234567890abcdef1234567890abcdef12345678',
  true, 1800, 1800,
  155.2, 155.2, 776, 776,
  '2026-07-01'::timestamptz, 'approved'
) on conflict (wallet_address) do update set
  is_partner = excluded.is_partner,
  ud3_balance = excluded.ud3_balance,
  lifetime_ud3_earned = excluded.lifetime_ud3_earned,
  pending_d3_yield = excluded.pending_d3_yield,
  lifetime_d3_yield = excluded.lifetime_d3_yield,
  pending_usdt_yield = excluded.pending_usdt_yield,
  lifetime_usdt_yield = excluded.lifetime_usdt_yield,
  joined_at = excluded.joined_at,
  market_leader_status = excluded.market_leader_status;

-- ── Credited stake intents (personal performance inputs) ────────────────────
insert into public.stake_intents (id, wallet_address, intent_type, amount_usdt, status, expires_at, updated_at)
values
  ('a0000000-0000-4000-8000-000000000001'::uuid, '0x1234567890abcdef1234567890abcdef12345678', 'partner_join', 5000, 'credited', now() + interval '30 days', '2026-07-01'::timestamptz),
  ('a0000000-0000-4000-8000-000000000002'::uuid, '0x1234567890abcdef1234567890abcdef12345678', 'crowdfund_stake', 1000, 'credited', now() + interval '30 days', '2026-06-15'::timestamptz),
  ('a0000000-0000-4000-8000-000000000003'::uuid, '0xaaaabbbbccccddddeeeeffff0011223344556677', 'crowdfund_stake', 900, 'credited', now() + interval '30 days', now()),
  ('a0000000-0000-4000-8000-000000000004'::uuid, '0xbb11223344556677889900aabbccddeeff001122', 'crowdfund_stake', 900, 'credited', now() + interval '30 days', now())
on conflict (id) do update set
  amount_usdt = excluded.amount_usdt, status = excluded.status, updated_at = excluded.updated_at;

-- ── Stake positions (D3-value model): 540d, 0.4%/day, exit at principal×6 by value ─
-- D3 price = 5. Position 1: 5000 USDT ~30d elapsed. Position 2: 1000 USDT ~44d elapsed.
insert into public.partner_stake_positions (
  id, wallet_address, intent_id, kind, principal_usdt, daily_yield_usdt,
  started_at, unlock_at, status, exit_multiplier,
  staked_d3, d3_price_at_stake, daily_release_d3, released_d3, exit_cap_d3, accrued_yield_usdt
) values
  ('b0000000-0000-4000-8000-000000000001'::uuid, '0x1234567890abcdef1234567890abcdef12345678',
   'a0000000-0000-4000-8000-000000000001'::uuid, 'partner_join', 5000, 20,
   '2026-07-01'::timestamptz, '2026-07-01'::timestamptz + interval '540 days', 'active', 6,
   1000, 5, 4, 120, 6000, 600),
  ('b0000000-0000-4000-8000-000000000002'::uuid, '0x1234567890abcdef1234567890abcdef12345678',
   'a0000000-0000-4000-8000-000000000002'::uuid, 'crowdfund_stake', 1000, 4,
   '2026-06-15'::timestamptz, '2026-06-15'::timestamptz + interval '540 days', 'active', 6,
   200, 5, 0.8, 35.2, 1200, 176)
on conflict (id) do update set
  principal_usdt = excluded.principal_usdt,
  released_d3 = excluded.released_d3,
  accrued_yield_usdt = excluded.accrued_yield_usdt,
  status = excluded.status;
