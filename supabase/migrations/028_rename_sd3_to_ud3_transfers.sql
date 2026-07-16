-- Batch C (step 1): physically rename the sD3 transfer ledger to UD3.
-- sD3 is retired; the single referral reward is UD3 (1 UD3 = 1 USDT), transferable
-- to downline members. Table/column/index renames are transactional; PG rewrites
-- the check-constraint expression and RLS policy bindings with the table.

alter table if exists public.partner_sd3_transfers
  rename to partner_ud3_transfers;

alter table if exists public.partner_ud3_transfers
  rename column amount_sd3 to amount_ud3;

alter index if exists public.partner_sd3_transfers_from_idx
  rename to partner_ud3_transfers_from_idx;

alter index if exists public.partner_sd3_transfers_to_idx
  rename to partner_ud3_transfers_to_idx;
