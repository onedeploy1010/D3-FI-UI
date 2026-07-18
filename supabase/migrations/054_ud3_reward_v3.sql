-- UD3 (反向金) reward V3 — tier-coefficient × cumulative-difference snapshot columns.
--
-- The reward math is now the V3 calculator (_shared/ud3Reward.ts +
-- ud3RewardConfig.ts, UD3_ALGO_VERSION_V3 = 'V3_TIER_COEFFICIENT_CUMULATIVE_DIFFERENCE').
-- The network reward is split across SIX fixed tier slots S1..S6; each slot is either
-- paid to the nearest qualified + eligible up-chain ancestor (CALCULATED) or left
-- UNALLOCATED (no qualified/eligible ancestor). This migration records the extra V3
-- audit fields (which tier slot, its coefficient/incremental rate, who received it and
-- at what tier) alongside the existing V2 columns.
--
-- Additive + idempotent: every column is `add column if not exists`, every constraint
-- drop/recreate and index is guarded. Existing columns (role, reward_type,
-- reward_status, cumulative_rate, previous_released_rate, difference_rate,
-- ud3_amount, settled, idempotency_key, ...) are kept untouched for back-compat with
-- existing readers. Historical rows are NOT rewritten.

alter table public.partner_ud3_ledger
  add column if not exists reward_tier_code text,
  add column if not exists reward_tier_rank int,
  add column if not exists receiver_tier_code text,
  add column if not exists receiver_tier_rank int,
  add column if not exists tier_coefficient numeric(12, 6),
  add column if not exists incremental_rate numeric(12, 6),
  add column if not exists reward_algorithm_version text,
  add column if not exists unallocated_reason text;

comment on column public.partner_ud3_ledger.reward_tier_code is
  'V3 network tier slot this row represents (S1..S6). NULL for guide/legacy rows.';
comment on column public.partner_ud3_ledger.reward_tier_rank is
  'V3 tier slot ordinal rank (S1=1 … S6=6).';
comment on column public.partner_ud3_ledger.receiver_tier_code is
  'V3 own 档位 of the ancestor that received this slot (NULL when UNALLOCATED).';
comment on column public.partner_ud3_ledger.receiver_tier_rank is
  'V3 own tier rank of the receiving ancestor (NULL when UNALLOCATED).';
comment on column public.partner_ud3_ledger.tier_coefficient is
  'V3 档位系数 applied to this reward (guide or network slot).';
comment on column public.partner_ud3_ledger.incremental_rate is
  'V3 级差 (cumulative[Sk] − cumulative[Sk-1]) for this tier slot.';
comment on column public.partner_ud3_ledger.reward_algorithm_version is
  'Algorithm identifier (e.g. V3_TIER_COEFFICIENT_CUMULATIVE_DIFFERENCE).';
comment on column public.partner_ud3_ledger.unallocated_reason is
  'Why a slot went UNALLOCATED (NO_QUALIFIED_ANCESTOR | EMPTY_REFERRAL_CHAIN | ALL_MATCHED_USERS_INELIGIBLE).';

-- Extend the reward_status CHECK to include 'UNALLOCATED'. Drop + recreate guarded,
-- nullable-tolerant (a NULL status is always allowed for legacy rows).
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'partner_ud3_ledger_reward_status_chk'
  ) then
    alter table public.partner_ud3_ledger
      drop constraint partner_ud3_ledger_reward_status_chk;
  end if;

  alter table public.partner_ud3_ledger
    add constraint partner_ud3_ledger_reward_status_chk
    check (reward_status is null or reward_status in
      ('PENDING', 'CALCULATED', 'CREDITED', 'FAILED', 'REVERSED', 'NO_DIFFERENCE', 'UNALLOCATED'));
end
$$;

-- V3 idempotency: one payout per (order, tier-slot, algo-version). The V3 settle path
-- writes ud3TierRewardIdempotencyKey(order, tierCode, algoVersion) into idempotency_key,
-- so retries hit 23505 on this unique index and skip (never double-credit). This index
-- co-exists with the 052 partner_ud3_ledger_idem_uidx (same column, both partial on
-- NOT NULL) so either name resolving first still enforces uniqueness.
create unique index if not exists partner_ud3_ledger_tier_idem_uidx
  on public.partner_ud3_ledger (idempotency_key)
  where idempotency_key is not null;

create index if not exists partner_ud3_ledger_reward_tier_idx
  on public.partner_ud3_ledger (reward_tier_code);
