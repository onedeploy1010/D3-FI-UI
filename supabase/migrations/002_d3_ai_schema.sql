-- D³-AI Analytics — full data schema
-- Depends on: 001_d3_union_schema.sql (profiles.wallet_address)

-- ── AI user accounts (extends profiles) ────────────────────────────────────────
create table if not exists public.ai_user_accounts (
  wallet_address text primary key references public.profiles (wallet_address) on delete cascade,
  username text not null default 'AlphaTrader',
  avatar_url text,
  rank_label text not null default 'Diamond Lv.5',
  alpha_score integer not null default 847,
  tokens integer not null default 500,
  knowledge_base_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Platform strategy catalog ────────────────────────────────────────────────
create table if not exists public.platform_strategies (
  id text primary key,
  name text not null,
  author text not null default 'D3-AI',
  description text not null default '',
  long_desc text not null default '',
  category text not null default 'Quant',
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  token_cost integer not null default 0,
  win_rate numeric(6, 2) not null default 0,
  roi_90d numeric(8, 2) not null default 0,
  max_drawdown numeric(6, 2) not null default 0,
  subscribers integer not null default 0,
  is_ai boolean not null default true,
  tags text[] not null default '{}',
  features text[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── User-owned strategies ────────────────────────────────────────────────────
create table if not exists public.user_strategies (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  strategy_id text not null references public.platform_strategies (id) on delete cascade,
  tokens_spent integer not null default 0,
  purchased_at timestamptz not null default now(),
  unique (wallet_address, strategy_id)
);

create index if not exists idx_user_strategies_wallet on public.user_strategies (wallet_address);

-- ── Platform agents (fleet + copytrade) ──────────────────────────────────────
create table if not exists public.platform_agents (
  id text primary key,
  name text not null,
  role text,
  description text not null default '',
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  capabilities text[] not null default '{}',
  agent_type text not null default 'fleet' check (agent_type in ('fleet', 'copytrade')),
  win_rate numeric(6, 2),
  avg_roi numeric(8, 2),
  max_drawdown numeric(6, 2),
  signals_count integer default 0,
  style text,
  features text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Platform agent status snapshots ──────────────────────────────────────────
create table if not exists public.platform_agent_status (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.platform_agents (id) on delete cascade,
  status text not null default 'active',
  accuracy numeric(6, 2),
  epoch integer,
  insight text,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_agent_status_agent on public.platform_agent_status (agent_id, recorded_at desc);

-- ── User trained / held agents ───────────────────────────────────────────────
create table if not exists public.user_agents (
  id text not null,
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  name text not null,
  strategy text,
  model text,
  score numeric(8, 2) not null default 0,
  win_rate numeric(6, 2) not null default 0,
  backtest_pnl numeric(18, 4) not null default 0,
  backtest_pnl_pct numeric(8, 2) not null default 0,
  max_drawdown numeric(6, 2) not null default 0,
  sharpe_ratio numeric(6, 2) not null default 0,
  trades integer not null default 0,
  risk_level text not null default 'medium',
  is_candidate boolean not null default false,
  trained_at timestamptz,
  deployed_at timestamptz,
  sim_status text,
  sim_started_at timestamptz,
  sim_pnl_pct numeric(8, 2),
  sim_win_rate numeric(6, 2),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (wallet_address, id)
);

-- ── Simulation runs ──────────────────────────────────────────────────────────
create table if not exists public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  wallet_address text references public.profiles (wallet_address) on delete set null,
  agent_id text,
  name text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  accuracy numeric(6, 2),
  epochs integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_sim_runs_wallet on public.simulation_runs (wallet_address);

-- ── Simulation leaderboard ───────────────────────────────────────────────────
create table if not exists public.sim_leaderboard (
  id uuid primary key default gen_random_uuid(),
  rank integer not null,
  name text not null,
  score numeric(8, 2) not null,
  pnl numeric(8, 2) not null,
  period text not null default 'all',
  recorded_at timestamptz not null default now()
);

-- ── Copy trade ───────────────────────────────────────────────────────────────
create table if not exists public.copytrade_exchanges (
  id serial primary key,
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  name text not null,
  slug text not null,
  trading_enabled boolean not null default false,
  api_key_masked text,
  is_connected boolean not null default false,
  balance numeric(18, 4) not null default 0,
  exchange text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.copytrade_configs (
  id serial primary key,
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  name text not null,
  allocation_percent numeric(6, 2) not null default 10,
  max_leverage integer not null default 3,
  is_active boolean not null default true,
  exchange_id integer references public.copytrade_exchanges (id) on delete set null,
  stop_loss_percent numeric(6, 2),
  take_profit_percent numeric(6, 2),
  created_at timestamptz not null default now()
);

create table if not exists public.copytrade_orders (
  id serial primary key,
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  symbol text not null,
  side text not null,
  order_type text not null default 'market',
  status text not null default 'open',
  pnl numeric(18, 4),
  price numeric(18, 8),
  quantity numeric(18, 8),
  ai_score integer,
  ai_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.copytrade_stats (
  wallet_address text primary key references public.profiles (wallet_address) on delete cascade,
  total_pnl numeric(18, 4) not null default 0,
  win_rate numeric(6, 2) not null default 0,
  active_configs integer not null default 0,
  total_trades integer not null default 0,
  sharpe_ratio numeric(6, 2) not null default 0,
  max_drawdown numeric(6, 2) not null default 0,
  updated_at timestamptz not null default now()
);

-- ── Trading signals ──────────────────────────────────────────────────────────
create table if not exists public.trading_signals (
  id bigserial primary key,
  wallet_address text references public.profiles (wallet_address) on delete cascade,
  symbol text not null,
  direction text not null,
  confidence numeric(4, 2) not null,
  source text,
  reason text,
  status text not null default 'active',
  pnl numeric(18, 4),
  created_at timestamptz not null default now()
);

create index if not exists idx_trading_signals_wallet on public.trading_signals (wallet_address, created_at desc);

-- ── Notifications ────────────────────────────────────────────────────────────
create table if not exists public.ai_notifications (
  id bigserial primary key,
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'system',
  symbol text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_notifications_wallet on public.ai_notifications (wallet_address, created_at desc);

create table if not exists public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  channel_type text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── AI analysis cache & chat ─────────────────────────────────────────────────
create table if not exists public.market_analysis_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  agent_id text,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_chat_wallet on public.ai_chat_messages (wallet_address, created_at desc);

-- ── AI hub snapshots ─────────────────────────────────────────────────────────
create table if not exists public.ai_hub_snapshots (
  id uuid primary key default gen_random_uuid(),
  active_agents integer not null default 0,
  total_epochs integer not null default 0,
  avg_accuracy numeric(6, 2) not null default 0,
  system_health text not null default 'optimal',
  learning_progress numeric(6, 2) not null default 0,
  total_sim_accounts integer not null default 0,
  fear_greed_index integer,
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

-- ── Triggers ─────────────────────────────────────────────────────────────────
drop trigger if exists ai_user_accounts_updated_at on public.ai_user_accounts;
create trigger ai_user_accounts_updated_at
  before update on public.ai_user_accounts
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────────
alter table public.ai_user_accounts enable row level security;
alter table public.platform_strategies enable row level security;
alter table public.user_strategies enable row level security;
alter table public.platform_agents enable row level security;
alter table public.platform_agent_status enable row level security;
alter table public.user_agents enable row level security;
alter table public.simulation_runs enable row level security;
alter table public.sim_leaderboard enable row level security;
alter table public.copytrade_exchanges enable row level security;
alter table public.copytrade_configs enable row level security;
alter table public.copytrade_orders enable row level security;
alter table public.copytrade_stats enable row level security;
alter table public.trading_signals enable row level security;
alter table public.ai_notifications enable row level security;
alter table public.notification_channels enable row level security;
alter table public.market_analysis_cache enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_hub_snapshots enable row level security;

-- Public read for platform catalog
create policy "platform_strategies_public_read" on public.platform_strategies
  for select using (is_active = true);

create policy "platform_agents_public_read" on public.platform_agents
  for select using (is_active = true);

create policy "sim_leaderboard_public_read" on public.sim_leaderboard
  for select using (true);
