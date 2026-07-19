-- Per-member subsidy-rate override. NULL = fall back to the global default (10%).
-- Admins with the `subsidies.rates` permission can set this from 会员管理 / 合伙人管理.
alter table public.partner_accounts
  add column if not exists subsidy_rate_pct numeric;

comment on column public.partner_accounts.subsidy_rate_pct is
  'Per-member subsidy rate % override (0-100). NULL uses the global default (10%).';
