-- UD3 (反向金) reward v2 — exact-Decimal calculator snapshot columns.
--
-- The reward math moved to the versioned, exact-Decimal calculator
-- (_shared/ud3Reward.ts + ud3RewardConfig.ts). Each payout is now persisted with a
-- full audit snapshot (guide vs network-difference vs burn), a config version, and a
-- deterministic idempotency key so replays/retries never double-credit.
--
-- Additive + idempotent: every column is `add column if not exists`, every constraint
-- and index is guarded. Existing columns (role, v_level, v_share_pct, gap_pct,
-- ud3_amount, settled, ...) are kept untouched for back-compat with existing readers.
-- Historical rows are NOT rewritten.

alter table public.partner_ud3_ledger
  add column if not exists reward_type text,
  add column if not exists reward_status text,
  add column if not exists relation_depth int,
  add column if not exists beneficiary_level text,
  add column if not exists guide_level_rate numeric(12, 6),
  add column if not exists cumulative_rate numeric(12, 6),
  add column if not exists previous_released_rate numeric(12, 6),
  add column if not exists difference_rate numeric(12, 6),
  add column if not exists principal_amount numeric(30, 6),
  add column if not exists total_bribe_amount numeric(30, 6),
  add column if not exists network_base_pool numeric(30, 6),
  add column if not exists level_config_version text,
  add column if not exists idempotency_key text,
  add column if not exists calculated_at timestamptz,
  add column if not exists credited_at timestamptz;

comment on column public.partner_ud3_ledger.reward_type is
  'GUIDE_REWARD | NETWORK_DIFFERENCE_REWARD | BURN (v2 calculator classification)';
comment on column public.partner_ud3_ledger.reward_status is
  'PENDING | CALCULATED | CREDITED | FAILED | REVERSED | NO_DIFFERENCE';
comment on column public.partner_ud3_ledger.idempotency_key is
  'Deterministic per-payout key (UD3_REWARD:<order>:<beneficiary>:<type>:<version>); unique guards replays';

-- Guarded check constraints (skip if already present so re-runs are safe).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'partner_ud3_ledger_reward_type_chk'
  ) then
    alter table public.partner_ud3_ledger
      add constraint partner_ud3_ledger_reward_type_chk
      check (reward_type is null or reward_type in
        ('GUIDE_REWARD', 'NETWORK_DIFFERENCE_REWARD', 'BURN'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'partner_ud3_ledger_reward_status_chk'
  ) then
    alter table public.partner_ud3_ledger
      add constraint partner_ud3_ledger_reward_status_chk
      check (reward_status is null or reward_status in
        ('PENDING', 'CALCULATED', 'CREDITED', 'FAILED', 'REVERSED', 'NO_DIFFERENCE'));
  end if;
end
$$;

-- One payout per (order, beneficiary, type, version). Retries hit 23505 and skip.
create unique index if not exists partner_ud3_ledger_idem_uidx
  on public.partner_ud3_ledger (idempotency_key)
  where idempotency_key is not null;

create index if not exists partner_ud3_ledger_reward_type_idx
  on public.partner_ud3_ledger (reward_type);
