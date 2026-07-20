-- Seed D³-AI platform catalog + demo user
-- Run after 002_d3_ai_schema.sql

-- Demo profile (matches Portal mock wallet)
insert into public.profiles (wallet_address, display_name, short_address, lang)
values (
  '0x1234567890abcdef1234567890abcdef12345678',
  'AlphaTrader',
  '0x1234…7890',
  'zh'
)
on conflict (wallet_address) do nothing;

-- AI user account
insert into public.ai_user_accounts (wallet_address, username, rank_label, alpha_score, tokens, knowledge_base_ids)
values (
  '0x1234567890abcdef1234567890abcdef12345678',
  'AlphaTrader',
  'Diamond Lv.5',
  847,
  500,
  array['poly-momentum', 'deep-value']::text[]
)
on conflict (wallet_address) do nothing;

-- Platform strategies
insert into public.platform_strategies (id, name, author, description, long_desc, category, risk_level, token_cost, win_rate, roi_90d, max_drawdown, subscribers, is_ai, tags, features, sort_order)
values
  ('poly-momentum', 'Polymarket Momentum', 'D3-AI', 'Follows price momentum on prediction markets.', 'Multi-timeframe momentum system for prediction markets.', 'Momentum', 'medium', 0, 64.2, 28.5, 14.2, 1247, true, array['momentum','polymarket'], array['Multi-timeframe','Trailing stop'], 1),
  ('deep-value', 'Deep Value Arb', 'D3-AI', 'Identifies underpriced probabilities vs fundamentals.', 'Fundamental scoring model for Polymarket.', 'Value', 'low', 0, 71.8, 19.2, 8.1, 2103, true, array['value','fundamentals'], array['Gap detection','Conviction sizing'], 2),
  ('event-alpha', 'Event Alpha', 'D3-AI', 'Pre-positions around major events.', 'Event calendar integration.', 'Event', 'high', 80, 57.3, 62.1, 28.4, 891, true, array['events','fed'], array['Event calendar','Fast exit'], 3),
  ('sentiment-ai', 'Sentiment AI Pro', 'D3-AI', 'NLP on news and on-chain data.', 'Real-time NLP processing.', 'AI', 'high', 200, 52.8, 89.4, 31.2, 643, true, array['nlp','sentiment'], array['Real-time NLP','On-chain fusion'], 4),
  ('quant-grid', 'Quantitative Grid Bot', 'D3-AI', 'Grid orders in ranging markets.', 'Dynamic grid deployment.', 'Quant', 'medium', 60, 74.1, 32.7, 11.8, 1089, true, array['grid','quant'], array['Dynamic grid','Vol-adjusted'], 5)
on conflict (id) do nothing;

-- User owned strategies for demo
insert into public.user_strategies (wallet_address, strategy_id, tokens_spent)
values
  ('0x1234567890abcdef1234567890abcdef12345678', 'poly-momentum', 0),
  ('0x1234567890abcdef1234567890abcdef12345678', 'deep-value', 0)
on conflict (wallet_address, strategy_id) do nothing;

-- Platform agents (fleet)
insert into public.platform_agents (id, name, role, description, risk_level, capabilities, agent_type, sort_order)
values
  ('analyst', 'ANALYST', 'Market intelligence', 'Analyzes on-chain flows and macro signals.', 'medium', array['Technical analysis','On-chain flow'], 'fleet', 1),
  ('sentinel', 'SENTINEL', 'Risk monitoring', 'Monitors portfolio risk.', 'low', array['VaR monitoring','Drawdown alerts'], 'fleet', 2),
  ('replica', 'REPLICA', 'Trader replication', 'Learns from top traders.', 'medium', array['Trader profiling','Signal mirroring'], 'fleet', 3),
  ('arbiter', 'ARBITER', 'Execution', 'Executes trades and arbitrage.', 'high', array['Order routing','Arb detection'], 'fleet', 4)
on conflict (id) do nothing;

