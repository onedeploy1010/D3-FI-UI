import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isDemoModeRequest } from './demo.ts';
import { writeAuditLog } from './audit.ts';
import {
  BSC_CHAIN_ID,
  BSC_USDT_CONTRACT,
  BSC_USDT_SYMBOL,
} from './tokens.ts';
import { formatUsdtAmount, parseUsdtAmount } from './turnkey.ts';
import { HttpError } from './wallet.ts';
import { ensureInfrastructureWallets, getFlashSwapWallet } from './wallets.ts';
import { d3ToUsdt, getD3PriceUsdt } from './d3Price.ts';
import { assertWithdrawAllowed } from './riskControls.ts';

type Sb = SupabaseClient;

const MIN_WITHDRAW_USDT = 0.001;
const MIN_SWAP_D3 = 0.000001;
/** Protocol fee on flash-swap yield withdrawals. */
const FLASH_SWAP_FEE_PCT = 3;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function splitFlashSwap(grossUsdt: number): { feeUsdt: number; netUsdt: number } {
  const feeUsdt = round4(grossUsdt * (FLASH_SWAP_FEE_PCT / 100));
  const netUsdt = round4(grossUsdt - feeUsdt);
  return { feeUsdt, netUsdt };
}

/**
 * Atomically debit released D3 at request time (V-03). The DB RPC does a
 * conditional UPDATE and raises INSUFFICIENT_BALANCE when the balance is short.
 */
async function debitPendingD3(sb: Sb, wallet: string, amount: number): Promise<void> {
  const { error } = await sb.rpc('debit_pending_d3_yield', { p_wallet: wallet, p_amount: amount });
  if (error) {
    if ((error.message ?? '').includes('INSUFFICIENT_BALANCE')) {
      throw new HttpError(400, 'Insufficient balance');
    }
    throw error;
  }
}

/** Add released D3 back after a failed downstream step (compensation, best-effort). */
async function creditPendingD3(sb: Sb, wallet: string, amount: number): Promise<void> {
  const { error } = await sb.rpc('credit_pending_d3_yield', { p_wallet: wallet, p_amount: amount });
  if (error) {
    // Never mask the original failure; surface the compensation problem for ops.
    console.error('[yieldWithdraw] credit_pending_d3_yield compensation failed:', error.message);
  }
}

/** Map a Postgres unique-violation on the in-flight index to a 409. */
function mapWithdrawalInsertError(e: unknown): unknown {
  if ((e as { code?: string })?.code === '23505') {
    return new HttpError(409, 'A withdrawal is already in progress');
  }
  return e;
}

export type YieldWithdrawResult = {
  withdrawalId: string;
  amountD3: number;
  d3Price: number;
  amountUsdt: number;
  feeUsdt: number;
  netAmountUsdt: number;
  status: string;
  txHash?: string | null;
};

/**
 * Flash-swap released D3 -> USDT, paid from the flash-swap wallet.
 * gross = amountD3 * currentD3Price ; net = gross - 3% fee. Deducts pending_d3_yield.
 * D3 is the only path to real USDT (UD3 itself is never withdrawable).
 */
