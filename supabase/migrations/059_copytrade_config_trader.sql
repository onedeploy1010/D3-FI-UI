-- Record which trader a copy-trade config is copying (from the leaderboard /
-- address lookup). Additive + idempotent; safe to re-run.
alter table public.copytrade_configs
  add column if not exists trader_address text;
