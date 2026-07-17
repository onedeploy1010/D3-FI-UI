import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  getAddress,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hash,
} from 'npm:viem@2';
import { getBscPublicClient } from './turnkey.ts';
import { walletEquals } from './wallet.ts';

type Sb = SupabaseClient;

/**
 * Read/verify side of the on-chain ReferralRegistry (contracts/src/ReferralRegistry.sol).
 * Binding itself happens on-chain from the user's own wallet (they pay gas); the backend
 * only VERIFIES a reported binding and SYNCS the graph into Postgres as an index cache.
 */

const registryAbi = parseAbi([
  'function uplineOf(address user) view returns (address)',
  'function isBound(address user) view returns (bool)',
  'function boundAt(address user) view returns (uint64)',
]);

export const boundEvent = parseAbiItem(
  'event Bound(address indexed user, address indexed upline, uint64 at)',
);
export const reboundEvent = parseAbiItem(
  'event Rebound(address indexed user, address indexed oldUpline, address indexed newUpline, uint64 at, string reason)',
);

const ZERO = '0x0000000000000000000000000000000000000000';

export function referralRegistryAddress(): string | null {
  const raw = Deno.env.get('REFERRAL_REGISTRY_ADDRESS')?.trim();
  if (!raw) return null;
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}

export function isReferralRegistryConfigured(): boolean {
  return referralRegistryAddress() !== null;
}

/** On-chain upline for a user (null if none / not bound). */
export async function readUplineOnchain(userAddress: string): Promise<string | null> {
  const registry = referralRegistryAddress();
  if (!registry) return null;
  const client = getBscPublicClient();
  const upline = (await client.readContract({
    address: registry as Address,
    abi: registryAbi,
    functionName: 'uplineOf',
    args: [userAddress as Address],
  })) as string;
  return upline && upline.toLowerCase() !== ZERO ? getAddress(upline) : null;
}

/**
 * Confirm on-chain that `user` is bound to `expectedUpline`. Optionally checks that
 * `txHash` (the bind tx the client reported) succeeded. Returns the resolved upline.
 */
export async function verifyOnchainBinding(opts: {
  user: string;
  expectedUpline: string;
  txHash?: string;
}): Promise<{ ok: boolean; upline: string | null }> {
  if (opts.txHash) {
    const client = getBscPublicClient();
    try {
      const receipt = await client.getTransactionReceipt({ hash: opts.txHash as Hash });
      if (!receipt || receipt.status !== 'success') return { ok: false, upline: null };
    } catch {
      return { ok: false, upline: null };
    }
  }
  const upline = await readUplineOnchain(opts.user);
  const ok = Boolean(upline && upline.toLowerCase() === opts.expectedUpline.toLowerCase());
  return { ok, upline };
}

export type ChainBindingEvent = {
  kind: 'bound' | 'rebound';
  user: string;
  upline: string;
  blockNumber: bigint;
  txHash: string;
};

/** Scan Bound + Rebound logs in [fromBlock, toBlock] and normalize to {user, upline}. */
export async function scanReferralEvents(
  fromBlock: bigint,
  toBlock: bigint,
): Promise<ChainBindingEvent[]> {
  const registry = referralRegistryAddress();
  if (!registry) return [];
  const client = getBscPublicClient();

  const [bound, rebound] = await Promise.all([
    client.getLogs({ address: registry as Address, event: boundEvent, fromBlock, toBlock }),
    client.getLogs({ address: registry as Address, event: reboundEvent, fromBlock, toBlock }),
  ]);

  const out: ChainBindingEvent[] = [];
  for (const log of bound) {
    out.push({
      kind: 'bound',
      user: getAddress(log.args.user as string),
      upline: getAddress(log.args.upline as string),
      blockNumber: log.blockNumber ?? 0n,
      txHash: log.transactionHash ?? '',
    });
  }
  for (const log of rebound) {
    out.push({
      kind: 'rebound',
      user: getAddress(log.args.user as string),
      upline: getAddress(log.args.newUpline as string),
      blockNumber: log.blockNumber ?? 0n,
      txHash: log.transactionHash ?? '',
    });
  }
  out.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0));
  return out;
}

export async function latestBlockNumber(): Promise<bigint> {
  return getBscPublicClient().getBlockNumber();
}

// ─── DB sync (Postgres index cache of the on-chain graph) ────────────────────

