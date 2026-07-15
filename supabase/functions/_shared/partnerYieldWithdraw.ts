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

type Sb = SupabaseClient;

const MIN_WITHDRAW_USDT = 0.001;
/** Protocol fee on flash-swap yield withdrawals. */
const FLASH_SWAP_FEE_PCT = 3;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function splitFlashSwap(grossUsdt: number): { feeUsdt: number; netUsdt: number } {
  const feeUsdt = round4(grossUsdt * (FLASH_SWAP_FEE_PCT / 100));
  const netUsdt = round4(grossUsdt - feeUsdt);
  return { feeUsdt, netUsdt };
}

export type YieldWithdrawResult = {
  withdrawalId: string;
  amountUsdt: number;
  feeUsdt: number;
  netAmountUsdt: number;
  status: string;
  txHash?: string | null;
};

/** Request USDT yield withdrawal — pays from flash-swap wallet via sweep job. */
export async function requestPartnerYieldWithdraw(
  sb: Sb,
  walletAddress: string,
  amountUsdt: number,
  opts?: { demoMode?: boolean },
): Promise<YieldWithdrawResult> {
  const amount = round4(amountUsdt);
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAW_USDT) {
    throw new HttpError(400, `Minimum withdrawal is ${MIN_WITHDRAW_USDT} USDT`);
  }

  const { data: account, error: acctErr } = await sb
    .from('partner_accounts')
    .select('is_partner, pending_usdt_yield')
    .eq('wallet_address', walletAddress)
    .maybeSingle();
  if (acctErr) throw acctErr;

  if (!account?.is_partner) {
    throw new HttpError(403, 'Partner account required');
  }

  const pending = Number(account.pending_usdt_yield ?? 0);
  if (amount > pending + 0.0001) {
    throw new HttpError(400, 'Insufficient claimable yield');
  }

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
    const now = new Date().toISOString();
    const nextPending = Math.max(0, round4(pending - amount));
    const { feeUsdt, netUsdt } = splitFlashSwap(amount);

    const { data: row, error } = await sb
      .from('partner_yield_withdrawals')
      .insert({
        wallet_address: walletAddress,
        amount_usdt: amount,
        fee_usdt: feeUsdt,
        net_amount_usdt: netUsdt,
        status: 'confirmed',
        tx_hash: `demo-${Date.now()}`,
      })
      .select('id')
      .single();
    if (error) throw error;

    await sb
      .from('partner_accounts')
      .update({ pending_usdt_yield: nextPending, updated_at: now })
      .eq('wallet_address', walletAddress);

    await writeAuditLog(sb, {
      actorType: 'system',
      action: 'yield_withdraw_demo',
      entityType: 'partner_yield_withdrawals',
      entityId: row.id as string,
      newValue: { walletAddress, amountUsdt: amount, feeUsdt, netUsdt },
    });

    return {
      withdrawalId: row.id as string,
      amountUsdt: amount,
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

  const { feeUsdt, netUsdt } = splitFlashSwap(amount);
  if (netUsdt < MIN_WITHDRAW_USDT) {
    throw new HttpError(400, `Net payout after ${FLASH_SWAP_FEE_PCT}% fee is below minimum`);
  }

  const { data: withdrawal, error: wErr } = await sb
    .from('partner_yield_withdrawals')
    .insert({
      wallet_address: walletAddress,
      amount_usdt: amount,
      fee_usdt: feeUsdt,
      net_amount_usdt: netUsdt,
      status: 'pending',
    })
    .select('id')
    .single();
  if (wErr) throw wErr;

  const withdrawalId = withdrawal.id as string;
  const amountWei = parseUsdtAmount(netUsdt);

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

  await sb
    .from('partner_yield_withdrawals')
    .update({ sweep_job_id: job.id as string, updated_at: new Date().toISOString() })
    .eq('id', withdrawalId);

  await writeAuditLog(sb, {
    actorType: 'system',
    action: 'yield_withdraw_queued',
    entityType: 'partner_yield_withdrawals',
    entityId: withdrawalId,
    newValue: { walletAddress, amountUsdt: amount, feeUsdt, netUsdt, sweepJobId: job.id },
  });

  return {
    withdrawalId,
    amountUsdt: amount,
    feeUsdt,
    netAmountUsdt: netUsdt,
    status: 'pending',
  };
}

export function isYieldWithdrawDemoRequest(req: Request): boolean {
  return isDemoModeRequest(req);
}
