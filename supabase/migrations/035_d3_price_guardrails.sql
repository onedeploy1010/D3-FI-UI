-- V-05: D3 price guardrail columns.
--
-- The D3 price (d3_price_settings, 027) drives flash-swap USDT payouts. An admin
-- fat-finger or compromised admin token could set an absurd price and drain the
-- flash-swap wallet. These columns give _shared/d3Price.ts (Agent F) hard bounds:
--   * min/max absolute price clamp
--   * max single-update deviation vs previous_price_usdt
--   * expires_at so a stale price can be rejected as unsafe.
--
-- Base table d3_price_settings has a single row id=1 (price_usdt numeric(18,6)).

alter table public.d3_price_settings
  add column if not exists min_price_usdt      numeric(18, 6),
  add column if not exists max_price_usdt      numeric(18, 6),
  add column if not exists max_deviation_pct   numeric(8, 4),
  add column if not exists previous_price_usdt numeric(18, 6),
  add column if not exists expires_at          timestamptz;

comment on column public.d3_price_settings.min_price_usdt is
  'Hard lower bound for an accepted D3 price (USDT).';
comment on column public.d3_price_settings.max_price_usdt is
  'Hard upper bound for an accepted D3 price (USDT).';
comment on column public.d3_price_settings.max_deviation_pct is
  'Max allowed % change of a single price update vs previous_price_usdt.';
comment on column public.d3_price_settings.previous_price_usdt is
  'Prior accepted price; used to bound single-update deviation.';
comment on column public.d3_price_settings.expires_at is
  'Price is considered stale/unsafe after this timestamp.';

-- Seed sane defaults for the singleton row (only where unset, so re-run is a no-op).
update public.d3_price_settings
  set min_price_usdt    = coalesce(min_price_usdt, 0.5),
      max_price_usdt    = coalesce(max_price_usdt, 50),
      max_deviation_pct = coalesce(max_deviation_pct, 20)
  where id = 1
    and (min_price_usdt is null
      or max_price_usdt is null
      or max_deviation_pct is null);
