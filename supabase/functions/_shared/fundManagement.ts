import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { formatUnits, isAddress } from 'npm:viem@2';
import {
  broadcastSignedTransaction,
  getBscPublicClient,
  pollTurnkeyActivity,
  submitTreasuryTransfer,
  walletContextFromDbRow,
  type TreasuryTransferAsset,
} from './turnkey.ts';
import { getTreasuryWallet } from './wallets.ts';
import { BSC_USDT_CONTRACT, BSC_USDT_DECIMALS } from './tokens.ts';

type Sb = SupabaseClient;

const erc20BalanceAbi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export type InfraWalletBalance = {
  walletType: string;
  label: string | null;
  address: string;
  status: string;
  bnb: number;
  usdt: number;
};

/**
 * Read on-chain balances (native BNB + settlement USDT) for the operational
 * Turnkey wallets shown in the admin fund-management view: gas, treasury,
 * flash-swap and every settlement wallet. Deposit wallets are summarised by
 * count elsewhere (there are hundreds). Read-only — no signing, so this works
 * regardless of the Turnkey signing quota.
 */
export async function getInfraWalletBalances(sb: Sb): Promise<{
  wallets: InfraWalletBalance[];
  depositCount: number;
  usdtContract: string;
}> {
  const { data: rows } = await sb
    .from('wallet_accounts')
    .select('wallet_type, address, status, metadata')
    .in('wallet_type', ['gas', 'treasury', 'flash_swap', 'settlement'])
    .order('wallet_type', { ascending: true });

  const { count: depositCount } = await sb
    .from('wallet_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_type', 'deposit');

  const client = getBscPublicClient();
  const wallets: InfraWalletBalance[] = await Promise.all(
    (rows ?? []).map(async (w) => {
      const address = w.address as string;
      let bnb = 0;
      let usdt = 0;
      try {
        const [wei, tokenWei] = await Promise.all([
          client.getBalance({ address: address as `0x${string}` }),
          client.readContract({
            address: BSC_USDT_CONTRACT as `0x${string}`,
            abi: erc20BalanceAbi,
            functionName: 'balanceOf',
            args: [address as `0x${string}`],
          }) as Promise<bigint>,
        ]);
        bnb = Number(formatUnits(wei, 18));
        usdt = Number(formatUnits(tokenWei, BSC_USDT_DECIMALS));
      } catch {
        // Leave zeros on RPC failure — the row still renders with its address.
      }
      return {
        walletType: w.wallet_type as string,
        label: ((w.metadata as { label?: string } | null)?.label) ?? null,
        address,
        status: w.status as string,
        bnb: Math.round(bnb * 1e6) / 1e6,
        usdt: Math.round(usdt * 1e4) / 1e4,
      };
    }),
  );

  return { wallets, depositCount: depositCount ?? 0, usdtContract: BSC_USDT_CONTRACT };
}

export type TreasuryTransferRow = {
  id: string;
  asset: string;
  to_address: string;
  amount: number;
  status: string;
  turnkey_activity_id: string | null;
  tx_hash: string | null;
  note: string | null;
  error: string | null;
  created_at: string;
  broadcast_at: string | null;
};

/**
 * Propose an outbound treasury transfer. Records a request row and submits a
 * Turnkey SIGN_TRANSACTION activity against the 2/3 multisig treasury wallet.
 * The activity comes back as CONSENSUS_NEEDED — the row is stored as
 * `awaiting_consensus` with its activityId for later broadcast. Dev single-signer
 * wallets sign+broadcast inline (status → confirmed).
 */
