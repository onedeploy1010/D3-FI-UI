#!/usr/bin/env node
// One-time launch cleanup: back up then wipe TEST-PHASE (TestUSDT) fund/ledger
// data, keeping identity data (profiles, referrals), audit logs and infra
// (wallet_accounts, system params, price settings).
//
//   node scripts/wipe-test-phase-ledger.mjs            # dry-run: counts only
//   node scripts/wipe-test-phase-ledger.mjs --execute  # backup + wipe + reset
//
// Backup JSONs land in backups/test-phase-wipe-<date>/ (git-ignored).
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const env = {};
for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const EXECUTE = process.argv.includes('--execute');

// Tables fully wiped (test-phase money flow). Order: children before parents
// not required (we wipe everything), but intents last so FK cascades don't
// surprise the counts.
const WIPE_TABLES = [
  'partner_ud3_calc_logs',
  'partner_ud3_ledger',
  'partner_ud3_events',
  'partner_sd3_allocations',
  'partner_sd3_settlements',
  'partner_ud3_transfers',
  'partner_yield_settlements',
  'partner_yield_withdrawals',
  'partner_settlement_runs',
  'partner_stake_positions',
  'sweep_jobs',
  'deposit_records',
  'stake_intents',
  'partner_subsidy_tickets',
  'treasury_transfer_requests',
  'treasury_ledger',
  'daily_state_anchors',
  'd3_accounts',
];

async function tableCount(table) {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) return { missing: true, msg: error.message };
  return { count: count ?? 0 };
}

async function backupTable(table, dir) {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select('*').range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 1));
  return rows.length;
}

async function wipeTable(table) {
  // PostgREST delete needs a filter; sample one row and match on any real column.
  const { data: sample, error: sErr } = await sb.from(table).select('*').limit(1);
  if (sErr) throw new Error(`${table}: ${sErr.message}`);
  if (!sample?.length) return true; // already empty
  const col = Object.keys(sample[0]).find((k) => sample[0][k] !== null) ?? Object.keys(sample[0])[0];
  const { error } = await sb.from(table).delete().not(col, 'is', null);
  if (error) throw new Error(`${table}: ${error.message}`);
  return true;
}

// partner_accounts: keep the rows (identity), zero every test-phase number and
// drop bought-with-test-USDT partner status.
async function resetPartnerAccounts(dir) {
  const n = await backupTable('partner_accounts', dir);
  const { data: sample } = await sb.from('partner_accounts').select('*').limit(1);
  if (!sample?.length) return { rows: 0, cols: [] };
  const keys = Object.keys(sample[0]);
  const zeroCols = [
    'sd3_balance', 'pending_usdt_yield', 'lifetime_sd3_earned', 'lifetime_usdt_yield',
    'ud3_balance', 'lifetime_ud3_earned', 'pending_ud3',
    'pending_d3_yield', 'released_d3', 'staked_d3', 'lifetime_d3_yield',
    'team_perf_usdt', 'small_area_perf_usdt',
  ].filter((c) => keys.includes(c));
  const patch = Object.fromEntries(zeroCols.map((c) => [c, 0]));
  patch.is_partner = false;
  if (keys.includes('joined_at')) patch.joined_at = null;
  for (const c of ['ud3_tier_id', 'ud3_v_level']) if (keys.includes(c)) patch[c] = null;
  const { error } = await sb.from('partner_accounts').update(patch).not('wallet_address', 'is', null);
  if (error) throw new Error(`partner_accounts reset: ${error.message}`);
  return { rows: n, cols: Object.keys(patch) };
}

// NOTE: wallet_accounts deposit-address assignments are deliberately KEPT —
// real users hold those addresses in their dapp; releasing them for reuse
// could route one user's real USDT to another's credited intent.

const stamp = new Date().toISOString().slice(0, 10);
const dir = join(ROOT, 'backups', `test-phase-wipe-${stamp}`);

console.log(EXECUTE ? '=== EXECUTE ===' : '=== DRY RUN (counts only) ===');
for (const t of [...WIPE_TABLES, 'partner_accounts']) {
  const r = await tableCount(t);
  console.log(`${t}: ${r.missing ? `MISSING (${r.msg})` : r.count + ' rows'}`);
}

if (EXECUTE) {
  mkdirSync(dir, { recursive: true });
  console.log(`\nbackup dir: ${dir}`);
  for (const t of WIPE_TABLES) {
    const c = await tableCount(t);
    if (c.missing) { console.log(`skip ${t} (missing)`); continue; }
    const n = await backupTable(t, dir);
    await wipeTable(t);
    const after = await tableCount(t);
    console.log(`wiped ${t}: backed up ${n}, remaining ${after.count}`);
  }
  const pa = await resetPartnerAccounts(dir);
  console.log(`reset partner_accounts: ${pa.rows} rows backed up, patched cols: ${pa.cols.join(',')}`);
  console.log('\nDONE');
}
