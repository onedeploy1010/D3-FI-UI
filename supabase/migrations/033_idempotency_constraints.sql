-- V-03 / V-21: Idempotency / uniqueness constraints to prevent double-spend and
-- double-credit under concurrent requests.
--
-- 1. partner_yield_withdrawals: at most ONE in-flight withdrawal per wallet. A
--    second concurrent withdraw attempt hits a unique-violation the caller maps to
--    HTTP 409 instead of draining the flash-swap wallet twice.
-- 2. treasury_ledger: dedupe ledger postings by (type, chain, tx_hash, reference)
--    so a webhook / retry cannot post the same on-chain transfer twice.
--
-- Column names verified: partner_yield_withdrawals (018) has wallet_address, status
-- with statuses pending/signing/broadcasted/confirmed/failed/manual_review.
-- treasury_ledger (012) has ledger_type, chain_id, tx_hash, reference_id.

create unique index if not exists partner_yield_withdrawals_inflight_uidx
  on public.partner_yield_withdrawals (wallet_address)
  where status in ('pending', 'signing', 'broadcasted');

create unique index if not exists treasury_ledger_dedupe_uidx
  on public.treasury_ledger (ledger_type, chain_id, lower(tx_hash), reference_id)
  where tx_hash is not null;
