import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Hash } from 'npm:viem@2';
import { writeAuditLog } from './audit.ts';
import { postLedgerEntry } from './ledger.ts';
import {
  BSC_CHAIN_ID,
  BSC_CHAIN_NAME,
  BSC_USDT_CONTRACT,
  BSC_USDT_SYMBOL,
  DEPOSIT_INTENT_TTL_HOURS,
} from './tokens.ts';
import {
  formatUsdtAmount,
  parseUsdtAmount,
  verifyUsdtTransfer,
} from './turnkey.ts';
import { rollupPartnerPerformance } from './partnerPerformance.ts';
import { syncStakePositionOnCredit } from './partnerSettlement.ts';
import {
  claimDepositWalletFromPool,
  createOnDemandDepositWallet,
  replenishDepositPoolIfLow,
} from './depositPool.ts';
import { ensureInfrastructureWallets } from './wallets.ts';

type Sb = SupabaseClient;

export type DepositIntentResponse = {
  intentId: string;
  depositAddress: string;
  shortAddress: string;
  chainId: number;
  chainName: string;
  tokenSymbol: string;
  tokenContract: string;
  expectedAmount: string;
  expiresAt: string;
  status: string;
};

function shortAddr(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function expiresAt(): string {
  return new Date(Date.now() + DEPOSIT_INTENT_TTL_HOURS * 3600_000).toISOString();
}

async function allocateDepositWallet(
  sb: Sb,
  walletAddress: string,
  batchId: string,
  label: string,
): Promise<{ walletId: string; address: string }> {
  const fromPool = await claimDepositWalletFromPool(sb, walletAddress, batchId);
  if (fromPool) {
    return fromPool;
  }

  const created = await createOnDemandDepositWallet(sb, walletAddress, batchId, label);

  replenishDepositPoolIfLow(sb).catch((e) => {
    console.error('[deposit] pool replenish after on-demand:', e instanceof Error ? e.message : e);
  });

  return created;
}

function toIntentResponse(
  intent: Record<string, unknown>,
  depositAddress: string,
): DepositIntentResponse {
  return {
    intentId: intent.id as string,
    depositAddress,
    shortAddress: shortAddr(depositAddress),
    chainId: BSC_CHAIN_ID,
    chainName: BSC_CHAIN_NAME,
    tokenSymbol: BSC_USDT_SYMBOL,
    tokenContract: BSC_USDT_CONTRACT,
    expectedAmount: String(intent.amount_usdt),
    expiresAt: intent.expires_at as string,
    status: intent.status as string,
  };
}

export async function createStakeIntent(
  sb: Sb,
  walletAddress: string,
  intentType: 'partner_join' | 'crowdfund_stake',
  amountUsdt: number,
): Promise<DepositIntentResponse> {
  if (amountUsdt <= 0) throw new Error('Invalid amount');

  await ensureInfrastructureWallets(sb);
  replenishDepositPoolIfLow(sb).catch((e) => {
    console.error('[deposit] pool replenish on intent:', e instanceof Error ? e.message : e);
  });

  await sb.from('profiles').upsert(
    { wallet_address: walletAddress },
    { onConflict: 'wallet_address', ignoreDuplicates: true },
  );

  const batchId = crypto.randomUUID();
  const label = `${intentType}-${walletAddress.slice(0, 8)}-${batchId.slice(0, 8)}`;
  const { walletId, address } = await allocateDepositWallet(sb, walletAddress, batchId, label);

  const { data: intent, error: intentErr } = await sb
    .from('stake_intents')
    .insert({
      id: batchId,
      wallet_address: walletAddress,
      intent_type: intentType,
      amount_usdt: amountUsdt,
      deposit_wallet_id: walletId,
      status: 'awaiting_payment',
      expires_at: expiresAt(),
    })
    .select('*')
    .single();
  if (intentErr) throw intentErr;

  const { error: depErr } = await sb.from('deposit_records').insert({
    wallet_address: walletAddress,
    batch_id: batchId,
    intent_id: batchId,
    deposit_wallet_id: walletId,
    deposit_address: address,
    chain_id: BSC_CHAIN_ID,
    token_symbol: BSC_USDT_SYMBOL,
    token_contract: BSC_USDT_CONTRACT,
    expected_amount: amountUsdt,
    status: 'pending',
  });
  if (depErr) throw depErr;

  await writeAuditLog(sb, {
    actorType: 'system',
    action: 'stake_intent_created',
    entityType: 'stake_intents',
    entityId: batchId,
    newValue: { intentType, amountUsdt, depositAddress: address },
  });

  return toIntentResponse(intent as Record<string, unknown>, address);
}

export async function getDepositStatus(sb: Sb, walletAddress: string, intentId: string) {
  const { data: intent, error } = await sb
    .from('stake_intents')
    .select('*')
    .eq('id', intentId)
    .eq('wallet_address', walletAddress)
    .maybeSingle();
  if (error) throw error;
  if (!intent) throw new Error('Intent not found');

  const { data: walletRow } = await sb
    .from('wallet_accounts')
    .select('address')
    .eq('id', intent.deposit_wallet_id as string)
    .maybeSingle();

  const depositAddress = walletRow?.address;
  if (!depositAddress) throw new Error('Deposit wallet missing');

  const { data: deposit } = await sb
    .from('deposit_records')
    .select('*')
    .eq('intent_id', intentId)
    .maybeSingle();

  return {
    ...toIntentResponse(intent as Record<string, unknown>, depositAddress),
    txHash: deposit?.tx_hash ?? null,
    receivedAmount: deposit?.received_amount ? String(deposit.received_amount) : '0',
    confirmations: deposit?.confirmations ?? 0,
    depositStatus: deposit?.status ?? 'pending',
    credited: isIntentCredited(intent.status as string),
  };
}

export async function creditDepositDemo(sb: Sb, walletAddress: string, intentId: string) {
  const { data: intent } = await sb
    .from('stake_intents')
    .select('*')
    .eq('id', intentId)
    .eq('wallet_address', walletAddress)
    .maybeSingle();
  if (!intent) throw new Error('Intent not found');

  const amount = String(intent.amount_usdt);
  const now = new Date().toISOString();

  await sb
    .from('deposit_records')
    .update({
      received_amount: amount,
      status: 'swept',
      credited_at: now,
      confirmed_at: now,
      detected_at: now,
      updated_at: now,
    })
    .eq('intent_id', intentId);

  await sb
    .from('stake_intents')
    .update({ status: 'completed', updated_at: now })
    .eq('id', intentId);

  await rollupPartnerPerformance(sb, walletAddress, Number(intent.amount_usdt)).catch((e) => {
    console.error('[deposit] demo partner performance rollup:', e instanceof Error ? e.message : e);
  });

  await syncStakePositionOnCredit(sb, intentId).catch((e) => {
    console.error('[deposit] demo stake position sync:', e instanceof Error ? e.message : e);
  });

  await postLedgerEntry(sb, {
    ledgerType: 'deposit_credit',
    walletAddress,
    batchId: intentId,
    chainId: BSC_CHAIN_ID,
    tokenSymbol: BSC_USDT_SYMBOL,
    amount,
    direction: 'credit',
    referenceId: intentId,
  });

  return getDepositStatus(sb, walletAddress, intentId);
}

export async function reportDepositTx(
  sb: Sb,
  walletAddress: string,
  intentId: string,
  txHash: string,
) {
  const { data: intent } = await sb
    .from('stake_intents')
    .select('*, deposit_records(*)')
    .eq('id', intentId)
    .eq('wallet_address', walletAddress)
    .maybeSingle();
  if (!intent) throw new Error('Intent not found');

  const deposit = Array.isArray(intent.deposit_records)
    ? intent.deposit_records[0]
    : intent.deposit_records;
  if (!deposit) throw new Error('Deposit record missing');

  const { data: dup } = await sb
    .from('deposit_records')
    .select('id')
    .eq('chain_id', BSC_CHAIN_ID)
    .ilike('tx_hash', txHash)
    .neq('intent_id', intentId)
    .maybeSingle();
  if (dup) throw new Error('Transaction already credited to another deposit');

  const minWei = parseUsdtAmount(Number(intent.amount_usdt));
  const verification = await verifyUsdtTransfer({
    txHash: txHash as Hash,
    expectedTo: deposit.deposit_address as string,
    minAmountWei: minWei,
  });

  const now = new Date().toISOString();
  const received = formatUsdtAmount(verification.amount);

  if (!verification.ok) {
    await sb
      .from('deposit_records')
      .update({
        tx_hash: txHash,
        received_amount: received,
        confirmations: verification.confirmations,
        status: verification.confirmations > 0 ? 'detected' : 'pending',
        detected_at: verification.confirmations > 0 ? now : null,
      })
      .eq('intent_id', intentId);

    await sb
      .from('stake_intents')
      .update({
        status: verification.confirmations > 0 ? 'detected' : 'awaiting_payment',
        updated_at: now,
      })
      .eq('id', intentId);

    return getDepositStatus(sb, walletAddress, intentId);
  }

  await sb
    .from('deposit_records')
    .update({
      tx_hash: txHash,
      received_amount: received,
      confirmations: verification.confirmations,
      status: 'credited',
      detected_at: now,
      confirmed_at: now,
      credited_at: now,
    })
    .eq('intent_id', intentId);

  await sb.from('stake_intents').update({ status: 'credited', updated_at: now }).eq('id', intentId);

  await rollupPartnerPerformance(sb, walletAddress, Number(received)).catch((e) => {
    console.error('[deposit] partner performance rollup:', e instanceof Error ? e.message : e);
  });

  await syncStakePositionOnCredit(sb, intentId).catch((e) => {
    console.error('[deposit] stake position sync:', e instanceof Error ? e.message : e);
  });

  await postLedgerEntry(sb, {
    ledgerType: 'deposit_credit',
    walletAddress,
    batchId: intentId,
    walletId: deposit.deposit_wallet_id as string,
    chainId: BSC_CHAIN_ID,
    tokenSymbol: BSC_USDT_SYMBOL,
    amount: received,
    direction: 'credit',
    txHash,
    referenceId: intentId,
  });

  await writeAuditLog(sb, {
    actorType: 'system',
    action: 'deposit_credited',
    entityType: 'deposit_records',
    entityId: deposit.id as string,
    newValue: { txHash, received },
  });

  await triggerSweepPipeline(sb);

  return getDepositStatus(sb, walletAddress, intentId);
}

export function isIntentCredited(status: string): boolean {
  return ['credited', 'sweep_pending', 'sweeping', 'completed'].includes(status);
}

async function triggerSweepPipeline(sb: Sb): Promise<void> {
  try {
    const { runTreasuryPipeline } = await import('./sweep.ts');
    await runTreasuryPipeline(sb, { maxSweepJobs: 2, maxMonitor: 0 });
  } catch (e) {
    console.error('[deposit] sweep pipeline error:', e instanceof Error ? e.message : e);
  }
}
