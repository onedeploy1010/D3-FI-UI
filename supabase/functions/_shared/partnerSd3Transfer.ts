import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { writeAuditLog } from './audit.ts';
import { isPartnerDownlineOf } from './partnerPerformance.ts';
import { HttpError } from './wallet.ts';

type Sb = SupabaseClient;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export type PartnerSd3TransferResult = {
  transferId: string;
  fromWallet: string;
  toWallet: string;
  amountSd3: number;
  senderBalance: number;
  recipientBalance: number;
};

async function ensurePartnerAccount(sb: Sb, wallet: string) {
  const { data, error } = await sb
    .from('partner_accounts')
    .select('wallet_address, is_partner, sd3_balance')
    .eq('wallet_address', wallet)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Transfer sD3 from a partner to an umbrella downline member. */
export async function transferPartnerSd3(
  sb: Sb,
  fromWallet: string,
  toWallet: string,
  amountSd3: number,
): Promise<PartnerSd3TransferResult> {
  const amount = round4(amountSd3);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'amountSd3 must be positive');
  }

  const from = fromWallet.trim();
  const to = toWallet.trim();
  if (from.toLowerCase() === to.toLowerCase()) {
    throw new HttpError(400, 'Cannot transfer to yourself');
  }

  const sender = await ensurePartnerAccount(sb, from);
  if (!sender?.is_partner) {
    throw new HttpError(403, 'Partner account required');
  }

  const senderBalance = Number(sender.sd3_balance ?? 0);
  if (amount > senderBalance + 0.0001) {
    throw new HttpError(400, 'Insufficient sD3 balance');
  }

  const isDownline = await isPartnerDownlineOf(sb, from, to);
  if (!isDownline) {
    throw new HttpError(403, 'Recipient is not your downline member');
  }

  const { data: recipientProfile } = await sb
    .from('profiles')
    .select('wallet_address')
    .ilike('wallet_address', to)
    .maybeSingle();
  if (!recipientProfile) {
    throw new HttpError(404, 'Recipient profile not found');
  }
  const recipientWallet = recipientProfile.wallet_address as string;

  const { data: transfer, error: transferErr } = await sb
    .from('partner_sd3_transfers')
    .insert({
      from_wallet: from,
      to_wallet: recipientWallet,
      amount_sd3: amount,
      status: 'completed',
    })
    .select('id')
    .single();
  if (transferErr) throw transferErr;

  const nextSenderBalance = round4(Math.max(0, senderBalance - amount));
  const { error: debitErr } = await sb
    .from('partner_accounts')
    .update({ sd3_balance: nextSenderBalance, updated_at: new Date().toISOString() })
    .eq('wallet_address', from);
  if (debitErr) throw debitErr;

  const { data: recipientAcct } = await sb
    .from('partner_accounts')
    .select('sd3_balance, is_partner')
    .eq('wallet_address', recipientWallet)
    .maybeSingle();

  const recipientBalance = round4(Number(recipientAcct?.sd3_balance ?? 0) + amount);
  if (recipientAcct) {
    const { error: creditErr } = await sb
      .from('partner_accounts')
      .update({ sd3_balance: recipientBalance, updated_at: new Date().toISOString() })
      .eq('wallet_address', recipientWallet);
    if (creditErr) throw creditErr;
  } else {
    const { error: createErr } = await sb.from('partner_accounts').insert({
      wallet_address: recipientWallet,
      is_partner: false,
      sd3_balance: recipientBalance,
    });
    if (createErr) throw createErr;
  }

  await writeAuditLog(sb, {
    actorType: 'user',
    action: 'partner_sd3_transfer',
    entityType: 'partner_sd3_transfers',
    entityId: transfer.id as string,
    newValue: { fromWallet: from, toWallet: recipientWallet, amountSd3: amount },
  });

  return {
    transferId: transfer.id as string,
    fromWallet: from,
    toWallet: recipientWallet,
    amountSd3: amount,
    senderBalance: nextSenderBalance,
    recipientBalance,
  };
}
