-- UD3 (反向金) two-phase settlement.
--
-- Before: UD3 rewards were credited to the spendable `ud3_balance` the moment a
-- downline deposit was credited — so the reward showed as "已结算" instantly.
--
-- After: a reward accrues to `pending_ud3` at generation and is only moved into
-- the spendable `ud3_balance` by the daily SGT-midnight settlement run — mirroring
-- how D3 yield settles. The ledger row carries a `settled` flag so the UI can show
-- 未结算 (pending) vs 已结算 (settled), and the home balance reflects settled UD3 only.
--
-- Idempotent.

alter table public.partner_accounts
  add column if not exists pending_ud3 numeric not null default 0;

alter table public.partner_ud3_ledger
  add column if not exists settled boolean not null default false,
  add column if not exists settled_at timestamptz,
  add column if not exists settlement_date date;

create index if not exists partner_ud3_ledger_unsettled_idx
  on public.partner_ud3_ledger (settled) where settled = false;

-- Atomic credit to pending_ud3 at generation (single UPDATE under row lock).
-- Raises ACCOUNT_NOT_FOUND so the caller can provision + retry (same contract as
-- credit_ud3_balance).
create or replace function public.credit_pending_ud3(p_wallet text, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare v numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  update public.partner_accounts
     set pending_ud3 = pending_ud3 + p_amount,
         updated_at = now()
   where lower(wallet_address) = lower(p_wallet)
   returning pending_ud3 into v;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;
  return v;
end;
$$;

-- Atomic settle: move ALL of a wallet's pending_ud3 into the spendable ud3_balance
-- and bump the monotonic lifetime counter. Returns the amount moved (0 if none).
create or replace function public.settle_pending_ud3(p_wallet text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare moved numeric;
begin
  -- Lock the row and capture the pending amount before zeroing it.
  select pending_ud3 into moved
    from public.partner_accounts
   where lower(wallet_address) = lower(p_wallet)
   for update;
  if moved is null or moved <= 0 then
    return 0;
  end if;
  update public.partner_accounts
     set ud3_balance = ud3_balance + moved,
         lifetime_ud3_earned = lifetime_ud3_earned + moved,
         pending_ud3 = pending_ud3 - moved,
         updated_at = now()
   where lower(wallet_address) = lower(p_wallet);
  return moved;
end;
$$;

revoke all on function public.credit_pending_ud3(text, numeric) from public, anon;
revoke all on function public.settle_pending_ud3(text) from public, anon;
grant execute on function public.credit_pending_ud3(text, numeric) to service_role;
grant execute on function public.settle_pending_ud3(text) to service_role;
