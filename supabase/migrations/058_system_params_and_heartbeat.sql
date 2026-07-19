-- System-parameter store + heartbeat-order backing tables.
--
-- 1. `system_params` — a generic key/value registry of every tunable system
--    constant (private-sale schedule, fees, yields, subsidy/bribe/UD3 tiers,
--    faucet, risk caps, heartbeat settings). Admins edit these from the new
--    参数管理 page; the `on_chain` flag marks params that will later be governed
--    by the multisig (the modification flow itself is a future phase).
-- 2. `heartbeat_orders` — persisted simulated (manual/auto) 私募 display orders for
--    the 心跳指数 widget. Real orders stay in `stake_intents` (not duplicated).
-- 3. `heartbeat_state` — singleton cron cursor for the auto-generator.
-- 4. `heartbeat_stats` — view: 原本(real, from stake_intents) vs 增加(added).
--
-- RLS enabled, no permissive policy = default-deny for anon/authenticated;
-- service_role (edge functions) bypasses RLS. Idempotent create-if-not-exists.

-- ─── 1. system_params ────────────────────────────────────────────────────────
create table if not exists public.system_params (
  param_key   text primary key,
  param_group text not null,
  label       text not null,
  value       jsonb not null,
  value_type  text not null default 'number'
    check (value_type in ('number', 'string', 'boolean', 'json')),
  on_chain    boolean not null default false,
  editable    boolean not null default true,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

alter table public.system_params enable row level security;
revoke all on public.system_params from anon, authenticated;
grant all on public.system_params to service_role;

create index if not exists system_params_group_idx
  on public.system_params (param_group, param_key);

comment on table public.system_params is
  'Editable registry of system constants; on_chain flags params slated for multisig governance.';

-- Seed the full catalog. `on conflict do nothing` keeps existing admin edits.
insert into public.system_params (param_key, param_group, label, value, value_type, on_chain) values
  -- private sale
  ('private_sale.round_schedule', 'private_sale', '私募四轮 (数量/价格)',
    '[{"round":1,"d3":8000000,"priceUsdt":5},{"round":2,"d3":8000000,"priceUsdt":6},{"round":3,"d3":8000000,"priceUsdt":7},{"round":4,"d3":8000000,"priceUsdt":8}]'::jsonb, 'json', true),
  ('private_sale.unit_price_usdt', 'private_sale', '第一轮单价 (U)', '5'::jsonb, 'number', true),
  ('private_sale.target_usdt', 'private_sale', '募集目标 (USDT)', '20000000'::jsonb, 'number', false),
  ('private_sale.token_supply', 'private_sale', '代币供应量', '1050000'::jsonb, 'number', false),
  ('private_sale.min_stake_usdt', 'private_sale', '最小质押 (USDT)', '0.01'::jsonb, 'number', false),
  ('private_sale.display_boost_pct', 'private_sale', '进度显示加成 (%)', '0'::jsonb, 'number', false),
  -- partner / stake
  ('partner_stake.entry_usdt', 'partner_stake', '合伙人入门 (USDT)', '5000'::jsonb, 'number', false),
  ('partner_stake.regular_min_usdt', 'partner_stake', '普通质押最小 (USDT)', '100'::jsonb, 'number', false),
  ('partner_stake.regular_step_usdt', 'partner_stake', '普通质押步进 (USDT)', '100'::jsonb, 'number', false),
  ('partner_stake.ud3_step', 'partner_stake', 'UD3 质押步进', '100'::jsonb, 'number', false),
  ('partner_stake.exit_multiplier', 'partner_stake', '出局倍数', '6'::jsonb, 'number', true),
  ('partner_stake.lock_days', 'partner_stake', '锁仓天数', '540'::jsonb, 'number', true),
  -- yield
  ('yield.daily_pct', 'yield', '每日收益 (%)', '0.4'::jsonb, 'number', true),
  ('yield.min_withdraw_usdt', 'yield', '最小提取 (USDT)', '0.001'::jsonb, 'number', false),
  ('yield.flash_swap_fee_pct', 'yield', '闪兑手续费 (%)', '3'::jsonb, 'number', false),
  -- subsidy (mirrors partner_program_settings)
  ('subsidy.partner_rate', 'subsidy', '合伙人补贴率', '0.10'::jsonb, 'number', false),
  ('subsidy.market_rate', 'subsidy', '市场补贴率', '0.05'::jsonb, 'number', false),
  -- bribe / ud3
  ('bribe.tier_min_usd', 'bribe', '受贿金起步小区业绩 (USD)', '100'::jsonb, 'number', false),
  ('bribe.tier_splits', 'bribe', '受贿金直推/上级分成',
    '[{"directShare":0.5,"uplineShare":0.5},{"directShare":0.4,"uplineShare":0.6},{"directShare":0.3,"uplineShare":0.7},{"directShare":0.2,"uplineShare":0.8}]'::jsonb, 'json', false),
  ('ud3.tiers', 'ud3', 'UD3 S1-S6 档位 (业绩/倍率)',
    '[{"id":1,"label":"S1","minTotalPerfUsdt":0,"ratePct":100},{"id":2,"label":"S2","minTotalPerfUsdt":100000,"ratePct":110},{"id":3,"label":"S3","minTotalPerfUsdt":200000,"ratePct":120},{"id":4,"label":"S4","minTotalPerfUsdt":300000,"ratePct":130},{"id":5,"label":"S5","minTotalPerfUsdt":500000,"ratePct":140},{"id":6,"label":"S6","minTotalPerfUsdt":800000,"ratePct":150}]'::jsonb, 'json', false),
  -- faucet (TestUSDT on-chain)
  ('faucet.amount', 'faucet', '水龙头单次数量', '1000'::jsonb, 'number', true),
  ('faucet.cooldown_hours', 'faucet', '水龙头冷却 (小时)', '12'::jsonb, 'number', true),
  -- risk (mirrors risk_limits)
  ('risk.max_withdraw_per_tx_usdt', 'risk', '单笔提现上限 (USDT)', '2000'::jsonb, 'number', false),
  ('risk.max_user_daily_usdt', 'risk', '用户日提现上限 (USDT)', '5000'::jsonb, 'number', false),
  ('risk.max_platform_hourly_usdt', 'risk', '平台小时提现上限 (USDT)', '50000'::jsonb, 'number', false),
  ('risk.min_solvency_ratio', 'risk', '最低偿付率', '1.0'::jsonb, 'number', false),
  -- heartbeat display-order generator
  ('heartbeat.enabled', 'heartbeat', '心跳增单开关', 'true'::jsonb, 'boolean', false),
  ('heartbeat.interval_seconds', 'heartbeat', '增单间隔 (秒)', '600'::jsonb, 'number', false),
  ('heartbeat.amount_min', 'heartbeat', '虚单最小金额 (USDT)', '100'::jsonb, 'number', false),
  ('heartbeat.amount_max', 'heartbeat', '虚单最大金额 (USDT)', '2000'::jsonb, 'number', false),
  ('heartbeat.amount_tiers', 'heartbeat', '虚单金额档位',
    '[100,200,300,500,800,1000,1500,2000]'::jsonb, 'json', false)
on conflict (param_key) do nothing;

-- ─── 2. heartbeat_orders ─────────────────────────────────────────────────────
create table if not exists public.heartbeat_orders (
  id          uuid primary key default gen_random_uuid(),
  address     text not null,
  amount_usdt numeric(18, 4) not null check (amount_usdt > 0),
  d3          numeric(20, 6) not null default 0,
  round       integer not null default 1,
  source      text not null default 'auto'
    check (source in ('manual', 'auto')),
  tx_hash     text,
  created_by  text,
  created_at  timestamptz not null default now()
);

alter table public.heartbeat_orders enable row level security;
revoke all on public.heartbeat_orders from anon, authenticated;
grant all on public.heartbeat_orders to service_role;

create index if not exists heartbeat_orders_created_idx
  on public.heartbeat_orders (created_at desc);

comment on table public.heartbeat_orders is
  'Simulated private-sale display orders (manual + cron-generated) for the 心跳指数 widget; real orders live in stake_intents.';

-- ─── 3. heartbeat_state (singleton cron cursor) ──────────────────────────────
create table if not exists public.heartbeat_state (
  id               text primary key default 'default',
  last_tick_at     timestamptz,
  cumulative_count integer not null default 0,
  updated_at       timestamptz not null default now()
);

alter table public.heartbeat_state enable row level security;
revoke all on public.heartbeat_state from anon, authenticated;
grant all on public.heartbeat_state to service_role;

insert into public.heartbeat_state (id) values ('default') on conflict (id) do nothing;

-- ─── 4. heartbeat_stats view — 原本(real) vs 增加(added) ─────────────────────
create or replace view public.heartbeat_stats as
  select
    'real'::text as source,
    count(*)::bigint as order_count,
    coalesce(sum(amount_usdt), 0)::numeric as usdt_total
  from public.stake_intents
  where intent_type = 'crowdfund_stake'
    and status in ('credited', 'sweep_pending', 'completed')
  union all
  select
    'added'::text as source,
    count(*)::bigint as order_count,
    coalesce(sum(amount_usdt), 0)::numeric as usdt_total
  from public.heartbeat_orders;

revoke all on public.heartbeat_stats from anon, authenticated;
grant select on public.heartbeat_stats to service_role;

comment on view public.heartbeat_stats is
  'Real (stake_intents crowdfund) vs added (heartbeat_orders) order counts + USDT totals for the 心跳指数 widget.';
