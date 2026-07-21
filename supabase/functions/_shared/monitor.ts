import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { postLedgerEntry } from './ledger.ts';
import { BSC_CHAIN_ID, BSC_USDT_SYMBOL } from './tokens.ts';
import {
  findUsdtTransferToAddress,
  formatUsdtAmount,
  parseUsdtAmount,
  verifyUsdtTransfer,
} from './turnkey.ts';
import { rollupPartnerPerformance } from './partnerPerformance.ts';
import { syncStakePositionOnCredit } from './partnerSettlement.ts';
import { tryAllocateUd3ForCreditedIntent } from './partnerUd3Settle.ts';
import { notify } from './notifications.ts';
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

    await rollupPartnerPerformance(sb, dep.wallet_address as string, Number(received)).catch((e) => {
      console.error('[monitor] partner performance rollup:', e instanceof Error ? e.message : e);
    });

    await notify(sb, dep.wallet_address as string, 'stake_success', {
      amount: Number(received).toLocaleString(),
    });

    if (dep.intent_id) {
      await syncStakePositionOnCredit(sb, dep.intent_id as string).catch((e) => {
        console.error('[monitor] stake position sync:', e instanceof Error ? e.message : e);
      });
      await tryAllocateUd3ForCreditedIntent(sb, dep.intent_id as string).catch((e) => {
        console.error('[monitor] UD3 allocate:', e instanceof Error ? e.message : e);
      });
    }

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

/**
 * Re-verify reported-but-uncredited deposits (tx reported while confirmations
 * were still low) and credit them once they reach the confirmation floor.
 * Includes both `detected` AND `pending` rows that have a tx_hash: a deposit
 * reported at 0 confirmations is written as `pending` with a tx_hash, which the
 * `tx_hash IS NULL` auto-scan skips — so without this it would never re-verify
 * and the client would sit until its poll timeout.
 */
export async function promoteDetectedDeposits(sb: Sb, limit = 20): Promise<number> {
  const { data: deposits, error } = await sb
    .from('deposit_records')
    .select('*')
    .in('status', ['detected', 'pending'])
    .not('tx_hash', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!deposits?.length) return 0;

  let credited = 0;

  for (const dep of deposits) {
    if (!dep.intent_id || !dep.deposit_address || !dep.tx_hash) continue;

    const minWei = parseUsdtAmount(Number(dep.expected_amount ?? 0));
    const verification = await verifyUsdtTransfer({
      txHash: dep.tx_hash as Hash,
      expectedTo: dep.deposit_address as string,
      minAmountWei: minWei,
    });

    if (!verification.ok) {
      const received = formatUsdtAmount(verification.amount);
      if (verification.amount > 0n || verification.confirmations > (dep.confirmations ?? 0)) {
        await sb
          .from('deposit_records')
          .update({
            received_amount: received,
            confirmations: verification.confirmations,
            updated_at: new Date().toISOString(),
          })
          .eq('id', dep.id);
      }
      continue;
    }

    const now = new Date().toISOString();
    const received = formatUsdtAmount(verification.amount);
    const walletAddress = dep.wallet_address as string;

    await sb
      .from('deposit_records')
      .update({
        received_amount: received,
        confirmations: verification.confirmations,
        status: 'credited',
        confirmed_at: now,
        credited_at: now,
        updated_at: now,
      })
      .eq('id', dep.id);

    await sb
      .from('stake_intents')
      .update({ status: 'credited', updated_at: now })
      .eq('id', dep.intent_id);

    if (walletAddress) {
      await rollupPartnerPerformance(sb, walletAddress, Number(received)).catch((e) => {
        console.error('[monitor] partner performance rollup:', e instanceof Error ? e.message : e);
      });
      await notify(sb, walletAddress, 'stake_success', { amount: Number(received).toLocaleString() });
      await syncStakePositionOnCredit(sb, dep.intent_id as string).catch((e) => {
        console.error('[monitor] stake position sync:', e instanceof Error ? e.message : e);
      });
      await tryAllocateUd3ForCreditedIntent(sb, dep.intent_id as string).catch((e) => {
        console.error('[monitor] UD3 allocate:', e instanceof Error ? e.message : e);
      });
    }

    await postLedgerEntry(sb, {
      ledgerType: 'deposit_credit',
      walletAddress: walletAddress || null,
      batchId: dep.intent_id as string,
      walletId: dep.deposit_wallet_id as string,
      chainId: BSC_CHAIN_ID,
      tokenSymbol: BSC_USDT_SYMBOL,
      amount: received,
      direction: 'credit',
      txHash: dep.tx_hash as string,
      referenceId: dep.intent_id as string,
    });

    credited++;
  }

  return credited;
}