const SYNC_CURSOR_KEY = 'referral_registry';
const MAX_SCAN_RANGE = 4500n; // stay under BSC RPC getLogs range limits

/** Ensure a minimal profile row exists (referrals FK target). Returns canonical stored wallet. */
async function ensureMinimalProfile(sb: Sb, addr: string): Promise<string> {
  const { data } = await sb
    .from('profiles')
    .select('wallet_address')
    .ilike('wallet_address', addr.toLowerCase())
    .maybeSingle();
  if (data?.wallet_address) return data.wallet_address as string;

  const checksummed = getAddress(addr);
  const short = `${checksummed.slice(0, 6)}…${checksummed.slice(-4)}`;
  await sb
    .from('profiles')
    .upsert({ wallet_address: checksummed, short_address: short, lang: 'zh' }, {
      onConflict: 'wallet_address',
      ignoreDuplicates: true,
    });
  return checksummed;
}

/** Upsert a single on-chain binding into `referrals` (idempotent; enforces single active). */
export async function upsertReferralFromChain(
  sb: Sb,
  userAddr: string,
  uplineAddr: string,
  txHash?: string,
): Promise<void> {
  // R-11: defense-in-depth self-referral guard. The on-chain ReferralRegistry already
  // rejects self-edges, but a self-binding must never be indexed into `referrals` — skip
  // before touching any row (case-insensitive; matches the contract's address equality).
  if (walletEquals(userAddr, uplineAddr)) return;

  const user = await ensureMinimalProfile(sb, userAddr);
  const sponsor = await ensureMinimalProfile(sb, uplineAddr);

  // On-chain is authoritative: deactivate any other active binding for this user.
  await sb
    .from('referrals')
    .update({ status: 'inactive' })
    .ilike('wallet_address', user.toLowerCase())
    .eq('status', 'active')
    .not('sponsor_wallet_address', 'ilike', sponsor.toLowerCase());

  await sb.from('referrals').upsert(
    {
      wallet_address: user,
      sponsor_wallet_address: sponsor,
      referral_type: 'partner',
      status: 'active',
      ...(txHash ? { join_tx_hash: txHash } : {}),
    },
    { onConflict: 'wallet_address,sponsor_wallet_address' },
  );
}

async function readCursor(sb: Sb): Promise<bigint | null> {
  const { data } = await sb
    .from('chain_sync_cursors')
    .select('last_block')
    .eq('key', SYNC_CURSOR_KEY)
    .maybeSingle();
  const v = data?.last_block;
  return v === null || v === undefined ? null : BigInt(v as number | string);
}

async function writeCursor(sb: Sb, block: bigint): Promise<void> {
  await sb.from('chain_sync_cursors').upsert(
    { key: SYNC_CURSOR_KEY, last_block: Number(block), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
}

/**
 * Backstop sync: scan Bound/Rebound since the stored cursor and upsert into Postgres.
 * Catches bindings made outside the app and reconciles the report-tx path.
 */
export async function syncReferralBindingsFromChain(
  sb: Sb,
): Promise<{ configured: boolean; synced: number; fromBlock: string; toBlock: string }> {
  if (!isReferralRegistryConfigured()) {
    return { configured: false, synced: 0, fromBlock: '0', toBlock: '0' };
  }

  const latest = await latestBlockNumber();
  let cursor = await readCursor(sb);
  if (cursor === null) {
    const deployBlock = Deno.env.get('REFERRAL_REGISTRY_DEPLOY_BLOCK');
    cursor = deployBlock ? BigInt(deployBlock) - 1n : latest - MAX_SCAN_RANGE;
    if (cursor < 0n) cursor = 0n;
  }

  const fromBlock = cursor + 1n;
  if (fromBlock > latest) {
    return { configured: true, synced: 0, fromBlock: fromBlock.toString(), toBlock: latest.toString() };
  }
  const toBlock = fromBlock + MAX_SCAN_RANGE < latest ? fromBlock + MAX_SCAN_RANGE : latest;

  const events = await scanReferralEvents(fromBlock, toBlock);
  let synced = 0;
  for (const ev of events) {
    try {
      await upsertReferralFromChain(sb, ev.user, ev.upline, ev.txHash);
      synced++;
    } catch (e) {
      console.error('[referral-sync] upsert failed', ev.user, e instanceof Error ? e.message : e);
    }
  }

  await writeCursor(sb, toBlock);
  return { configured: true, synced, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() };
}
