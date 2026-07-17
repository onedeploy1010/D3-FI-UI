-- Fix: UD3 stake returns 500 "Internal Server Error".
--
-- The reward was renamed sD3 -> UD3 and the stake code inserts partner_stake_
-- positions with kind = 'ud3', but the kind CHECK constraint still only allowed
-- ['partner_join','crowdfund_stake','sd3']. So every UD3 (re)stake INSERT violated
-- the constraint and threw — no UD3 stake could ever be created.
--
-- Allow 'ud3' (keep 'sd3' for any legacy rows). exitMultiplierForKind() already
-- treats both 'ud3' and 'sd3' as the 2x UD3-restake kind.
--
-- Idempotent.

alter table public.partner_stake_positions
  drop constraint if exists partner_stake_positions_kind_check;
alter table public.partner_stake_positions
  add constraint partner_stake_positions_kind_check
  check (kind = any (array['partner_join'::text, 'crowdfund_stake'::text, 'sd3'::text, 'ud3'::text]));
