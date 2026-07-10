import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { writeAuditLog } from './audit.ts';
import { postLedgerEntry } from './ledger.ts';
import {
  BSC_CHAIN_ID,
  BSC_USDT_CONTRACT,
  BSC_USDT_SYMBOL,
} from './tokens.ts';
import {
  formatUsdtAmount,
  getErc20Balance,
  parseUsdtAmount,
  sendErc20Transfer,
  settlementToTreasuryMinUsdt,
  walletContextFromDbRow,
} from './turnkey.ts';
import {
  ensureInfrastructureWallets,
  getGasWallet,
  getTreasuryWallet,
  getWalletById,
  pickSettlementWallet,
  type WalletRow,
} from './wallets.ts';

type Sb = SupabaseClient;

const MAX_SWEEP_RETRIES = 3;

type DepositRecord = {
  id: string;
  intent_id: string | null;
  deposit_wallet_id: string;
  deposit_address: string;
  wallet_address: string | null;
  batch_id: string | null;
  received_amount: string | number;
  status: string;
};

type SweepJob = {
  id: string;
  from_wallet_id: string;
  from_address: string;
  to_wallet_id: string;
  to_address: string;
  amount: string | number;
  job_type: string;
  status: string;
  retry_count: number;
  deposit_record_id: string | null;
  intent_id: string | null;
  token_contract: string;
  tx_hash?: string | null;
};

