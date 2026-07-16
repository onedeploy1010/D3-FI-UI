-- V-23: Non-negative balance CHECK constraints on all account balance columns.
--
-- A negative balance can only arise from a race / accounting bug; these constraints
-- turn such a bug into a failed transaction instead of silently corrupted funds.
-- Column names verified against migrations 001 (usd3_accounts, d3_accounts),
-- 017 (partner_accounts base) and 023/027 (partner_accounts UD3 / D3 columns).
--
-- Each add-constraint is wrapped so a re-run (duplicate_object) is a no-op, and
-- guarded by a to_regclass check so a missing table no-ops.

-- ── partner_accounts (017 base + 023 UD3 + 027 D3) ────────────────────────────
do $$
begin
  if to_regclass('public.partner_accounts') is not null then
    begin
      alter table public.partner_accounts
        add constraint partner_accounts_sd3_balance_nonneg check (sd3_balance >= 0);
    exception when duplicate_object then null; end;
    begin
      alter table public.partner_accounts
        add constraint partner_accounts_ud3_balance_nonneg check (ud3_balance >= 0);
    exception when duplicate_object then null; end;
    begin
      alter table public.partner_accounts
        add constraint partner_accounts_pending_usdt_yield_nonneg check (pending_usdt_yield >= 0);
    exception when duplicate_object then null; end;
    begin
      alter table public.partner_accounts
        add constraint partner_accounts_pending_d3_yield_nonneg check (pending_d3_yield >= 0);
    exception when duplicate_object then null; end;
  end if;
end $$;

-- ── usd3_accounts (001) ───────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.usd3_accounts') is not null then
    begin
      alter table public.usd3_accounts
        add constraint usd3_accounts_balance_nonneg check (balance >= 0);
    exception when duplicate_object then null; end;
    begin
      alter table public.usd3_accounts
        add constraint usd3_accounts_available_nonneg check (available >= 0);
    exception when duplicate_object then null; end;
    begin
      alter table public.usd3_accounts
        add constraint usd3_accounts_self_pool_remaining_nonneg check (self_pool_remaining >= 0);
    exception when duplicate_object then null; end;
    begin
      alter table public.usd3_accounts
        add constraint usd3_accounts_downline_pool_remaining_nonneg check (downline_pool_remaining >= 0);
    exception when duplicate_object then null; end;
  end if;
end $$;

-- ── d3_accounts (001) ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.d3_accounts') is not null then
    begin
      alter table public.d3_accounts
        add constraint d3_accounts_pending_d3_nonneg check (pending_d3 >= 0);
    exception when duplicate_object then null; end;
    begin
      alter table public.d3_accounts
        add constraint d3_accounts_claimed_lifetime_d3_nonneg check (claimed_lifetime_d3 >= 0);
    exception when duplicate_object then null; end;
  end if;
end $$;
