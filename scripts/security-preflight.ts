/**
 * security-preflight.ts — pre-deploy security gate.
 *
 * Run with:  npm run security:preflight
 *
 * Loads env from .env (never prints secret values), then runs a series of
 * CHECKS across three groups:
 *   A. Database   — verified live via the Supabase Management API SQL endpoint.
 *   B. Config     — parsed from .env (state reported, values never printed).
 *   C. Tests      — the fund-safety security regression suite (vitest).
 *
 * Prints a PASS/FAIL/WARN table and exits non-zero if any REQUIRED check fails.
 * A WARN never blocks (e.g. pre-launch faucet token). A check that throws is
 * reported as ✗ with the error message — it must never crash the process.
 *
 * NOTE: this script does not read or depend on dotenv; it parses .env itself so
 * that it can enumerate variable names (for the VITE_ secret scan) without
 * loading them into the environment or echoing their values.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.resolve(ROOT, '.env');

// ── .env parsing (names + values kept in-memory; values are NEVER printed) ────
function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw = '';
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    // strip an inline comment only when the value is not quoted
    if (!(v.startsWith('"') || v.startsWith("'"))) {
      const hash = v.indexOf(' #');
      if (hash >= 0) v = v.slice(0, hash).trim();
    }
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const ENV = parseEnvFile(ENV_PATH);

// ── result model ──────────────────────────────────────────────────────────────
type Status = 'pass' | 'fail' | 'warn';
interface CheckResult {
  group: string;
  name: string;
  required: boolean; // required=true → a fail is blocking
  status: Status;
  detail: string;
}
const results: CheckResult[] = [];

async function check(
  group: string,
  name: string,
  required: boolean,
  fn: () => Promise<{ status: Status; detail: string }> | { status: Status; detail: string },
) {
  try {
    const r = await fn();
    results.push({ group, name, required, status: r.status, detail: r.detail });
  } catch (e) {
    results.push({
      group,
      name,
      required,
      status: 'fail',
      detail: `errored: ${(e as Error).message}`,
    });
  }
}

// ── Supabase Management API SQL runner ────────────────────────────────────────
const CANONICAL_USDT = '0x55d398326f99059fF775485246999027B3197955';

const SUPABASE_URL = ENV.SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ACCESS_TOKEN = ENV.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN || '';

function projectRef(url: string): string {
  // ref = subdomain of SUPABASE_URL, e.g. https://<ref>.supabase.co
  const host = new URL(url).hostname;
  return host.split('.')[0];
}

async function runSql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not set in .env');
  if (!SUPABASE_ACCESS_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN is not set in .env');
  const ref = projectRef(SUPABASE_URL);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).message || text;
    } catch {
      /* keep raw */
    }
    throw new Error(`Management API ${res.status}: ${String(msg).slice(0, 200)}`);
  }
  return JSON.parse(text) as T[];
}

// The 14 tables locked down by migration 031 (RLS lockdown, V-19).
const RLS_TABLES = [
  'chain_sync_cursors',
  'committee_members',
  'd3_price_settings',
  'daily_state_anchors',
  'multisig_proposals',
  'multisig_signatures',
  'multisig_wallets',
  'partner_ud3_calc_logs',
  'partner_ud3_events',
  'partner_ud3_ledger',
  'partner_ud3_settings',
  'team_nodes',
  'union_lines',
  'usd3_transfers',
];

// The 5 atomic balance RPCs (migrations 034 + 041); all must be SECURITY DEFINER.
const BALANCE_RPCS = [
  'debit_pending_d3_yield',
  'credit_pending_d3_yield',
  'debit_ud3_balance',
  'credit_ud3_balance',
  'transfer_ud3',
];

function sqlList(items: string[]): string {
  return items.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
}

