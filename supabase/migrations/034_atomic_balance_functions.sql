-- V-03 / V-06: Atomic balance-mutation RPCs.
--
-- Read-modify-write balance updates in application code are racy (TOCTOU): two
-- concurrent requests can both read a sufficient balance and both debit. These
-- SECURITY DEFINER functions perform the check-and-debit in a SINGLE conditional
-- UPDATE, so the row lock serialises concurrent callers and an insufficient
-- balance simply matches zero rows -> raises INSUFFICIENT_BALANCE.
--
-- All functions:
--   * security definer + fixed search_path=public (immune to caller search_path)
--   * validate p_amount > 0 (INVALID_AMOUNT otherwise)
--   * case-insensitive wallet match (lower(wallet_address)=lower(p_wallet))
--   * execute granted to service_role only; revoked from anon/authenticated.
--
-- Balance columns verified: partner_accounts.pending_d3_yield (027, numeric(24,6)),
-- partner_accounts.ud3_balance (023, numeric(24,6)).

-- ── debit_pending_d3_yield ────────────────────────────────────────────────────
create or replace function public.debit_pending_d3_yield(p_wallet text, p_amount numeric)
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
    set pending_d3_yield = pending_d3_yield - p_amount,
        updated_at = now()
    where lower(wallet_address) = lower(p_wallet)
      and pending_d3_yield >= p_amount
    returning pending_d3_yield into v_balance;

  if not found then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  return v_balance;
end;
$$;

-- ── credit_pending_d3_yield (compensating add-back) ───────────────────────────
create or replace function public.credit_pending_d3_yield(p_wallet text, p_amount numeric)
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
    set pending_d3_yield = pending_d3_yield + p_amount,
        updated_at = now()
    where lower(wallet_address) = lower(p_wallet)
    returning pending_d3_yield into v_balance;

  if not found then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;

  return v_balance;
end;
$$;

-- ── debit_ud3_balance ─────────────────────────────────────────────────────────
create or replace function public.debit_ud3_balance(p_wallet text, p_amount numeric)
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
    set ud3_balance = ud3_balance - p_amount,
        updated_at = now()
    where lower(wallet_address) = lower(p_wallet)
      and ud3_balance >= p_amount
    returning ud3_balance into v_balance;

  if not found then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  return v_balance;
end;
$$;

-- ── transfer_ud3 (atomic debit sender + credit recipient in one txn) ───────────
create or replace function public.transfer_ud3(p_from text, p_to text, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_balance numeric;
  v_to_found boolean;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- Debit sender (fails closed if insufficient).
  update public.partner_accounts
    set ud3_balance = ud3_balance - p_amount,
        updated_at = now()
    where lower(wallet_address) = lower(p_from)
      and ud3_balance >= p_amount
    returning ud3_balance into v_from_balance;

  if not found then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- Credit recipient; if the recipient row does not exist, the whole txn rolls back.
  update public.partner_accounts
    set ud3_balance = ud3_balance + p_amount,
        updated_at = now()
    where lower(wallet_address) = lower(p_to)
    returning true into v_to_found;

  if not found then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;

  return v_from_balance;
end;
$$;

-- ── Execute grants: service_role only ─────────────────────────────────────────
do $$
declare
  fn text;
  fns text[] := array[
    'debit_pending_d3_yield(text, numeric)',
    'credit_pending_d3_yield(text, numeric)',
    'debit_ud3_balance(text, numeric)',
    'transfer_ud3(text, text, numeric)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function public.%s from public, anon, authenticated;', fn);
    execute format('grant execute on function public.%s to service_role;', fn);
  end loop;
end $$;
