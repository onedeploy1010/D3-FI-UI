-- Reference data + extended dividend streams (replaces client mock data)

-- Extend dividend stream types for referral / dynamic rewards
alter table public.dividend_accruals drop constraint if exists dividend_accruals_stream_id_check;
alter table public.dividend_accruals add constraint dividend_accruals_stream_id_check
  check (stream_id in ('fees', 'treasury', 'line', 'referral', 'dynamic'));

-- V-level promotion reference (D3-Fi team tab)
create table if not exists public.v_level_tiers (
  level_label text primary key,
  personal_req text not null,
  large_area_req text not null,
  small_area_req text not null,
  diff_range text not null,
  sort_order integer not null default 0
);

-- Gauge weights for current epoch (governance reference)
create table if not exists public.gauges (
  id text primary key,
  epoch_number integer not null,
  name text not null,
  bribe_usd numeric(18, 2) not null default 0,
  apy_label text not null default '—',
  pool_weight_label text not null default '—',
  emission_share_label text not null default '—',
  lp_fees_usd numeric(18, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_gauges_epoch on public.gauges (epoch_number, sort_order);

-- Reward stream documentation (D3-Fi earn / refer help)
create table if not exists public.reward_stream_docs (
  id text primary key,
  title_zh text not null,
  title_en text not null,
  asset_zh text not null,
  asset_en text not null,
  where_zh text not null,
  where_en text not null,
  desc_zh text not null,
  desc_en text not null,
  sort_order integer not null default 0
);

-- Protocol business constants (referral rates, etc.)
create table if not exists public.protocol_config (
  key text primary key,
  value_json jsonb not null,
  label_zh text,
  label_en text,
  updated_at timestamptz not null default now()
);

-- Union static reference content
create table if not exists public.union_equity_items (
  key text primary key,
  pct numeric(5, 2) not null,
  zh text not null,
  en text not null,
  rule_zh text not null,
  rule_en text not null,
  sort_order integer not null default 0
);

create table if not exists public.union_revenue_items (
  id text primary key,
  zh text not null,
  en text not null,
  source_zh text not null,
  source_en text not null,
  cycle_zh text not null,
  cycle_en text not null,
  usd3_zh text not null,
  usd3_en text not null,
  d3_zh text not null,
  d3_en text not null,
  sort_order integer not null default 0
);

create table if not exists public.union_rule_cards (
  id text primary key,
  title_zh text not null,
  title_en text not null,
  body_zh text not null,
  body_en text not null,
  tag_zh text not null,
  tag_en text not null,
  accent text not null default '#E0568F',
  sort_order integer not null default 0
);

alter table public.v_level_tiers enable row level security;
alter table public.gauges enable row level security;
alter table public.reward_stream_docs enable row level security;
alter table public.protocol_config enable row level security;
alter table public.union_equity_items enable row level security;
alter table public.union_revenue_items enable row level security;
alter table public.union_rule_cards enable row level security;

create policy "v_level_tiers_read_all" on public.v_level_tiers for select using (true);
create policy "gauges_read_all" on public.gauges for select using (true);
create policy "reward_stream_docs_read_all" on public.reward_stream_docs for select using (true);
create policy "protocol_config_read_all" on public.protocol_config for select using (true);
create policy "union_equity_items_read_all" on public.union_equity_items for select using (true);
create policy "union_revenue_items_read_all" on public.union_revenue_items for select using (true);
create policy "union_rule_cards_read_all" on public.union_rule_cards for select using (true);
