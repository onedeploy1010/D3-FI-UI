# DB Verification Checklist (migrations 031–037)

These migrations create objects that cannot be unit-tested without a live
Postgres/Supabase DB. Run the queries below against the target database
(psql or the Supabase SQL Editor) after applying `031`–`037`. Each check states
the expected result. Every statement is safe to run read-only except the two
negative-path INSERT/UPDATE probes at the end (run those in a throwaway
transaction with `begin; ... rollback;`).

Apply order:

```
supabase db push        # or: psql -f each of 031..037 in order
```

---

## 031 — RLS lockdown (V-19)

Expect `relrowsecurity = t` for all 14 tables:

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'chain_sync_cursors','committee_members','d3_price_settings',
    'daily_state_anchors','multisig_proposals','multisig_signatures',
    'multisig_wallets','partner_ud3_calc_logs','partner_ud3_events',
    'partner_ud3_ledger','partner_ud3_settings','team_nodes',
    'union_lines','usd3_transfers')
order by relname;
-- expect: 14 rows, relrowsecurity = t for every row
```

Confirm anon/authenticated have no table privileges left in public:

```sql
select grantee, count(*)
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
group by grantee;
-- expect: 0 rows (no grants remain)
```

Confirm service_role still has access (edge functions unaffected):

```sql
select count(*)
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'service_role';
-- expect: > 0
```

---

## 032 — Non-negative balance checks (V-23)

Expect all constraints present (12 rows):

```sql
select conrelid::regclass as tbl, conname
from pg_constraint
where conname like '%_nonneg'
  and connamespace = 'public'::regnamespace
order by tbl, conname;
-- expect: partner_accounts x4 (sd3_balance, ud3_balance, pending_usdt_yield, pending_d3_yield),
--         usd3_accounts x4 (balance, available, self_pool_remaining, downline_pool_remaining),
--         d3_accounts x2 (pending_d3, claimed_lifetime_d3)
```

Negative-path probe (must FAIL with a check violation):

```sql
begin;
  update public.partner_accounts set ud3_balance = -1 where true limit 1; -- expect: ERROR check constraint
rollback;
```

---

## 033 — Idempotency constraints (V-03/V-21)

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in ('partner_yield_withdrawals_inflight_uidx','treasury_ledger_dedupe_uidx');
-- expect: 2 rows, both UNIQUE with the WHERE predicates
```

Behavioural probe — second in-flight withdrawal for a wallet must conflict:

```sql
-- (with an existing 'pending' row for wallet 0xW...) inserting a second
-- 'pending' row for 0xW must raise a unique_violation.
```

---

## 034 — Atomic balance RPCs (V-03/V-06)

Functions exist with correct signatures:

```sql
select proname, pg_get_function_identity_arguments(oid) as args, prosecdef
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('debit_pending_d3_yield','credit_pending_d3_yield',
                  'debit_ud3_balance','transfer_ud3')
order by proname;
-- expect: 4 rows, prosecdef = t (security definer), args = (p_wallet text, p_amount numeric)
--         transfer_ud3 args = (p_from text, p_to text, p_amount numeric)
```

Search path is pinned:

```sql
select proname, proconfig
from pg_proc
where pronamespace='public'::regnamespace
  and proname in ('debit_pending_d3_yield','credit_pending_d3_yield','debit_ud3_balance','transfer_ud3');
-- expect: proconfig contains 'search_path=public'
```

Execute grants — service_role only:

```sql
select routine_name, grantee
from information_schema.role_routine_grants
where specific_schema = 'public'
  and routine_name in ('debit_pending_d3_yield','credit_pending_d3_yield','debit_ud3_balance','transfer_ud3');
-- expect: grantee = service_role only; NO anon / authenticated / PUBLIC rows
```

Behavioural probes (throwaway txn):

```sql
begin;
  select public.debit_ud3_balance('0xdoesnotexist', 1);        -- expect: ERROR INSUFFICIENT_BALANCE
rollback;
begin;
  select public.debit_ud3_balance('0xanywallet', 0);           -- expect: ERROR INVALID_AMOUNT
rollback;
begin;
  select public.transfer_ud3('0xsender','0xnorecipient', 1);   -- expect: INSUFFICIENT_BALANCE or RECIPIENT_NOT_FOUND
rollback;
```

---

## 035 — D3 price guardrail columns (V-05)

```sql
select column_name, data_type, numeric_precision, numeric_scale
from information_schema.columns
where table_schema='public' and table_name='d3_price_settings'
  and column_name in ('min_price_usdt','max_price_usdt','max_deviation_pct','previous_price_usdt','expires_at')
order by column_name;
-- expect: 5 rows

select id, min_price_usdt, max_price_usdt, max_deviation_pct
from public.d3_price_settings where id = 1;
-- expect: 0.5 / 50 / 20 (seeded defaults)
```

---

## 036 — audit_logs immutability (V-24)

```sql
select r.rulename, c.relname
from pg_rewrite r join pg_class c on c.oid = r.ev_class
where c.relname = 'audit_logs'
  and r.rulename in ('audit_logs_no_update','audit_logs_no_delete');
-- expect: 2 rows
```

Behavioural probe (both must affect 0 rows):

```sql
begin;
  update public.audit_logs set action = 'tampered' where true; -- expect: 0 rows affected
  delete from public.audit_logs where true;                    -- expect: 0 rows affected
rollback;
```

---

## 037 — referrals no-self (V-07)

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname = 'referrals_no_self';
-- expect: 1 row, check (lower(sponsor_wallet_address) <> lower(wallet_address))
```

Behavioural probe (must FAIL):

```sql
begin;
  update public.referrals
    set sponsor_wallet_address = wallet_address where true; -- expect: ERROR referrals_no_self
rollback;
```

---

## Idempotency

All 031–037 are guarded (`if not exists`, `to_regclass`, `exception when
duplicate_object`, `create or replace`). Re-applying the full set must complete
with no errors and no duplicate objects.
