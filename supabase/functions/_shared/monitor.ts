import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { postLedgerEntry } from './ledger.ts';
import { BSC_CHAIN_ID, BSC_USDT_SYMBOL } from './tokens.ts';
import {
  findUsdtTransferToAddress,
  formatUsdtAmount,
  parseUsdtAmount,
  verifyUsdtTransfer,
} from './turnkey.ts';
import type { Hash } from 'npm:viem@2';

type Sb = SupabaseClient;

/** Auto-detect on-chain USDT deposits without client report-tx. */
export async function scanPendingDeposits(sb: Sb, limit = 20): Promise<number> {
  const { data: deposits, error } = await sb
    .from('deposit_records')
    .select('*, stake_intents(*)')
    .in('status', ['pending', 'detected'])
    .is('tx_hash', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!deposits?.length) return 0;

  let credited = 0;

  for (const dep of deposits) {
    const intent = Array.isArray(dep.stake_intents) ? dep.stake_intents[0] : dep.stake_intents;
    if (!intent) continue;

    const minWei = parseUsdtAmount(Number(intent.amount_usdt));
    const found = await findUsdtTransferToAddress({
      depositAddress: dep.deposit_address as string,
      minAmountWei: minWei,
    });

    if (!found) continue;

    const { data: dup } = await sb
      .from('deposit_records')
      .select('id')
      .eq('chain_id', BSC_CHAIN_ID)
      .ilike('tx_hash', found.txHash)
      .neq('id', dep.id)
      .maybeSingle();
    if (dup) continue;

    const verification = await verifyUsdtTransfer({
      txHash: found.txHash as Hash,
      expectedTo: dep.deposit_address as string,
      minAmountWei: minWei,
    });

    if (!verification.ok) {
      const now = new Date().toISOString();
      await sb
        .from('deposit_records')
        .update({
          tx_hash: found.txHash,
          received_amount: formatUsdtAmount(verification.amount),
          confirmations: verification.confirmations,
          status: 'detected',
          detected_at: now,
          updated_at: now,
        })
        .eq('id', dep.id);
      continue;
    }

    const now = new Date().toISOString();
    const received = formatUsdtAmount(verification.amount);

    await sb
      .from('deposit_records')
      .update({
        tx_hash: found.txHash,
        received_amount: received,
        confirmations: verification.confirmations,
        status: 'credited',
        detected_at: now,
        confirmed_at: now,
        credited_at: now,
        updated_at: now,
      })
      .eq('id', dep.id);

    await sb
      .from('stake_intents')
      .update({ status: 'credited', updated_at: now })
      .eq('id', intent.id);

    await postLedgerEntry(sb, {
      ledgerType: 'deposit_credit',
      walletAddress: dep.wallet_address as string,
      batchId: dep.intent_id as string,
      walletId: dep.deposit_wallet_id as string,
      chainId: BSC_CHAIN_ID,
      tokenSymbol: BSC_USDT_SYMBOL,
      amount: received,
      direction: 'credit',
      txHash: found.txHash,
      referenceId: dep.intent_id as string,
    });

    credited++;
  }

  return credited;
}
