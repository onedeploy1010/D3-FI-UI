-- NEW-1 (HIGH): Atomic balance-CREDIT RPCs (companion to 034's atomic debits).
--
-- 034 made the spendable-balance DEBITS atomic (single conditional UPDATE under a
-- row lock). But the paired CREDITS in application code were still read-modify-write:
--   acct = SELECT balance;  UPDATE SET balance = acct.balance + delta;
-- A concurrent atomic debit that lands between that SELECT and UPDATE is clobbered by
-- the stale write-back -> lost update -> double-spend. These functions perform the
-- credit as a single `UPDATE ... SET col = col + p_amount RETURNING col`, so the row
-- lock serialises them against the 034 debits on the SAME column.
--
-- All functions mirror the 034 style:
--   * security definer + fixed search_path=public (immune to caller search_path)
--   * validate p_amount > 0 (INVALID_AMOUNT otherwise)
--   * case-insensitive wallet match (lower(wallet_address)=lower(p_wallet))
--   * NOT FOUND -> raise ACCOUNT_NOT_FOUND (caller provisions the row then retries)
--   * execute granted to service_role only; revoked from public/anon/authenticated.
--
-- Idempotent (create or replace). NOTE: credit_pending_d3_yield already exists in 034
-- (compensating add-back) and is REUSED as-is here — it is intentionally NOT redefined.
-- Only credit_ud3_balance is new.

-- ── credit_ud3_balance ────────────────────────────────────────────────────────
create or replace function public.credit_ud3_balance(p_wallet text, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  update public.partner_accounts
    set ud3_balance = ud3_balance + p_amount,
        updated_at = now()
    where lower(wallet_address) = lower(p_wallet)
    returning ud3_balance into v_balance;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;

  return v_balance;
end;
$$;

-- ── Execute grants: service_role only ─────────────────────────────────────────
do $$
declare
  fn text;
  fns text[] := array[
    'credit_ud3_balance(text, numeric)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function public.%s from public, anon, authenticated;', fn);
    execute format('grant execute on function public.%s to service_role;', fn);
  end loop;
end $$;