// ── A. Database checks ────────────────────────────────────────────────────────
async function groupA() {
  await check('A. Database', `RLS enabled on ${RLS_TABLES.length} target tables`, true, async () => {
    const rows = await runSql<{ n: number }>(
      `select count(*)::int as n from pg_class
       where relnamespace='public'::regnamespace
         and relrowsecurity = true
         and relname in (${sqlList(RLS_TABLES)});`,
    );
    const n = Number(rows[0]?.n ?? 0);
    return n === RLS_TABLES.length
      ? { status: 'pass', detail: `${n}/${RLS_TABLES.length} tables have RLS enabled` }
      : { status: 'fail', detail: `${n}/${RLS_TABLES.length} tables have RLS enabled (expected ${RLS_TABLES.length})` };
  });

  await check('A. Database', 'anon role has 0 table grants (schema public)', true, async () => {
    const rows = await runSql<{ n: number }>(
      `select count(*)::int as n from information_schema.role_table_grants
       where table_schema='public' and grantee='anon';`,
    );
    const n = Number(rows[0]?.n ?? -1);
    return n === 0
      ? { status: 'pass', detail: 'anon has 0 table grants' }
      : { status: 'fail', detail: `anon has ${n} table grant(s) (expected 0)` };
  });

  await check('A. Database', '5 balance RPCs exist and are SECURITY DEFINER', true, async () => {
    const rows = await runSql<{ proname: string; prosecdef: boolean }>(
      `select proname, prosecdef from pg_proc
       where pronamespace='public'::regnamespace
         and proname in (${sqlList(BALANCE_RPCS)});`,
    );
    const found = new Set(rows.map((r) => r.proname));
    const missing = BALANCE_RPCS.filter((p) => !found.has(p));
    const notSecdef = rows.filter((r) => r.prosecdef !== true).map((r) => r.proname);
    if (missing.length === 0 && notSecdef.length === 0) {
      return { status: 'pass', detail: `all ${BALANCE_RPCS.length} present and prosecdef=true` };
    }
    const parts: string[] = [];
    if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
    if (notSecdef.length) parts.push(`not SECURITY DEFINER: ${notSecdef.join(', ')}`);
    return { status: 'fail', detail: parts.join('; ') };
  });

  await check('A. Database', 'idempotency indexes present', true, async () => {
    const want = ['partner_yield_withdrawals_inflight_uidx', 'treasury_ledger_dedupe_uidx'];
    const rows = await runSql<{ indexname: string }>(
      `select indexname from pg_indexes
       where schemaname='public' and indexname in (${sqlList(want)});`,
    );
    const found = new Set(rows.map((r) => r.indexname));
    const missing = want.filter((w) => !found.has(w));
    return missing.length === 0
      ? { status: 'pass', detail: `both idempotency indexes present` }
      : { status: 'fail', detail: `missing: ${missing.join(', ')}` };
  });

  await check('A. Database', 'audit_logs immutability rules present', true, async () => {
    const want = ['audit_logs_no_update', 'audit_logs_no_delete'];
    const rows = await runSql<{ rulename: string }>(
      `select r.rulename from pg_rewrite r
       join pg_class c on c.oid = r.ev_class
       where c.relname='audit_logs' and r.rulename in (${sqlList(want)});`,
    );
    const found = new Set(rows.map((r) => r.rulename));
    const missing = want.filter((w) => !found.has(w));
    return missing.length === 0
      ? { status: 'pass', detail: 'no_update + no_delete rules present' }
      : { status: 'fail', detail: `missing rule(s): ${missing.join(', ')}` };
  });

  await check('A. Database', 'security control tables exist', true, async () => {
    const want = ['risk_limits', 'system_pause_flags', 'security_alerts', 'admin_action_approvals'];
    const rows = await runSql<{ tablename: string }>(
      `select tablename from pg_tables
       where schemaname='public' and tablename in (${sqlList(want)});`,
    );
    const found = new Set(rows.map((r) => r.tablename));
    const missing = want.filter((w) => !found.has(w));
    return missing.length === 0
      ? { status: 'pass', detail: `all present: ${want.join(', ')}` }
      : { status: 'fail', detail: `missing table(s): ${missing.join(', ')}` };
  });

  // Best-effort: migrations 031..042 present, only if the tracking table exists.
  await check('A. Database', 'migrations 031..042 recorded (best-effort)', false, async () => {
    const probe = await runSql<{ t: string | null }>(
      `select to_regclass('supabase_migrations.schema_migrations')::text as t;`,
    );
    if (!probe[0]?.t) {
      return { status: 'warn', detail: 'supabase_migrations.schema_migrations absent — skipped' };
    }
    const rows = await runSql<{ version: string }>(
      `select version from supabase_migrations.schema_migrations;`,
    );
    const versions = new Set(rows.map((r) => String(r.version)));
    const want: string[] = [];
    for (let i = 31; i <= 42; i++) want.push(String(i).padStart(3, '0'));
    // schema_migrations.version may be the bare numeric prefix or a longer string;
    // match by prefix so both '031' and '031_enable_rls_lockdown' count.
    const missing = want.filter(
      (w) => !Array.from(versions).some((v) => v === w || v.startsWith(w)),
    );
    return missing.length === 0
      ? { status: 'pass', detail: 'migrations 031..042 all recorded' }
      : { status: 'warn', detail: `not recorded: ${missing.join(', ')}` };
  });
}

