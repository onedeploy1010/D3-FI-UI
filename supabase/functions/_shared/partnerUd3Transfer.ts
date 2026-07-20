import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { writeAuditLog } from './audit.ts';
import { isPartnerDownlineOf } from './partnerPerformance.ts';
import { notify, shortWalletForNotice } from './notifications.ts';
import { HttpError } from './wallet.ts';

type Sb = SupabaseClient;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export type PartnerUd3TransferResult = {
  transferId: string;
  fromWallet: string;
  toWallet: string;
  amountUd3: number;
  senderBalance: number;
  recipientBalance: number;
};

async function ensurePartnerAccount(sb: Sb, wallet: string) {
  const { data, error } = await sb
    .from('partner_accounts')
    .select('wallet_address, is_partner, ud3_balance')
    .eq('wallet_address', wallet)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Transfer UD3 (referral reward) from a partner to an umbrella downline member. */
export async function transferPartnerUd3(
  sb: Sb,
  fromWallet: string,
  toWallet: string,
  amountUd3: number,
): Promise<PartnerUd3TransferResult> {
  const amount = round4(amountUd3);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'amountUd3 must be positive');
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

  const senderBalance = Number(sender.ud3_balance ?? 0);
  if (amount > senderBalance + 0.0001) {
    throw new HttpError(400, 'Insufficient UD3 balance');
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

  // Ensure the recipient has a partner_accounts row so the atomic transfer can
  // credit it (preserves the prior auto-provision behaviour). transfer_ud3 raises
  // RECIPIENT_NOT_FOUND when the row is absent.
  const { data: recipientAcct } = await sb
    .from('partner_accounts')
    .select('wallet_address')
    .eq('wallet_address', recipientWallet)
    .maybeSingle();
  if (!recipientAcct) {
    const { error: createErr } = await sb.from('partner_accounts').insert({
      wallet_address: recipientWallet,
      is_partner: false,
      ud3_balance: 0,
    });
    if (createErr) throw createErr;
  }

  // V-06: atomic debit sender + credit recipient in a single DB transaction.
  const { data: newSenderBalance, error: transferErr } = await sb.rpc('transfer_ud3', {
    p_from: from,
    p_to: recipientWallet,
    p_amount: amount,
  });
  if (transferErr) {
    const msg = transferErr.message ?? '';
    if (msg.includes('INSUFFICIENT_BALANCE')) throw new HttpError(400, 'Insufficient balance');
    if (msg.includes('RECIPIENT_NOT_FOUND')) throw new HttpError(404, 'Recipient not found');
    throw transferErr;
  }

  const nextSenderBalance = round4(Number(newSenderBalance ?? Math.max(0, senderBalance - amount)));

  // Record the transfer + audit AFTER the balance move has committed.
  const { data: transfer, error: insErr } = await sb
    .from('partner_ud3_transfers')
    .insert({
      from_wallet: from,
      to_wallet: recipientWallet,
      amount_ud3: amount,
      status: 'completed',
    })
    .select('id')
    .single();
  if (insErr) throw insErr;

  const { data: recipientAfter } = await sb
    .from('partner_accounts')
    .select('ud3_balance')
    .eq('wallet_address', recipientWallet)
    .maybeSingle();
  const recipientBalance = round4(Number(recipientAfter?.ud3_balance ?? 0));

  await writeAuditLog(sb, {
    actorType: 'user',
    action: 'partner_sd3_transfer',
    entityType: 'partner_ud3_transfers',
    entityId: transfer.id as string,
    newValue: { fromWallet: from, toWallet: recipientWallet, amountUd3: amount },
  });

  // 小铃铛：转账方「转账成功」+ 收款方「收到 UD3」。best-effort，DB 模板多语言渲染。
  const amtStr = amount.toLocaleString();
  await notify(sb, from, 'ud3_transfer_sent', { amount: amtStr, to: shortWalletForNotice(recipientWallet) });
  await notify(sb, recipientWallet, 'ud3_received', { amount: amtStr, from: shortWalletForNotice(from) });

  return {
    transferId: transfer.id as string,
    fromWallet: from,
    toWallet: recipientWallet,
    amountUd3: amount,
    senderBalance: nextSenderBalance,
    recipientBalance,
  };
}