export async function proposeTreasuryTransfer(
  sb: Sb,
  opts: { asset: TreasuryTransferAsset; toAddress: string; amount: number; createdBy?: string; note?: string },
): Promise<TreasuryTransferRow> {
  const to = opts.toAddress.trim();
  if (!isAddress(to)) throw new Error('无效的收款地址');
  if (!(opts.amount > 0)) throw new Error('转账金额必须大于 0');
  if (opts.asset !== 'usdt' && opts.asset !== 'bnb') throw new Error('不支持的资产类型');

  const treasury = await getTreasuryWallet(sb);
  if (!treasury) throw new Error('未找到金库钱包');

  // Record the request first so a Turnkey failure still leaves an audit trail.
  const { data: inserted, error: insErr } = await sb
    .from('treasury_transfer_requests')
    .insert({
      asset: opts.asset,
      to_address: to,
      amount: opts.amount,
      from_wallet_id: treasury.id,
      from_address: treasury.address,
      status: 'awaiting_consensus',
      note: opts.note ?? null,
      created_by: opts.createdBy ?? null,
    })
    .select('*')
    .single();
  if (insErr || !inserted) throw new Error(insErr?.message ?? '写入转账申请失败');

  try {
    const submission = await submitTreasuryTransfer({
      from: walletContextFromDbRow({ address: treasury.address, metadata: treasury.metadata }),
      asset: opts.asset,
      to,
      amount: String(opts.amount),
    });

    const patch: Record<string, unknown> = {
      turnkey_activity_id: submission.activityId ?? null,
      updated_at: new Date().toISOString(),
    };
    if (submission.txHash) {
      patch.status = 'confirmed';
      patch.tx_hash = submission.txHash;
      patch.broadcast_at = new Date().toISOString();
    } else if (submission.awaitingConsensus) {
      patch.status = 'awaiting_consensus';
    } else {
      patch.status = 'submitted';
    }

    const { data: updated } = await sb
      .from('treasury_transfer_requests')
      .update(patch)
      .eq('id', inserted.id)
      .select('*')
      .single();
    return (updated ?? inserted) as TreasuryTransferRow;
  } catch (e) {
    const message = e instanceof Error ? e.message : '提交 Turnkey 签名失败';
    await sb
      .from('treasury_transfer_requests')
      .update({ status: 'failed', error: message, updated_at: new Date().toISOString() })
      .eq('id', inserted.id);
    throw new Error(message);
  }
}

/** List recent treasury transfer requests (most recent first). */
export async function listTreasuryTransfers(sb: Sb, limit = 30): Promise<TreasuryTransferRow[]> {
  const { data } = await sb
    .from('treasury_transfer_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as TreasuryTransferRow[];
}

/**
 * Poll a pending transfer's Turnkey activity; once the 2/3 quorum has approved
 * it, broadcast the signed transaction and record the hash. Returns the updated
 * row. Safe to call repeatedly — it no-ops if not yet approved.
 */
export async function broadcastTreasuryTransfer(sb: Sb, id: string): Promise<TreasuryTransferRow> {
  const { data: row } = await sb
    .from('treasury_transfer_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!row) throw new Error('未找到转账申请');
  if (row.status === 'confirmed' || row.status === 'broadcast') return row as TreasuryTransferRow;
  if (!row.turnkey_activity_id) throw new Error('该申请没有关联 Turnkey 活动');

  const activity = await pollTurnkeyActivity(row.turnkey_activity_id);
  if (activity.failure || activity.status === 'ACTIVITY_STATUS_FAILED' || activity.status === 'ACTIVITY_STATUS_REJECTED') {
    const { data: failed } = await sb
      .from('treasury_transfer_requests')
      .update({ status: 'failed', error: activity.failure ?? activity.status ?? '多签被拒绝', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    return (failed ?? row) as TreasuryTransferRow;
  }
  if (activity.status !== 'ACTIVITY_STATUS_COMPLETED' || !activity.signedTransaction) {
    throw new Error('多签尚未批准（仍在等待签署人确认）');
  }

  const txHash = await broadcastSignedTransaction(activity.signedTransaction);
  const { data: confirmed } = await sb
    .from('treasury_transfer_requests')
    .update({
      status: 'confirmed',
      tx_hash: txHash,
      broadcast_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  return (confirmed ?? row) as TreasuryTransferRow;
}