// ── B. Config / secrets checks (from parsed .env; values never printed) ────────
function groupB() {
  const SECRET_NAME_RE = /(PRIVATE_KEY|SECRET|SERVICE|MNEMONIC|APP_SECRET)/i;

  results.push(
    ((): CheckResult => {
      const offenders = Object.keys(ENV).filter(
        (k) => k.startsWith('VITE_') && SECRET_NAME_RE.test(k),
      );
      return {
        group: 'B. Config',
        name: 'no VITE_-prefixed variable looks like a secret',
        required: true,
        status: offenders.length === 0 ? 'pass' : 'fail',
        detail:
          offenders.length === 0
            ? 'no client-exposed secret-shaped vars'
            : `client-exposed secret-shaped var(s): ${offenders.join(', ')}`,
      };
    })(),
  );

  results.push(
    ((): CheckResult => {
      const v = ENV.TREASURY_CRON_SECRET ?? '';
      const set = v.length > 0;
      const ok = set && v.length >= 24;
      return {
        group: 'B. Config',
        name: 'TREASURY_CRON_SECRET set and length >= 24',
        required: true,
        status: ok ? 'pass' : 'fail',
        detail: !set
          ? 'not set'
          : ok
            ? `set (length ${v.length})`
            : `set but too short (length ${v.length}, need >= 24)`,
      };
    })(),
  );

  results.push(
    ((): CheckResult => {
      const token = (ENV.BSC_USDT_CONTRACT ?? '').trim();
      const allowMainnet = (ENV.ALLOW_MAINNET_FAUCET_TOKEN ?? '').toLowerCase() === 'true';
      const isCanonical = token.toLowerCase() === CANONICAL_USDT.toLowerCase();
      if (!token) {
        return {
          group: 'B. Config',
          name: 'faucet/settlement token is not a mainnet override',
          required: false,
          status: 'pass',
          detail: 'BSC_USDT_CONTRACT unset — viem/canonical default used',
        };
      }
      if (isCanonical) {
        return {
          group: 'B. Config',
          name: 'faucet/settlement token is not a mainnet override',
          required: false,
          status: 'pass',
          detail: 'BSC_USDT_CONTRACT == canonical mainnet USDT',
        };
      }
      // A non-canonical override = a faucet/test token.
      if (allowMainnet) {
        return {
          group: 'B. Config',
          name: 'faucet/settlement token is not a mainnet override',
          required: false,
          status: 'warn',
          detail:
            'test/faucet token override active with ALLOW_MAINNET_FAUCET_TOKEN=true — REMOVE this flag AND the override before any real-funds launch',
        };
      }
      return {
        group: 'B. Config',
        name: 'faucet/settlement token is not a mainnet override',
        required: false,
        status: 'warn',
        detail:
          'BSC_USDT_CONTRACT is a non-canonical (test/faucet) token — expected pre-launch; must be canonical mainnet USDT for real-funds launch',
      };
    })(),
  );

  results.push(
    ((): CheckResult => {
      const demo = (ENV.DEMO_MODE_ENABLED ?? '').toLowerCase();
      const on = demo === 'true';
      return {
        group: 'B. Config',
        name: 'DEMO_MODE_ENABLED not true for production',
        required: false,
        status: on ? 'warn' : 'pass',
        detail: on
          ? 'DEMO_MODE_ENABLED=true — must be false in production'
          : demo
            ? `DEMO_MODE_ENABLED=${demo}`
            : 'DEMO_MODE_ENABLED unset',
      };
    })(),
  );
}

