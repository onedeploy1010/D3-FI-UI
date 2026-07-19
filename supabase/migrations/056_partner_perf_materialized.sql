-- Materialize raw partner performance onto partner_accounts so display / risk /
-- audit reads can skip re-walking the referral subtree. Written fresh by the UD3
-- settlement (cacheAccountLevels) every time an account appears in a settle chain.
-- The money path itself still computes fresh — it does NOT read these columns.
alter table public.partner_accounts
  add column if not exists team_perf_usdt numeric,
  add column if not exists small_area_perf_usdt numeric;

comment on column public.partner_accounts.team_perf_usdt is
  'Cached 总业绩 (downline team volume, USDT). Drives 档位 (ud3_tier_id). Display/audit only.';
comment on column public.partner_accounts.small_area_perf_usdt is
  'Cached 小区业绩 (small-area = all lines minus largest, USDT). Drives 网体 S-级别 (ud3_v_level). Display/audit only.';