async function waitForTxConfirmation(txHash: string, maxAttempts = 30): Promise<boolean> {
  const { getBscPublicClient } = await import('./turnkey.ts');
  const client = getBscPublicClient();
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
      if (receipt?.status === 'success') return true;
      if (receipt?.status === 'reverted') return false;
    } catch {
      // Receipt not indexed yet — keep polling.
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function finalizeSweepJob(
  sb: Sb,
  job: SweepJob,
  txHash: string,
  sweepAmount: bigint,
): Promise<void> {
  const now = new Date().toISOString();
  await sb
    .from('sweep_jobs')
    .update({ status: 'confirmed', tx_hash: txHash, updated_at: now })
    .eq('id', job.id);

  if (job.job_type === 'deposit_to_settlement') {
    await sb
      .from('deposit_records')
      .update({ status: 'swept', updated_at: now })
      .eq('id', job.deposit_record_id!);

    if (job.intent_id) {
      await sb.from('stake_intents').update({ status: 'completed', updated_at: now }).eq('id', job.intent_id);
    }

    await sb
      .from('wallet_accounts')
      .update({ status: 'settled', updated_at: now })
      .eq('id', job.from_wallet_id);

    await postLedgerEntry(sb, {
      ledgerType: 'sweep_to_settlement',
      walletAddress: null,
      batchId: job.intent_id,
      walletId: job.from_wallet_id,
      chainId: BSC_CHAIN_ID,
      tokenSymbol: BSC_USDT_SYMBOL,
      amount: formatUsdtAmount(sweepAmount),
      direction: 'debit',
      txHash,
      referenceId: job.deposit_record_id,
    });
  } else if (job.job_type === 'settlement_to_treasury') {
    await postLedgerEntry(sb, {
      ledgerType: 'settlement_to_treasury',
      walletAddress: null,
      walletId: job.from_wallet_id,
      chainId: BSC_CHAIN_ID,
      tokenSymbol: BSC_USDT_SYMBOL,
      amount: formatUsdtAmount(sweepAmount),
      direction: 'debit',
      txHash,
      referenceId: job.id,
    });
  }

  await writeAuditLog(sb, {
    actorType: 'system',
    action: 'sweep_confirmed',
    entityType: 'sweep_jobs',
    entityId: job.id,
    newValue: { txHash, jobType: job.job_type, amount: formatUsdtAmount(sweepAmount) },
  });
}

export async function enqueueDepositSweeps(sb: Sb, limit = 20): Promise<number> {
  await ensureInfrastructureWallets(sb);

  const { data: deposits, error } = await sb
    .from('deposit_records')
    .select('*')
    .eq('status', 'credited')
    .order('credited_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!deposits?.length) return 0;

  let enqueued = 0;
  for (const dep of deposits as DepositRecord[]) {
    const { data: existing } = await sb
      .from('sweep_jobs')
      .select('id')
      .eq('deposit_record_id', dep.id)
      .eq('job_type', 'deposit_to_settlement')
      .maybeSingle();
    if (existing) continue;

    const settlement = await pickSettlementWallet(sb);
    const amount = String(dep.received_amount);

    const { error: jobErr } = await sb.from('sweep_jobs').insert({
      from_wallet_id: dep.deposit_wallet_id,
      from_address: dep.deposit_address,
      to_wallet_id: settlement.id,
      to_address: settlement.address,
      chain_id: BSC_CHAIN_ID,
      token_symbol: BSC_USDT_SYMBOL,
      token_contract: BSC_USDT_CONTRACT,
      amount,
      job_type: 'deposit_to_settlement',
      status: 'queued',
      deposit_record_id: dep.id,
      intent_id: dep.intent_id,
    });
    if (jobErr) {
      console.error('[sweep] enqueue failed', jobErr.message);
      continue;
    }

    const now = new Date().toISOString();
    await sb.from('deposit_records').update({ status: 'sweep_pending', updated_at: now }).eq('id', dep.id);
    if (dep.intent_id) {
      await sb.from('stake_intents').update({ status: 'sweep_pending', updated_at: now }).eq('id', dep.intent_id);
    }

    enqueued++;
  }

  return enqueued;
}

async function executeSweepJob(sb: Sb, job: SweepJob, gasWallet: WalletRow | null): Promise<void> {
  const recordedAmount = parseUsdtAmount(Number(job.amount));

  if (job.tx_hash) {
    const confirmed = await waitForTxConfirmation(job.tx_hash);
    if (confirmed) {
      await finalizeSweepJob(sb, job, job.tx_hash, recordedAmount);
      return;
    }
    throw new Error(`Sweep tx not confirmed: ${job.tx_hash}`);
  }

  const fromWallet = await getWalletById(sb, job.from_wallet_id);
  if (!fromWallet) throw new Error('Source wallet not found');

  const fromCtx = walletContextFromDbRow(fromWallet);
  const gasCtx = gasWallet ? walletContextFromDbRow(gasWallet) : undefined;

  const onChainBalance = await getErc20Balance(job.token_contract, job.from_address);
  if (onChainBalance === 0n) {
    throw new Error('No USDT balance to sweep');
  }

  const sweepAmount = onChainBalance;

  await sb.from('sweep_jobs').update({ status: 'signing', updated_at: new Date().toISOString() }).eq('id', job.id);

  const txHash = await sendErc20Transfer({
    from: fromCtx,
    tokenContract: job.token_contract,
    to: job.to_address,
    amountWei: sweepAmount,
    gasFundingCtx: gasCtx,
  });

  await sb
    .from('sweep_jobs')
    .update({ status: 'broadcasted', tx_hash: txHash, updated_at: new Date().toISOString() })
    .eq('id', job.id);

  const confirmed = await waitForTxConfirmation(txHash);
  if (!confirmed) throw new Error(`Sweep tx not confirmed: ${txHash}`);

  await finalizeSweepJob(sb, job, txHash, sweepAmount);
}

export async function processSweepJobs(sb: Sb, limit = 5): Promise<{ processed: number; failed: number }> {
  const gasWallet = await getGasWallet(sb);

  const { data: jobs, error } = await sb
    .from('sweep_jobs')
    .select('*')
    .in('status', ['queued', 'broadcasted'])
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!jobs?.length) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  for (const job of jobs as SweepJob[]) {
    try {
      await executeSweepJob(sb, job, gasWallet);
      processed++;
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : String(e);
      const retry = job.retry_count + 1;
      const status = retry >= MAX_SWEEP_RETRIES ? 'manual_review' : 'queued';

      await sb
        .from('sweep_jobs')
        .update({
          status,
          retry_count: retry,
          error_message: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      await writeAuditLog(sb, {
        actorType: 'system',
        action: 'sweep_failed',
        entityType: 'sweep_jobs',
        entityId: job.id,
        newValue: { error: message, retry },
      });
    }
  }

  return { processed, failed };
}

export async function enqueueSettlementToTreasury(sb: Sb): Promise<number> {
  const treasury = await getTreasuryWallet(sb);
  if (!treasury) return 0;

  const minUsdt = settlementToTreasuryMinUsdt();
  const minWei = parseUsdtAmount(minUsdt);

  const { data: settlements } = await sb
    .from('wallet_accounts')
    .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
    .eq('wallet_type', 'settlement')
    .eq('status', 'active');

  if (!settlements?.length) return 0;

  let enqueued = 0;
  for (const settlement of settlements as WalletRow[]) {
    const balance = await getErc20Balance(BSC_USDT_CONTRACT, settlement.address);
    if (balance < minWei) continue;

    const { data: inflight } = await sb
      .from('sweep_jobs')
      .select('id')
      .eq('from_wallet_id', settlement.id)
      .eq('job_type', 'settlement_to_treasury')
      .in('status', ['queued', 'signing', 'broadcasted'])
      .maybeSingle();
    if (inflight) continue;

    const amount = formatUsdtAmount(balance);
    const { error } = await sb.from('sweep_jobs').insert({
      from_wallet_id: settlement.id,
      from_address: settlement.address,
      to_wallet_id: treasury.id,
      to_address: treasury.address,
      chain_id: BSC_CHAIN_ID,
      token_symbol: BSC_USDT_SYMBOL,
      token_contract: BSC_USDT_CONTRACT,
      amount,
      job_type: 'settlement_to_treasury',
      status: 'queued',
    });
    if (!error) enqueued++;
  }

  return enqueued;
}

export async function runTreasuryPipeline(
  sb: Sb,
  opts: { maxSweepJobs?: number; maxMonitor?: number } = {},
): Promise<{
  enqueuedDeposits: number;
  processedSweeps: number;
  failedSweeps: number;
  enqueuedTreasury: number;
  monitoredCredits: number;
}> {
  const { scanPendingDeposits, promoteDetectedDeposits } = await import('./monitor.ts');

  await ensureInfrastructureWallets(sb);

  const promotedCredits = await promoteDetectedDeposits(sb, opts.maxMonitor ?? 20);
  const monitoredCredits = opts.maxMonitor === 0
    ? 0
    : await scanPendingDeposits(sb, opts.maxMonitor ?? 10);
  const enqueuedDeposits = await enqueueDepositSweeps(sb);
  const sweepResult = await processSweepJobs(sb, opts.maxSweepJobs ?? 5);
  const enqueuedTreasury = await enqueueSettlementToTreasury(sb);
  const treasurySweep = await processSweepJobs(sb, opts.maxSweepJobs ?? 3);

  return {
    enqueuedDeposits,
    processedSweeps: sweepResult.processed + treasurySweep.processed,
    failedSweeps: sweepResult.failed + treasurySweep.failed,
    enqueuedTreasury,
    monitoredCredits: promotedCredits + monitoredCredits,
    promotedCredits,
  };
}
