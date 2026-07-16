-- P1: D3-denominated yield + single D3 price source + daily state anchoring.
--
-- Model change (additive, non-destructive):
--   * Stake yield accrues in D3 QUANTITY, not USDT:
--       daily_release_d3 = principal_usdt * 0.4% / d3_price
--       exit_cap_d3      = staked_d3 * exit_multiplier   (6x USDT-stake, 2x UD3-restake)
--   * Flash-swap values released D3 at the CURRENT D3 price:
--       usdt_gross = released_d3 * d3_price ; usdt_net = gross - 3% fee
--   * UD3 (reward) is pegged 1 UD3 = 1 USDT and is NOT withdrawable
--     (only transfer-to-downline or re-stake). sD3 engine is deprecated.
--
-- Existing USDT-denominated columns (daily_yield_usdt, accrued_yield_usdt,
-- pending_usdt_yield) are kept for backfill/parallel-run and are dropped in a
-- later migration once the D3 path is verified.

-- ─── D3 price source (single source of truth; see _shared/d3Price.ts) ─────────
create table if not exists public.d3_price_settings (
  id         smallint primary key default 1,
  price_usdt numeric(18, 6) not null default 5,
  source     text not null default 'admin_const'
    check (source in ('admin_const', 'oracle')),
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.d3_price_settings (id, price_usdt, source)
values (1, 5, 'admin_const')
on conflict (id) do nothing;

comment on table public.d3_price_settings is
  'Admin-set D3 unit price (USDT per D3). Future: source=oracle for on-chain feed.';

-- ─── Stake positions: D3-denominated principal / release / exit cap ───────────
alter table public.partner_stake_positions
  add column if not exists staked_d3         numeric(24, 6),
  add column if not exists d3_price_at_stake numeric(18, 6),
  add column if not exists daily_release_d3  numeric(24, 6),
  add column if not exists released_d3       numeric(24, 6) not null default 0,
  add column if not exists exit_cap_d3       numeric(24, 6);

comment on column public.partner_stake_positions.staked_d3 is
  'D3 principal = principal_usdt / d3_price_at_stake (locked at stake time)';
comment on column public.partner_stake_positions.daily_release_d3 is
  'Daily D3 released = principal_usdt * 0.4% / d3_price_at_stake';
comment on column public.partner_stake_positions.exit_cap_d3 is
  'Cumulative D3 release cap = staked_d3 * exit_multiplier (6x USDT, 2x UD3)';

-- ─── Accounts: D3 yield ledger (pending = released, awaiting flash-swap) ──────
alter table public.partner_accounts
  add column if not exists pending_d3_yield  numeric(24, 6) not null default 0,
  add column if not exists lifetime_d3_yield numeric(24, 6) not null default 0;

comment on column public.partner_accounts.pending_d3_yield is
  'Released-but-unswapped D3. Flash-swap converts to USDT at current price - 3% fee.';

-- ─── Daily yield settlement rows: record the D3 released that day ─────────────
alter table public.partner_yield_settlements
  add column if not exists yield_d3 numeric(24, 6),
  add column if not exists d3_price numeric(18, 6);

comment on column public.partner_yield_settlements.yield_d3 is
  'D3 released this settlement day (authoritative); yield_usdt is the audit valuation.';

-- ─── Flash-swap (yield withdraw): record D3 side of the swap ──────────────────
alter table public.partner_yield_withdrawals
  add column if not exists d3_amount        numeric(24, 6),
  add column if not exists d3_price_at_swap numeric(18, 6);

comment on column public.partner_yield_withdrawals.d3_amount is
  'Released D3 burned in this flash-swap';
comment on column public.partner_yield_withdrawals.d3_price_at_swap is
  'D3 price used to value the swap (gross_usdt = d3_amount * this)';

-- ─── sD3 deprecated → consolidate into the single UD3 reward ──────────────────
-- (partner_stake_positions.kind is free-text; enforced in app code.)
-- Backfill legacy sd3 positions to ud3 so the single-reward model is consistent.
update public.partner_stake_positions set kind = 'ud3' where kind = 'sd3';

-- Move any legacy sd3 balances into ud3 (self-zeroing so a re-run adds 0).
update public.partner_accounts
  set ud3_balance         = coalesce(ud3_balance, 0)         + coalesce(sd3_balance, 0),
      lifetime_ud3_earned = coalesce(lifetime_ud3_earned, 0) + coalesce(lifetime_sd3_earned, 0),
      sd3_balance         = 0,
      lifetime_sd3_earned = 0,
      updated_at          = now()
  where coalesce(sd3_balance, 0) <> 0 or coalesce(lifetime_sd3_earned, 0) <> 0;

-- ─── Daily state anchor (tamper-evidence): Merkle root of all balances on-chain
create table if not exists public.daily_state_anchors (
  settlement_date date primary key,
  merkle_root     text not null,
  leaf_count      integer not null default 0,
  tx_hash         text,
  anchored_at     timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.daily_state_anchors is
  'Daily Merkle root of {wallet -> balances}, anchored on BSC so off-chain ledger tampering is detectable.';
