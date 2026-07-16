# Security Preflight — pre-deploy gate

`scripts/security-preflight.ts` is a runnable gate that verifies the fund-safety
posture of the deployment before you ship. It checks the live database, the
local config/secrets, and the security regression suite, then prints a
PASS/FAIL/WARN table and **exits non-zero if any REQUIRED check fails** so it can
be wired into CI or a pre-deploy hook.

## How to run

```bash
npm run security:preflight
```

Requirements (already present in this repo):

- `.env` at the repo root providing `SUPABASE_URL` and `SUPABASE_ACCESS_TOKEN`
  (the database checks talk to the Supabase **Management API** SQL endpoint;
  `SUPABASE_SECRET_KEY` is not required by this script).
- `tsx` (dev dependency) — the npm script runs `tsx scripts/security-preflight.ts`.
- The security vitest config `vitest.security.config.ts`.

The script parses `.env` itself and **never prints secret values** — it only
reports whether a variable is set, its length, or its shape. It does not load
those values into the process environment.

## Reading the results

Each row shows an outcome icon, a severity class tag, the check name, and a
detail string.

| Icon | Meaning                                            |
| ---- | -------------------------------------------------- |
| ✓    | check passed                                       |
| ✗    | check failed (blocking only if tagged `[REQUIRED]`)|
| ⚠    | warning — non-blocking, review before launch       |

| Tag          | Policy                                                        |
| ------------ | ------------------------------------------------------------ |
| `[REQUIRED]` | a ✗ here is **blocking** — the preflight exits `1`           |
| `[WARN]`     | never blocks; a ✗/⚠ is advisory (e.g. pre-launch faucet)    |

The final lines are a one-line count summary and either:

- `PREFLIGHT: PASS` (exit `0`), optionally noting the number of warnings, or
- `PREFLIGHT: FAIL (n blocking)` (exit `1`), listing each blocking failure.

A check that throws (e.g. the DB is unreachable) is reported as a ✗ with the
error message — the script never crashes.

## What it checks

### A. Database (live, via Management API SQL)

All REQUIRED unless noted. Queries hit
`POST https://api.supabase.com/v1/projects/{ref}/database/query` with
`Authorization: Bearer <SUPABASE_ACCESS_TOKEN>` (`ref` = subdomain of
`SUPABASE_URL`).

- **RLS enabled on 14 target tables** — the tables locked down by migration
  `031` all have `pg_class.relrowsecurity = true` (expect 14/14).
- **anon has 0 table grants** — no `anon` grants remain in schema `public`
  (`information_schema.role_table_grants`).
- **5 balance RPCs are SECURITY DEFINER** — `debit_pending_d3_yield`,
  `credit_pending_d3_yield`, `debit_ud3_balance`, `credit_ud3_balance`,
  `transfer_ud3` all exist and `prosecdef = true`.
- **Idempotency indexes present** — `partner_yield_withdrawals_inflight_uidx`
  and `treasury_ledger_dedupe_uidx`.
- **audit_logs immutability rules** — `audit_logs_no_update` and
  `audit_logs_no_delete` (`pg_rewrite`).
- **Security control tables exist** — `risk_limits`, `system_pause_flags`,
  `security_alerts`, `admin_action_approvals`.
- **Migrations 031..042 recorded** — *best-effort, WARN only.* Skipped if
  `supabase_migrations.schema_migrations` is absent; matches by version prefix.

### B. Config / secrets (from parsed `.env`; values never printed)

- **No `VITE_` secret-shaped var** — REQUIRED. Fails if any client-exposed
  (`VITE_`-prefixed) variable name matches
  `PRIVATE_KEY|SECRET|SERVICE|MNEMONIC|APP_SECRET`.
- **`TREASURY_CRON_SECRET` set, length ≥ 24** — REQUIRED.
- **Faucet/settlement token** — WARN. Passes if `BSC_USDT_CONTRACT` is unset or
  equals the canonical mainnet USDT
  (`0x55d398326f99059fF775485246999027B3197955`). A non-canonical override is a
  test/faucet token and warns; if `ALLOW_MAINNET_FAUCET_TOKEN=true` the warning
  explicitly **reminds you to remove both that flag and the override before any
  real-funds launch**.
- **`DEMO_MODE_ENABLED` not `true`** — WARN. Warns if demo mode is on.

### C. Tests

- **Security regression suite** — REQUIRED. Shells out to
  `npx vitest run --config vitest.security.config.ts` and requires exit `0`.

## Required-vs-warn policy

Only `[REQUIRED]` failures block a deploy. `[WARN]` items are expected to be
non-empty **pre-launch** (a faucet token, an unrecorded migration) and are there
to be reviewed and cleared before a real-funds launch — but they never fail the
gate. Treat every warning as a launch-blocking checklist item even though the
script lets it through.