// ── C. Tests ──────────────────────────────────────────────────────────────────
async function groupC() {
  await check('C. Tests', 'security regression suite (vitest) passes', true, () => {
    const run = spawnSync(
      'npx',
      ['vitest', 'run', '--config', 'vitest.security.config.ts'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (run.error) {
      return { status: 'fail', detail: `could not launch vitest: ${run.error.message}` };
    }
    const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    // Pull a compact summary line if present.
    const summary =
      out.match(/Test Files.*$/m)?.[0] ??
      out.match(/Tests\s+.*$/m)?.[0] ??
      '';
    return run.status === 0
      ? { status: 'pass', detail: summary.trim() || 'vitest exited 0' }
      : { status: 'fail', detail: `vitest exited ${run.status}. ${summary.trim()}`.trim() };
  });
}

// ── output ────────────────────────────────────────────────────────────────────
const ICON: Record<Status, string> = { pass: '✓', fail: '✗', warn: '⚠' };

function printTable() {
  const nameW = Math.max(...results.map((r) => r.name.length), 24);
  let currentGroup = '';
  console.log('');
  console.log('  D3-FI SECURITY PREFLIGHT');
  console.log('  ' + '─'.repeat(nameW + 40));
  for (const r of results) {
    if (r.group !== currentGroup) {
      currentGroup = r.group;
      console.log('');
      console.log(`  ${currentGroup}`);
    }
    const tag = r.required ? 'REQUIRED' : 'WARN    ';
    const namePad = r.name.padEnd(nameW);
    console.log(`   ${ICON[r.status]}  [${tag}] ${namePad}  ${r.detail}`);
  }
  console.log('');
}

async function main() {
  // Connectivity preamble — surfaces a clear message if the DB is unreachable.
  if (!SUPABASE_URL || !SUPABASE_ACCESS_TOKEN) {
    console.error(
      'FATAL: SUPABASE_URL and/or SUPABASE_ACCESS_TOKEN missing from .env — cannot run DB checks.',
    );
  }

  await groupA();
  groupB();
  await groupC();

  printTable();

  const blocking = results.filter((r) => r.required && r.status === 'fail');
  const warns = results.filter((r) => r.status === 'warn');

  console.log(`  Summary: ${results.length} checks — ` +
    `${results.filter((r) => r.status === 'pass').length} pass, ` +
    `${results.filter((r) => r.status === 'fail').length} fail, ` +
    `${warns.length} warn`);

  if (blocking.length === 0) {
    console.log('  PREFLIGHT: PASS' + (warns.length ? ` (${warns.length} warning(s) — review before launch)` : ''));
    console.log('');
    process.exit(0);
  } else {
    console.log(`  PREFLIGHT: FAIL (${blocking.length} blocking)`);
    for (const b of blocking) console.log(`     ✗ ${b.name} — ${b.detail}`);
    console.log('');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('PREFLIGHT crashed unexpectedly:', (e as Error).message);
  process.exit(1);
});
