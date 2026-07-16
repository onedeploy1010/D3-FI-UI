import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  concatHex,
  encodeFunctionData,
  keccak256,
  parseAbi,
  toBytes,
  type Hex,
} from 'npm:viem@2';
import { sendContractCall, walletContextFromDbRow } from './turnkey.ts';
import { getGasWallet } from './wallets.ts';
import { yesterdaySgtDateString } from './partnerTimezone.ts';

type Sb = SupabaseClient;

const anchorAbi = parseAbi([
  'function anchor(uint256 dateKey, bytes32 root, uint64 leafCount)',
]);

export function dailyStateAnchorAddress(): string | null {
  return Deno.env.get('DAILY_STATE_ANCHOR_ADDRESS')?.trim() || null;
}

/** 'YYYY-MM-DD' -> integer yyyymmdd (matches DailyStateAnchor dateKey). */
export function dateKeyFromDateStr(dateStr: string): number {
  return Number(dateStr.replace(/-/g, ''));
}

/** Canonical, stable leaf for a wallet's balances. Both anchorer and verifier must match this. */
export function leafFor(row: {
  wallet_address: string;
  ud3_balance?: number | string | null;
  pending_d3_yield?: number | string | null;
  lifetime_ud3_earned?: number | string | null;
  lifetime_d3_yield?: number | string | null;
}): Hex {
  const f = (v: unknown) => Number(v ?? 0).toFixed(6);
  const canonical = [
    row.wallet_address.toLowerCase(),
    f(row.ud3_balance),
    f(row.pending_d3_yield),
    f(row.lifetime_ud3_earned),
    f(row.lifetime_d3_yield),
  ].join('|');
  return keccak256(toBytes(canonical));
}

function hashPair(a: Hex, b: Hex): Hex {
  return a.toLowerCase() <= b.toLowerCase()
    ? keccak256(concatHex([a, b]))
    : keccak256(concatHex([b, a]));
}

/** Build a sorted-leaf, sorted-pair Merkle tree (matches DailyStateAnchor.verify). */
export function buildTree(leaves: Hex[]): { root: Hex; layers: Hex[][] } {
  if (leaves.length === 0) {
    return { root: `0x${'0'.repeat(64)}` as Hex, layers: [[]] };
  }
  let layer = [...leaves].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
  const layers: Hex[][] = [layer];
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(i + 1 < layer.length ? hashPair(layer[i], layer[i + 1]) : layer[i]);
    }
    layer = next;
    layers.push(layer);
  }
  return { root: layer[0], layers };
}

/** Merkle proof for `leaf` against the tree layers. */
export function proofFor(layers: Hex[][], leaf: Hex): Hex[] {
  const proof: Hex[] = [];
  let idx = layers[0].findIndex((l) => l.toLowerCase() === leaf.toLowerCase());
  if (idx < 0) return proof;
  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level];
    const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (pairIdx < layer.length) proof.push(layer[pairIdx]);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

async function fetchAllAccounts(sb: Sb) {
  const rows: Array<Record<string, unknown>> = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await sb
      .from('partner_accounts')
      .select('wallet_address, ud3_balance, pending_d3_yield, lifetime_ud3_earned, lifetime_d3_yield')
      .order('wallet_address', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return rows;
}

export async function buildDailyStateRoot(sb: Sb, dateStr: string): Promise<{
  root: Hex;
  leafCount: number;
  layers: Hex[][];
  accounts: Array<Record<string, unknown>>;
}> {
  const accounts = await fetchAllAccounts(sb);
  const leaves = accounts.map((a) => leafFor(a as Parameters<typeof leafFor>[0]));
  const { root, layers } = buildTree(leaves);
  return { root, leafCount: leaves.length, layers, accounts };
}

/**
 * Compute the daily Merkle root, store it in daily_state_anchors, and (if configured)
 * anchor it on-chain via the gas wallet so the off-chain ledger becomes tamper-evident.
 */
export async function anchorDailyState(
  sb: Sb,
  settlementDate?: string,
): Promise<{
  dateStr: string;
  root: string;
  leafCount: number;
  anchored: boolean;
  txHash: string | null;
  skipped?: string;
}> {
  const dateStr = settlementDate ?? yesterdaySgtDateString();

  const { data: existing } = await sb
    .from('daily_state_anchors')
    .select('settlement_date, merkle_root, tx_hash')
    .eq('settlement_date', dateStr)
    .maybeSingle();
  if (existing?.tx_hash) {
    return { dateStr, root: existing.merkle_root as string, leafCount: 0, anchored: true, txHash: existing.tx_hash as string, skipped: 'already anchored' };
  }

  const { root, leafCount } = await buildDailyStateRoot(sb, dateStr);

  await sb.from('daily_state_anchors').upsert(
    { settlement_date: dateStr, merkle_root: root, leaf_count: leafCount },
    { onConflict: 'settlement_date' },
  );

  const anchorAddr = dailyStateAnchorAddress();
  if (!anchorAddr) {
    return { dateStr, root, leafCount, anchored: false, txHash: null, skipped: 'DAILY_STATE_ANCHOR_ADDRESS not set' };
  }

  const gasWallet = await getGasWallet(sb);
  if (!gasWallet) {
    return { dateStr, root, leafCount, anchored: false, txHash: null, skipped: 'no gas wallet to anchor from' };
  }

  const data = encodeFunctionData({
    abi: anchorAbi,
    functionName: 'anchor',
    args: [BigInt(dateKeyFromDateStr(dateStr)), root, BigInt(leafCount)],
  });

  const txHash = await sendContractCall({
    from: walletContextFromDbRow(gasWallet),
    to: anchorAddr,
    data,
  });

  await sb
    .from('daily_state_anchors')
    .update({ tx_hash: txHash, anchored_at: new Date().toISOString() })
    .eq('settlement_date', dateStr);

  return { dateStr, root, leafCount, anchored: true, txHash };
}

/** Rebuild the tree for a date and return a wallet's leaf + proof (for client verification). */
export async function getStateProof(
  sb: Sb,
  dateStr: string,
  wallet: string,
): Promise<{ dateKey: number; root: string | null; leaf: string | null; proof: string[] }> {
  const { data: anchor } = await sb
    .from('daily_state_anchors')
    .select('merkle_root')
    .eq('settlement_date', dateStr)
    .maybeSingle();

  const { layers, accounts } = await buildDailyStateRoot(sb, dateStr);
  const row = accounts.find(
    (a) => String(a.wallet_address).toLowerCase() === wallet.toLowerCase(),
  );
  if (!row) return { dateKey: dateKeyFromDateStr(dateStr), root: (anchor?.merkle_root as string) ?? null, leaf: null, proof: [] };

  const leaf = leafFor(row as Parameters<typeof leafFor>[0]);
  return {
    dateKey: dateKeyFromDateStr(dateStr),
    root: (anchor?.merkle_root as string) ?? null,
    leaf,
    proof: proofFor(layers, leaf),
  };
}
