/**
 * One-time flush: settle EVERY user's outstanding UD3 right now.
 *
 * Product change (immediate settlement): UD3 no longer waits for the 0:00 SGT cron.
 * This script settles the historical backlog so that, for all users today, both the
 * "未结算" (pending_ud3) and the already-"已结算" buckets end up as 已结算:
 *   1. For each account with pending_ud3 > 0 → settle_pending_ud3 (pending → ud3_balance
 *      + lifetime_ud3_earned, atomic, row-locked).
 *   2. Flip every remaining unsettled reward-ledger row (settled=false, role != 'reserve')
 *      to settled=true with today's SGT settlement_date, so reward history reads 已结算.
 *
 * Safe & idempotent: settle_pending_ud3 is a no-op when pending is 0; re-running only
 * touches whatever is still pending/unsettled.
 *
 * Usage:  tsx scripts/ud3-settle-all-now.ts              # dry-run (prints what it would do)
 *         tsx scripts/ud3-settle-all-now.ts -- --execute # apply
 *
 * Env (.env):  SUPABASE_URL, SUPABASE_SECRET_KEY
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', '.env') });

const execute = process.argv.includes('--execute');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) die('Missing SUPABASE_URL / SUPABASE_SECRET_KEY in .env');

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

/** Today's date in Asia/Singapore as yyyy-mm-dd (matches the settlement engine). */
function todaySgtDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

type Acct = { wallet_address: string; pending_ud3: number };

async function loadPendingAccounts(): Promise<Acct[]> {
  const rows: Acct[] = [];
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from('partner_accounts')
      .select('wallet_address, pending_ud3')
      .gt('pending_ud3', 0)
      .order('wallet_address', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) die(`load partner_accounts failed: ${error.message}`);
    const batch = (data ?? []) as Acct[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function countUnsettledLedger(): Promise<number> {
  const { count, error } = await sb
    .from('partner_ud3_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('settled', false)
    .neq('role', 'reserve');
  if (error) die(`count partner_ud3_ledger failed: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const accounts = await loadPendingAccounts();
  const totalPending = accounts.reduce((s, a) => s + Number(a.pending_ud3 || 0), 0);
  const unsettledRows = await countUnsettledLedger();
  const settlementDate = todaySgtDateString();

  console.log(`\n=== UD3 settle-all ${execute ? '(EXECUTE)' : '(dry-run)'} ===`);
  console.log(`Accounts with pending UD3 : ${accounts.length}`);
  console.log(`Total pending UD3         : ${totalPending.toLocaleString()}`);
  console.log(`Unsettled ledger rows     : ${unsettledRows}`);
  console.log(`Settlement date (SGT)     : ${settlementDate}`);

  if (!execute) {
    console.log('\nDry-run only. Re-run with `-- --execute` to apply.');
    if (accounts.length) {
      console.log('\nFirst few accounts:');
      for (const a of accounts.slice(0, 10)) {
        console.log(`  ${a.wallet_address}  +${Number(a.pending_ud3).toLocaleString()} UD3`);
      }
    }
    return;
  }

  // 1) Settle each account's pending → ud3_balance (atomic RPC).
  let moved = 0;
  let settledAccts = 0;
  let failed = 0;
  for (const a of accounts) {
    const { data, error } = await sb.rpc('settle_pending_ud3', { p_wallet: a.wallet_address });
    if (error) {
      failed++;
      console.error(`  settle FAIL ${a.wallet_address}: ${error.message}`);
      continue;
    }
    moved += Number(data || 0);
    settledAccts++;
  }

  // 2) Flip all remaining unsettled reward-ledger rows to settled (reward history → 已结算).
  const nowIso = new Date().toISOString();
  const { error: flipErr, count: flipped } = await sb
    .from('partner_ud3_ledger')
    .update(
      { settled: true, settled_at: nowIso, settlement_date: settlementDate },
      { count: 'exact' },
    )
    .eq('settled', false)
    .neq('role', 'reserve');
  if (flipErr) die(`ledger flip failed: ${flipErr.message}`);

  console.log('\n=== Done ===');
  console.log(`Accounts settled : ${settledAccts}/${accounts.length}  (failed: ${failed})`);
  console.log(`UD3 moved        : ${moved.toLocaleString()}`);
  console.log(`Ledger rows flipped to settled: ${flipped ?? 0}`);
}

main().catch((e) => die(String(e?.stack || e)));
