import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { writeAuditLog } from './audit.ts';
import { HttpError } from './wallet.ts';

type Sb = SupabaseClient;

const DAILY_YIELD_PCT = 0.4;
const DAILY_YIELD_RATE = DAILY_YIELD_PCT / 100;
const STAKE_LOCK_DAYS = 540;
const SD3_STAKE_STEP = 100;
const SD3_EXIT_MULTIPLIER = 2;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export type PartnerSd3StakeResult = {
  positionId: string;
  amountSd3: number;
  sd3Balance: number;
  unlockAt: string;
};

/** Stake settled UD3 into a 540-day / 2×-exit order. Does not create bribe/UD3 reward volume. */
export async function stakePartnerSd3(
  sb: Sb,
  walletAddress: string,
  amountSd3: number,
): Promise<PartnerSd3StakeResult> {
  const amount = round4(amountSd3);
  if (!Number.isFinite(amount) || amount < SD3_STAKE_STEP) {
    throw new HttpError(400, 'amountSd3 must be at least 100');
  }
  if (Math.abs(amount % SD3_STAKE_STEP) > 1e-9) {
    throw new HttpError(400, 'amountSd3 must be a multiple of 100');
  }

  const wallet = walletAddress.trim();
  const { data: acct, error } = await sb
    .from('partner_accounts')
    .select('wallet_address, is_partner, sd3_balance')
    .eq('wallet_address', wallet)
    .maybeSingle();
  if (error) throw error;
  if (!acct?.is_partner) {
    throw new HttpError(403, 'Partner account required');
  }

  const balance = Number(acct.sd3_balance ?? 0);
  if (amount > balance + 0.0001) {
    throw new HttpError(400, 'Insufficient settled UD3');
  }

  const nextBalance = round4(balance - amount);
  const startedAt = new Date().toISOString();
  const unlockAt = new Date(Date.now() + STAKE_LOCK_DAYS * 86400000).toISOString();
  const dailyYield = round4(amount * DAILY_YIELD_RATE);

  const { data: position, error: posErr } = await sb
    .from('partner_stake_positions')
    .insert({
      wallet_address: wallet,
      intent_id: null,
      kind: 'sd3',
      principal_usdt: amount,
      daily_yield_usdt: dailyYield,
      started_at: startedAt,
      unlock_at: unlockAt,
      status: 'active',
      exit_multiplier: SD3_EXIT_MULTIPLIER,
    })
    .select('id, unlock_at')
    .single();
  if (posErr) throw posErr;

  const { error: balErr } = await sb
    .from('partner_accounts')
    .update({ sd3_balance: nextBalance, updated_at: new Date().toISOString() })
    .eq('wallet_address', wallet);
  if (balErr) throw balErr;

  await writeAuditLog(sb, {
    actorType: 'system',
    actorId: wallet,
    action: 'partner_sd3_stake',
    entityType: 'partner_stake_positions',
    entityId: position.id as string,
    newValue: { amountSd3: amount, exitMultiplier: SD3_EXIT_MULTIPLIER },
  });

  return {
    positionId: position.id as string,
    amountSd3: amount,
    sd3Balance: nextBalance,
    unlockAt: (position.unlock_at as string) ?? unlockAt,
  };
}