-- Copytrade agents
insert into public.platform_agents (id, name, description, risk_level, agent_type, win_rate, avg_roi, max_drawdown, signals_count, style, features, sort_order)
values
  ('balanced-pro', 'Balanced Pro', 'Balanced risk/reward across majors.', 'medium', 'copytrade', 68.4, 24.2, 12.5, 847, 'Multi-asset balanced', array['BTC/ETH focus','Risk parity'], 10),
  ('momentum-hunter', 'Momentum Hunter', 'Aggressive momentum capture.', 'high', 'copytrade', 58.2, 42.8, 22.1, 1203, 'Momentum breakout', array['Breakout detection','Trailing stops'], 11),
  ('conservative-guard', 'Conservative Guard', 'Low-risk signals.', 'low', 'copytrade', 74.6, 12.3, 6.8, 412, 'Conservative value', array['Tight stops','High win rate'], 12)
on conflict (id) do nothing;

-- Sim leaderboard
insert into public.sim_leaderboard (rank, name, score, pnl)
values
  (1, 'Quant Alpha V4', 94.2, 28.4),
  (2, 'Macro Sentiment NLP', 89.7, 22.1),
  (3, 'Order Flow Analyzer', 86.3, 18.9),
  (4, 'Deep Pattern Rec', 82.5, 15.2),
  (5, 'Adaptive Risk Engine', 79.8, 12.7);

-- Simulation runs for demo user
insert into public.simulation_runs (wallet_address, name, status, accuracy, epochs)
values
  ('0x1234567890abcdef1234567890abcdef12345678', 'BTC Breakout Test', 'completed', 78.3, 500),
  ('0x1234567890abcdef1234567890abcdef12345678', 'ETH Mean Reversion', 'running', 72.1, 312),
  ('0x1234567890abcdef1234567890abcdef12345678', 'Multi-Asset Portfolio', 'queued', 0, 0);

-- Copy trade demo data
insert into public.copytrade_exchanges (wallet_address, name, slug, trading_enabled, api_key_masked, is_connected, balance, exchange)
values ('0x1234567890abcdef1234567890abcdef12345678', 'Binance Main', 'binance', true, '••••4f2a', true, 48250.5, 'binance');

insert into public.copytrade_configs (wallet_address, name, allocation_percent, max_leverage, is_active, exchange_id, stop_loss_percent, take_profit_percent)
select '0x1234567890abcdef1234567890abcdef12345678', 'BTC Momentum', 25, 3, true, e.id, 5, 15
from public.copytrade_exchanges e
where e.wallet_address = '0x1234567890abcdef1234567890abcdef12345678'
and not exists (
  select 1 from public.copytrade_configs c
  where c.wallet_address = '0x1234567890abcdef1234567890abcdef12345678'
);

insert into public.copytrade_stats (wallet_address, total_pnl, win_rate, active_configs, total_trades, sharpe_ratio, max_drawdown)
values ('0x1234567890abcdef1234567890abcdef12345678', 4820.5, 68.4, 1, 127, 1.84, -12.3)
on conflict (wallet_address) do nothing;

insert into public.copytrade_orders (wallet_address, symbol, side, order_type, status, pnl, price, quantity, ai_score, ai_reason)
values ('0x1234567890abcdef1234567890abcdef12345678', 'BTC/USDT', 'buy', 'market', 'filled', 342.5, 68420, 0.15, 87, 'Breakout confirmed');

-- Notifications
insert into public.ai_notifications (wallet_address, title, message, type, symbol, is_read)
values
  ('0x1234567890abcdef1234567890abcdef12345678', 'BTC 突破信号', 'AI Analyst 检测到 BTC 突破关键阻力位', 'ai', 'BTC', false),
  ('0x1234567890abcdef1234567890abcdef12345678', '跟单执行成功', 'ETH 多头仓位已按策略自动开仓', 'trade', 'ETH', false),
  ('0x1234567890abcdef1234567890abcdef12345678', '风险预警', 'Sentinel 检测到市场波动率上升', 'alert', 'BTC', true),
  ('0x1234567890abcdef1234567890abcdef12345678', '系统更新', 'D³-AI 分析站 v2.1 已上线', 'system', null, true),
  ('0x1234567890abcdef1234567890abcdef12345678', 'AI 信号更新', 'BTC 突破关键阻力位，建议关注', 'ai', 'BTC', false),
  ('0x1234567890abcdef1234567890abcdef12345678', '跟单提醒', 'ETH 策略已触发开仓条件', 'trade', 'ETH', false);
