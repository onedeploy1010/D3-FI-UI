import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { writeAuditLog } from './audit.ts';

type LedgerInput = {
  ledgerType: 'deposit_credit' | 'sweep_to_settlement' | 'settlement_to_treasury' | 'adjustment' | 'refund';
  walletAddress?: string | null;
  batchId?: string | null;
  walletId?: string | null;
  chainId: number;
  tokenSymbol: string;
  amount: string;
  direction: 'debit' | 'credit';
  txHash?: string | null;
  referenceId?: string | null;
};

export async function postLedgerEntry(sb: SupabaseClient, input: LedgerInput) {
  const { data, error } = await sb
    .from('treasury_ledger')
    .insert({
      ledger_type: input.ledgerType,
      wallet_address: input.walletAddress ?? null,
      batch_id: input.batchId ?? null,
      wallet_id: input.walletId ?? null,
      chain_id: input.chainId,
      token_symbol: input.tokenSymbol,
      amount: input.amount,
      direction: input.direction,
      tx_hash: input.txHash ?? null,
      reference_id: input.referenceId ?? null,
      status: 'posted',
    })
    .select('id')
    .single();
  if (error) throw error;

  await writeAuditLog(sb, {
    actorType: 'system',
    action: 'ledger_post',
    entityType: 'treasury_ledger',
    entityId: data.id,
    newValue: input,
  });

  return data.id as string;
}
