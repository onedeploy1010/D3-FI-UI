-- Partner program demo seed for line-leader wallet 0x1234…5678
-- Matches small-area sD3 rules: large line = Direct A3, small lines = B1 + B2

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

-- ── Partner referral tree (performance via performance_weight + stake_intents) ─
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

-- ── Partner account (demo line leader) ──────────────────────────────────────
insert into public.partner_accounts (
  wallet_address, is_partner, sd3_balance, lifetime_sd3_earned,
  lifetime_usdt_yield, pending_usdt_yield, joined_at, market_leader_status
) values (
  '0x1234567890abcdef1234567890abcdef12345678',
  true,
  4960,
  4960,
  296,
  0,
  '2026-07-01'::timestamptz,
  'approved'
) on conflict (wallet_address) do update set
  is_partner = excluded.is_partner,
  sd3_balance = excluded.sd3_balance,
  lifetime_sd3_earned = excluded.lifetime_sd3_earned,
  lifetime_usdt_yield = excluded.lifetime_usdt_yield,
  joined_at = excluded.joined_at,
  market_leader_status = excluded.market_leader_status;

-- ── Credited stake intents (personal performance) ───────────────────────────
insert into public.stake_intents (id, wallet_address, intent_type, amount_usdt, status, expires_at, updated_at)
values
  ('a0000000-0000-4000-8000-000000000001'::uuid, '0x1234567890abcdef1234567890abcdef12345678', 'partner_join', 5000, 'credited', now() + interval '30 days', '2026-07-01'::timestamptz),
  ('a0000000-0000-4000-8000-000000000002'::uuid, '0x1234567890abcdef1234567890abcdef12345678', 'crowdfund_stake', 1000, 'credited', now() + interval '30 days', '2026-06-15'::timestamptz),
  ('a0000000-0000-4000-8000-000000000003'::uuid, '0xaaaabbbbccccddddeeeeffff0011223344556677', 'crowdfund_stake', 900, 'credited', now() + interval '30 days', now()),
  ('a0000000-0000-4000-8000-000000000004'::uuid, '0xbb11223344556677889900aabbccddeeff001122', 'crowdfund_stake', 900, 'credited', now() + interval '30 days', now())
on conflict (id) do update set
  amount_usdt = excluded.amount_usdt,
  status = excluded.status,
  updated_at = excluded.updated_at;

-- ── sD3: no seed transfer rows — demo sD3 transfers are session-mock on client ─

-- ── Daily sD3 settlements (aggregated) ──────────────────────────────────────
insert into public.partner_sd3_settlements (id, wallet_address, settlement_date, team_performance_usd, daily_new_performance_usd, tier_rate_pct, sd3_amount)
values
  ('c0000000-0000-4000-8000-000000000001'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '2026-07-08', 45000, 1800, 100, 900),
  ('c0000000-0000-4000-8000-000000000002'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '2026-07-07', 45000, 1728, 100, 864),
  ('c0000000-0000-4000-8000-000000000003'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '2026-07-06', 45000, 1656, 100, 928),
  ('c0000000-0000-4000-8000-000000000004'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '2026-07-05', 45000, 1584, 100, 792),
  ('c0000000-0000-4000-8000-000000000005'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '2026-07-04', 45000, 1512, 100, 756),
  ('c0000000-0000-4000-8000-000000000006'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '2026-07-03', 45000, 1440, 100, 720)
on conflict (id) do nothing;

-- ── Per-event sD3 allocations (direct / upline with source) ─────────────────
insert into public.partner_sd3_allocations (
  id, recipient_wallet, source_wallet, settlement_date, event_amount_usd,
  tier_rate_pct, reward_share_pct, role, sd3_amount
)
values
  ('d0000000-0000-4000-8000-000000000001'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xaaaabbbbccccddddeeeeffff0011223344556677', '2026-07-08', 900, 100, 50, 'direct', 450),
  ('d0000000-0000-4000-8000-000000000002'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xbb11223344556677889900aabbccddeeff001122', '2026-07-08', 900, 100, 50, 'direct', 450),
  ('d0000000-0000-4000-8000-000000000003'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xaaaabbbbccccddddeeeeffff0011223344556677', '2026-07-07', 864, 100, 50, 'direct', 432),
  ('d0000000-0000-4000-8000-000000000004'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xbb11223344556677889900aabbccddeeff001122', '2026-07-07', 864, 100, 50, 'direct', 432),
  ('d0000000-0000-4000-8000-000000000005'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xaaaabbbbccccddddeeeeffff0011223344556677', '2026-07-06', 400, 100, 50, 'upline', 100),
  ('d0000000-0000-4000-8000-000000000006'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xaaaabbbbccccddddeeeeffff0011223344556677', '2026-07-06', 828, 100, 50, 'direct', 414),
  ('d0000000-0000-4000-8000-000000000007'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xbb11223344556677889900aabbccddeeff001122', '2026-07-06', 828, 100, 50, 'direct', 414),
  ('d0000000-0000-4000-8000-000000000008'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xaaaabbbbccccddddeeeeffff0011223344556677', '2026-07-05', 792, 100, 50, 'direct', 396),
  ('d0000000-0000-4000-8000-000000000009'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xbb11223344556677889900aabbccddeeff001122', '2026-07-05', 792, 100, 50, 'direct', 396),
  ('d0000000-0000-4000-8000-00000000000a'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xaaaabbbbccccddddeeeeffff0011223344556677', '2026-07-04', 756, 100, 50, 'direct', 378),
  ('d0000000-0000-4000-8000-00000000000b'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xbb11223344556677889900aabbccddeeff001122', '2026-07-04', 756, 100, 50, 'direct', 378),
  ('d0000000-0000-4000-8000-00000000000c'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xaaaabbbbccccddddeeeeffff0011223344556677', '2026-07-03', 720, 100, 50, 'direct', 360),
  ('d0000000-0000-4000-8000-00000000000d'::uuid, '0x1234567890abcdef1234567890abcdef12345678', '0xbb11223344556677889900aabbccddeeff001122', '2026-07-03', 720, 100, 50, 'direct', 360)
on conflict (id) do nothing;
