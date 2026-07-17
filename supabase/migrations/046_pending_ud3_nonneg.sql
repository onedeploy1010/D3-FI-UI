-- R-6: Non-negative CHECK on partner_accounts.pending_ud3.
--
-- `pending_ud3` is the two-phase UD3 reward holding balance (accrued at deposit time,
-- moved into ud3_balance by the daily settlement's settle_pending_ud3). Its sibling
-- balance columns (ud3_balance, pending_d3_yield, pending_usdt_yield, sd3_balance) all
-- gained `>= 0` CHECKs in 032, but pending_ud3 was missed. A negative value can only
-- come from a race / accounting bug; this constraint turns such a bug into a failed
-- transaction instead of silently corrupted funds.
--
-- Same guarding as 032: the add-constraint is wrapped so a re-run (duplicate_object)
-- is a no-op, and guarded by a to_regclass check so a missing table no-ops.

do $$
begin
  if to_regclass('public.partner_accounts') is not null then
    begin
      alter table public.partner_accounts
        add constraint partner_accounts_pending_ud3_nonneg check (pending_ud3 >= 0);
    exception when duplicate_object then null; end;
  end if;
end $$;
