import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { writeAuditLog } from './audit.ts';
import { HttpError } from './wallet.ts';
import { getD3PriceUsdt, usdtToD3 } from './d3Price.ts';

type Sb = SupabaseClient;

const DAILY_YIELD_PCT = 0.4;
const DAILY_YIELD_RATE = DAILY_YIELD_PCT / 100;
const STAKE_LOCK_DAYS = 540;
const UD3_STAKE_STEP = 100;
/** UD3 re-stake exits at 2x principal (USDT stake exits at 6x). */
const UD3_EXIT_MULTIPLIER = 2;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export type PartnerUd3StakeResult = {
  positionId: string;
  amountUd3: number;
  ud3Balance: number;
  unlockAt: string;
};

/**
 * Re-stake UD3 (referral reward) into a 540-day / 2x-exit order.
 * UD3 is pegged 1 UD3 = 1 USDT, so principal_usdt = amountUd3. The position then
 * releases D3 daily (principal x 0.4% / d3Price) like any other stake. Re-staking
 * UD3 does NOT create new UD3 reward volume.
 */
export async function stakePartnerSd3(
  sb: Sb,
  walletAddress: string,
  amountUd3: number,
): Promise<PartnerUd3StakeResult> {
  const amount = round4(amountUd3);
  if (!Number.isFinite(amount) || amount < UD3_STAKE_STEP) {
    throw new HttpError(400, 'amount must be at least 100');
  }
  if (Math.abs(amount % UD3_STAKE_STEP) > 1e-9) {
    throw new HttpError(400, 'amount must be a multiple of 100');
  }

  const wallet = walletAddress.trim();
  const { data: acct, error } = await sb
    .from('partner_accounts')
    .select('wallet_address, is_partner, ud3_balance')
    .eq('wallet_address', wallet)
    .maybeSingle();
  if (error) throw error;
  if (!acct?.is_partner) {
    throw new HttpError(403, 'Partner account required');
  }

  const balance = Number(acct.ud3_balance ?? 0);
  if (amount > balance + 0.0001) {
    // Advisory fast-path only; debit_ud3_balance below is the authoritative guard.
    throw new HttpError(400, 'Insufficient UD3 balance');
  }

  const startedAt = new Date().toISOString();
  const unlockAt = new Date(Date.now() + STAKE_LOCK_DAYS * 86400000).toISOString();
  const dailyYield = round4(amount * DAILY_YIELD_RATE);

  // D3-denominated fields (price locked at stake time). 1 UD3 = 1 USDT.
  const d3Price = await getD3PriceUsdt(sb);
  const stakedD3 = usdtToD3(amount, d3Price);
  const dailyReleaseD3 = usdtToD3(dailyYield, d3Price);
  const exitCapD3 = round6(stakedD3 * UD3_EXIT_MULTIPLIER);

  // V-06 / NEW-1 ordering decision: an atomic credit_ud3_balance RPC now exists (041),
  // but we deliberately do NOT use a debit-then-insert-then-credit-back rollback here.
  // The status check constraint only permits 'active'/'closed' (no 'pending' state on
  // this table), so we INSERT the position FIRST, then debit UD3 atomically via the RPC.
  // If the debit fails we DELETE the just-created position (no balance moved, no
  // double-spend). Crediting back after a failed insert would instead open a window
  // where the user is debited with no backing position. This intentionally biases any
  // residual crash-window risk toward a protocol-side, un-debited position that is
  // detectable/reconcilable — never toward a user-side debit with no backing
  // position (which would be a silent user-fund loss). The RPC's conditional
  // UPDATE is the authoritative single-debit guard.
  const { data: position, error: posErr } = await sb
    .from('partner_stake_positions')
    .insert({
      wallet_address: wallet,
      intent_id: null,
      kind: 'ud3',
      principal_usdt: amount,
      daily_yield_usdt: dailyYield,
      started_at: startedAt,
      unlock_at: unlockAt,
      status: 'active',
      exit_multiplier: UD3_EXIT_MULTIPLIER,
      staked_d3: stakedD3,
      d3_price_at_stake: d3Price,
      daily_release_d3: dailyReleaseD3,
      released_d3: 0,
      exit_cap_d3: exitCapD3,
    })
    .select('id, unlock_at')
    .single();
  if (posErr) throw posErr;
  const positionId = position.id as string;

  const { data: newBalance, error: debitErr } = await sb.rpc('debit_ud3_balance', {
    p_wallet: wallet,
    p_amount: amount,
  });
  if (debitErr) {
    // Roll back the placeholder position; no balance was moved.
    await sb.from('partner_stake_positions').delete().eq('id', positionId);
    if ((debitErr.message ?? '').includes('INSUFFICIENT_BALANCE')) {
      throw new HttpError(400, 'Insufficient balance');
    }
    throw debitErr;
  }

  const nextBalance = round4(Number(newBalance ?? Math.max(0, balance - amount)));

  await writeAuditLog(sb, {
    actorType: 'system',
    actorId: wallet,
    action: 'partner_ud3_stake',
    entityType: 'partner_stake_positions',
    entityId: positionId,
    newValue: { amountUd3: amount, exitMultiplier: UD3_EXIT_MULTIPLIER },
  });

  return {
    positionId,
    amountUd3: amount,
    ud3Balance: nextBalance,
    unlockAt: (position.unlock_at as string) ?? unlockAt,
  };
}
