/**
 * Backfill the existing off-chain referral tree into the on-chain ReferralRegistry.
 *
 * The on-chain contract requires an upline to be registered (a root, or already bound)
 * before a downline can bind under it. So this script:
 *   1. Loads active partner referrals from Postgres.
 *   2. Finds top-of-tree sponsors (no active sponsor of their own) → setRootBatch.
 *   3. Topologically orders the rest so every upline is bound first → adminRebindBatch.
 *   4. Skips bindings already correct on-chain (idempotent; safe to re-run).
 *
 * Run BEFORE transferring admin roles to the Turnkey multisig (uses a hot admin EOA).
 *
 * Usage:  npm run referral:backfill              # dry-run (prints plan)
 *         npm run referral:backfill -- --execute # submit txs
 *
 * Env (.env):
 *   SUPABASE_URL, SUPABASE_SECRET_KEY
 *   REFERRAL_REGISTRY_ADDRESS
 *   REFERRAL_ADMIN_PRIVATE_KEY   (holds DEFAULT_ADMIN_ROLE + REBIND_ADMIN_ROLE)
 *   BSC_RPC_URL                  (optional; defaults to public BSC)
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', '.env') });

const execute = process.argv.includes('--execute');
const BATCH = 100;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const REGISTRY = process.env.REFERRAL_REGISTRY_ADDRESS;
const ADMIN_PK = process.env.REFERRAL_ADMIN_PRIVATE_KEY;
const RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) die('Missing SUPABASE_URL / SUPABASE_SECRET_KEY');
if (!REGISTRY) die('Missing REFERRAL_REGISTRY_ADDRESS');
if (execute && !ADMIN_PK) die('Missing REFERRAL_ADMIN_PRIVATE_KEY (needed for --execute)');

const registryAbi = parseAbi([
  'function uplineOf(address) view returns (address)',
  'function isRoot(address) view returns (bool)',
  'function isBound(address) view returns (bool)',
  'function setRootBatch(address[] accounts, bool root)',
  'function adminRebindBatch(address[] users, address[] uplines, string reason)',
]);

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const publicClient = createPublicClient({ chain: bsc, transport: http(RPC) });
const registry = getAddress(REGISTRY) as Address;

type Edge = { user: string; sponsor: string };

async function loadEdges(): Promise<Edge[]> {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await sb
      .from('referrals')
      .select('wallet_address, sponsor_wallet_address')
      .eq('referral_type', 'partner')
      .eq('status', 'active')
      .not('sponsor_wallet_address', 'is', null)
      .range(from, from + page - 1);
    if (error) die(`Supabase read failed: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) {
      const user = getAddress(r.wallet_address as string);
      const sponsor = getAddress(r.sponsor_wallet_address as string);
      if (user === sponsor) continue;
      if (seen.has(user)) continue; // single active upline per user
      seen.add(user);
      edges.push({ user, sponsor });
    }
    if (data.length < page) break;
    from += page;
  }
  return edges;
}

/** Kahn topological order (uplines before downlines); returns { roots, ordered }. */
function topoSort(edges: Edge[]): { roots: string[]; ordered: Edge[] } {
  const uplineOf = new Map<string, string>();
  const nodes = new Set<string>();
  for (const e of edges) {
    uplineOf.set(e.user, e.sponsor);
    nodes.add(e.user);
    nodes.add(e.sponsor);
  }
  // roots = nodes that are never a `user` (no upline in the set)
  const roots = [...nodes].filter((n) => !uplineOf.has(n));

  const ordered: Edge[] = [];
  const placed = new Set<string>(roots);
  let progress = true;
  while (progress) {
    progress = false;
    for (const e of edges) {
      if (placed.has(e.user)) continue;
      if (placed.has(e.sponsor)) {
        ordered.push(e);
        placed.add(e.user);
        progress = true;
      }
    }
  }
  const unplaced = edges.filter((e) => !placed.has(e.user));
  if (unplaced.length) {
    console.warn(`⚠️  ${unplaced.length} edges could not be ordered (cycle?) — skipped:`);
    for (const e of unplaced.slice(0, 10)) console.warn(`   ${e.user} -> ${e.sponsor}`);
  }
  return { roots, ordered };
}

async function main() {
  console.log(`Referral backfill ${execute ? '(EXECUTE)' : '(dry-run)'} → ${registry}`);
  const edges = await loadEdges();
  console.log(`Loaded ${edges.length} active partner bindings.`);
  const { roots, ordered } = topoSort(edges);
  console.log(`Roots (top line-leaders): ${roots.length}`);
  console.log(`Orderable bindings:       ${ordered.length}`);

  // Filter out bindings already correct on-chain (idempotent).
  const pending: Edge[] = [];
  for (const e of ordered) {
    const current = (await publicClient.readContract({
      address: registry,
      abi: registryAbi,
      functionName: 'uplineOf',
      args: [e.user as Address],
    })) as string;
    if (current.toLowerCase() !== e.sponsor.toLowerCase()) pending.push(e);
  }
  const rootsToSet: string[] = [];
  for (const r of roots) {
    const isR = (await publicClient.readContract({
      address: registry,
      abi: registryAbi,
      functionName: 'isRoot',
      args: [r as Address],
    })) as boolean;
    if (!isR) rootsToSet.push(r);
  }

  console.log(`Roots to set:    ${rootsToSet.length}`);
  console.log(`Bindings to set: ${pending.length}`);
  if (!execute) {
    console.log('\nDry-run only. Re-run with --execute to submit.');
    return;
  }

  const account = privateKeyToAccount(ADMIN_PK as `0x${string}`);
  const wallet = createWalletClient({ account, chain: bsc, transport: http(RPC) });

  // 1) roots
  for (let i = 0; i < rootsToSet.length; i += BATCH) {
    const chunk = rootsToSet.slice(i, i + BATCH).map((a) => a as Address);
    const hash = await wallet.writeContract({
      address: registry,
      abi: registryAbi,
      functionName: 'setRootBatch',
      args: [chunk, true],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  setRootBatch ${i + chunk.length}/${rootsToSet.length} → ${hash}`);
  }

  // 2) bindings, in topological order (batches preserve order)
  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    const users = chunk.map((e) => e.user as Address);
    const uplines = chunk.map((e) => e.sponsor as Address);
    const hash = await wallet.writeContract({
      address: registry,
      abi: registryAbi,
      functionName: 'adminRebindBatch',
      args: [users, uplines, 'backfill'],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  adminRebindBatch ${i + chunk.length}/${pending.length} → ${hash}`);
  }

  console.log('\nBackfill complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