export async function requestPartnerYieldWithdraw(
  sb: Sb,
  walletAddress: string,
  amountD3: number,
  opts?: { demoMode?: boolean },
): Promise<YieldWithdrawResult> {
  const swapD3 = round6(amountD3);
  if (!Number.isFinite(swapD3) || swapD3 < MIN_SWAP_D3) {
    throw new HttpError(400, `Minimum flash-swap is ${MIN_SWAP_D3} D3`);
  }

  const { data: account, error: acctErr } = await sb
    .from('partner_accounts')
    .select('is_partner, pending_d3_yield')
    .eq('wallet_address', walletAddress)
    .maybeSingle();
  if (acctErr) throw acctErr;

  if (!account?.is_partner) {
    throw new HttpError(403, 'Partner account required');
  }

  const pendingD3 = Number(account.pending_d3_yield ?? 0);
  if (swapD3 > pendingD3 + 1e-6) {
    throw new HttpError(400, 'Insufficient released D3');
  }

  const d3Price = await getD3PriceUsdt(sb);
  const grossUsdt = d3ToUsdt(swapD3, d3Price);
  const { feeUsdt, netUsdt } = splitFlashSwap(grossUsdt);

  const { data: inflight } = await sb
    .from('partner_yield_withdrawals')
    .select('id')
    .eq('wallet_address', walletAddress)
    .in('status', ['pending', 'signing', 'broadcasted'])
    .maybeSingle();
  if (inflight) {
    throw new HttpError(409, 'A withdrawal is already in progress');
  }

  if (opts?.demoMode) {
    // Atomic debit at request time (consistent with the production path).
    await debitPendingD3(sb, walletAddress, swapD3);

    let row: { id: string };
    try {
      const { data, error } = await sb
        .from('partner_yield_withdrawals')
        .insert({
          wallet_address: walletAddress,
          d3_amount: swapD3,
          d3_price_at_swap: d3Price,
          amount_usdt: grossUsdt,
          fee_usdt: feeUsdt,
          net_amount_usdt: netUsdt,
          status: 'confirmed',
          tx_hash: `demo-${Date.now()}`,
        })
        .select('id')
        .single();
      if (error) throw error;
      row = data as { id: string };
    } catch (e) {
      await creditPendingD3(sb, walletAddress, swapD3);
      throw mapWithdrawalInsertError(e);
    }

    await writeAuditLog(sb, {
      actorType: 'system',
      action: 'yield_withdraw_demo',
      entityType: 'partner_yield_withdrawals',
      entityId: row.id as string,
      newValue: { walletAddress, amountD3: swapD3, d3Price, grossUsdt, feeUsdt, netUsdt },
    });

    return {
      withdrawalId: row.id as string,
      amountD3: swapD3,
      d3Price,
      amountUsdt: grossUsdt,
      feeUsdt,
      netAmountUsdt: netUsdt,
      status: 'confirmed',
      txHash: `demo-${Date.now()}`,
    };
  }

  await ensureInfrastructureWallets(sb);
  const flashWallet = await getFlashSwapWallet(sb);
  if (!flashWallet) {
    throw new HttpError(503, 'Flash-swap wallet not configured');
  }

  if (netUsdt < MIN_WITHDRAW_USDT) {
    throw new HttpError(400, `Net payout after ${FLASH_SWAP_FEE_PCT}% fee is below minimum`);
  }

  // V-09/V-10: enforce pause / caps / solvency BEFORE the atomic debit so a
  // blocked withdrawal never touches pending_d3_yield. Throws HttpError on trip.
  await assertWithdrawAllowed(sb, { walletAddress, amountUsdt: netUsdt });

  // V-03: debit the released D3 atomically BEFORE creating the withdrawal/sweep
  // rows. The DB in-flight partial-unique index is the real single-withdrawal
  // guard; the SELECT above is only an advisory fast-path 409. Any failure after
  // this point must credit the D3 back (compensation).
  await debitPendingD3(sb, walletAddress, swapD3);

  let withdrawalId: string;
  try {
    const { data: withdrawal, error: wErr } = await sb
      .from('partner_yield_withdrawals')
      .insert({
        wallet_address: walletAddress,
        d3_amount: swapD3,
        d3_price_at_swap: d3Price,
        amount_usdt: grossUsdt,
        fee_usdt: feeUsdt,
        net_amount_usdt: netUsdt,
        status: 'pending',
      })
      .select('id')
      .single();
    if (wErr) throw wErr;
    withdrawalId = withdrawal.id as string;
  } catch (e) {
    // Includes the 23505 in-flight collision: refund and surface 409.
    await creditPendingD3(sb, walletAddress, swapD3);
    throw mapWithdrawalInsertError(e);
  }

  const amountWei = parseUsdtAmount(netUsdt);

  let jobId: string;
  try {
    const { data: job, error: jobErr } = await sb
      .from('sweep_jobs')
      .insert({
        from_wallet_id: flashWallet.id,
        from_address: flashWallet.address,
        to_wallet_id: flashWallet.id,
        to_address: walletAddress,
        chain_id: BSC_CHAIN_ID,
        token_symbol: BSC_USDT_SYMBOL,
        token_contract: BSC_USDT_CONTRACT,
        amount: formatUsdtAmount(amountWei),
        job_type: 'yield_flash_withdraw',
        status: 'queued',
        reference_id: withdrawalId,
      })
      .select('id')
      .single();
    if (jobErr) throw jobErr;
    jobId = job.id as string;
  } catch (e) {
    // Sweep job never queued: mark the withdrawal failed (frees the in-flight
    // index) and refund the debited D3 so no funds are stranded.
    await sb
      .from('partner_yield_withdrawals')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', withdrawalId);
    await creditPendingD3(sb, walletAddress, swapD3);
    throw e;
  }

  await sb
    .from('partner_yield_withdrawals')
    .update({ sweep_job_id: jobId, updated_at: new Date().toISOString() })
    .eq('id', withdrawalId);

  await writeAuditLog(sb, {
    actorType: 'system',
    action: 'yield_withdraw_queued',
    entityType: 'partner_yield_withdrawals',
    entityId: withdrawalId,
    newValue: { walletAddress, amountD3: swapD3, d3Price, grossUsdt, feeUsdt, netUsdt, sweepJobId: jobId },
  });

  return {
    withdrawalId,
    amountD3: swapD3,
    d3Price,
    amountUsdt: grossUsdt,
    feeUsdt,
    netAmountUsdt: netUsdt,
    status: 'pending',
  };
}

export function isYieldWithdrawDemoRequest(req: Request): boolean {
  return isDemoModeRequest(req);
}
