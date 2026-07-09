import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { mnemonicToAccount } from 'npm:viem@2/accounts';
import { writeAuditLog } from './audit.ts';
import {
  BSC_CHAIN_ID,
  BSC_CHAIN_NAME,
  BSC_USDT_CONTRACT,
  BSC_USDT_SYMBOL,
} from './tokens.ts';
import {
  createTurnkeyDepositsParentWallet,
  createTurnkeyWalletAccountsBatch,
  depositDerivationPath,
  devMnemonic,
  isTurnkeyConfigured,
  isTurnkeyConsensusError,
  type DerivedDepositAccount,
} from './turnkey.ts';

type Sb = SupabaseClient;

export const DEPOSITS_HD_LABEL = 'D3-Deposits';

export type DepositsHdParent = {
  id: string;
  turnkeyWalletId: string;
  address: string;
  provider: 'turnkey' | 'dev_hd';
};

async function registerDepositsHdParent(
  sb: Sb,
  input: {
    turnkeyWalletId: string;
    address: string;
    provider: 'turnkey' | 'dev_hd';
    derivationIndex?: number;
  },
): Promise<DepositsHdParent> {
  const { data, error } = await sb
    .from('wallet_accounts')
    .insert({
      wallet_address: null,
      batch_id: null,
      turnkey_wallet_id: input.turnkeyWalletId,
      turnkey_wallet_account_id: null,
      address: input.address,
      chain_id: BSC_CHAIN_ID,
      chain_name: BSC_CHAIN_NAME,
      token_symbol: BSC_USDT_SYMBOL,
      token_contract: BSC_USDT_CONTRACT,
      wallet_type: 'deposit_hd',
      status: 'active',
      metadata: {
        label: DEPOSITS_HD_LABEL,
        provider: input.provider,
        role: 'hd_parent',
        derivation_index: input.derivationIndex ?? 0,
        path: depositDerivationPath(input.derivationIndex ?? 0),
        architecture: 'hd_accounts',
      },
    })
    .select('id, turnkey_wallet_id, address, metadata')
    .single();

  if (error) throw error;

  await writeAuditLog(sb, {
    actorType: 'system',
    action: 'deposits_hd_wallet_registered',
    entityType: 'wallet_accounts',
    entityId: data.id as string,
    newValue: { turnkeyWalletId: input.turnkeyWalletId, address: input.address },
  });

  return {
    id: data.id as string,
    turnkeyWalletId: data.turnkey_wallet_id as string,
    address: data.address as string,
    provider: input.provider,
  };
}

export async function getDepositsHdParent(sb: Sb): Promise<DepositsHdParent | null> {
  const { data, error } = await sb
    .from('wallet_accounts')
    .select('id, turnkey_wallet_id, address, metadata')
    .eq('wallet_type', 'deposit_hd')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const meta = data.metadata as { provider?: string };
  return {
    id: data.id as string,
    turnkeyWalletId: data.turnkey_wallet_id as string,
    address: data.address as string,
    provider: meta.provider === 'dev_hd' ? 'dev_hd' : 'turnkey',
  };
}

/** Ensure single Turnkey HD parent wallet (Payment Orchestration model). */
export async function ensureDepositsHdWallet(sb: Sb): Promise<DepositsHdParent> {
  const existing = await getDepositsHdParent(sb);
  if (existing) return existing;

  const envWalletId = Deno.env.get('TURNKEY_DEPOSITS_WALLET_ID')?.trim();
  const envAddress = Deno.env.get('TURNKEY_DEPOSITS_WALLET_ADDRESS')?.trim();

  if (isTurnkeyConfigured() && envWalletId) {
    return registerDepositsHdParent(sb, {
      turnkeyWalletId: envWalletId,
      address: envAddress ?? envWalletId,
      provider: 'turnkey',
      derivationIndex: 0,
    });
  }

  if (isTurnkeyConfigured()) {
    try {
      const created = await createTurnkeyDepositsParentWallet(DEPOSITS_HD_LABEL);
      return registerDepositsHdParent(sb, {
        turnkeyWalletId: created.turnkeyWalletId,
        address: created.address,
        provider: 'turnkey',
        derivationIndex: 0,
      });
    } catch (e) {
      if (isTurnkeyConsensusError(e)) {
        throw new Error(
          'Deposits HD wallet auto-create blocked (CONSENSUS_NEEDED). Create "D3-Deposits" in Turnkey Dashboard, then set TURNKEY_DEPOSITS_WALLET_ID and TURNKEY_DEPOSITS_WALLET_ADDRESS secrets.',
        );
      }
      throw e;
    }
  }

  const mnemonic = devMnemonic();
  if (!mnemonic) {
    throw new Error(
      'Deposits HD wallet missing. Set TURNKEY_* or TREASURY_DEV_MNEMONIC.',
    );
  }

  const account = mnemonicToAccount(mnemonic, { addressIndex: 0 });
  return registerDepositsHdParent(sb, {
    turnkeyWalletId: 'dev-deposits-hd',
    address: account.address,
    provider: 'dev_hd',
    derivationIndex: 0,
  });
}

export async function nextDepositDerivationIndex(sb: Sb): Promise<number> {
  const { data, error } = await sb
    .from('wallet_accounts')
    .select('metadata')
    .eq('wallet_type', 'deposit');

  if (error) throw error;

  let max = -1;
  for (const row of data ?? []) {
    const idx = Number((row.metadata as { derivation_index?: number })?.derivation_index);
    if (Number.isFinite(idx) && idx > max) max = idx;
  }

  const parent = await getDepositsHdParent(sb);
  if (parent) {
    const { data: parentRow } = await sb
      .from('wallet_accounts')
      .select('metadata')
      .eq('id', parent.id)
      .maybeSingle();
    const parentIdx = Number(
      (parentRow?.metadata as { derivation_index?: number })?.derivation_index ?? 0,
    );
    return Math.max(max + 1, parentIdx + 1);
  }

  return Math.max(max + 1, 1);
}

function deriveDevHdAccounts(startIndex: number, count: number, parentWalletId: string): DerivedDepositAccount[] {
  const mnemonic = devMnemonic();
  if (!mnemonic) throw new Error('TREASURY_DEV_MNEMONIC required');

  const out: DerivedDepositAccount[] = [];
  for (let i = 0; i < count; i++) {
    const derivationIndex = startIndex + i;
    const account = mnemonicToAccount(mnemonic, { addressIndex: derivationIndex });
    out.push({
      address: account.address,
      derivationIndex,
      path: depositDerivationPath(derivationIndex),
      turnkeyWalletId: parentWalletId,
      provider: 'dev_hd',
    });
  }
  return out;
}

/** Derive N deposit addresses from the HD parent via createWalletAccounts (Turnkey) or dev mnemonic. */
export async function deriveDepositAccounts(
  sb: Sb,
  count: number,
): Promise<DerivedDepositAccount[]> {
  if (count <= 0) return [];

  const parent = await ensureDepositsHdWallet(sb);
  const startIndex = await nextDepositDerivationIndex(sb);

  if (isTurnkeyConfigured() && parent.provider === 'turnkey') {
    return createTurnkeyWalletAccountsBatch(parent.turnkeyWalletId, startIndex, count);
  }

  return deriveDevHdAccounts(startIndex, count, parent.turnkeyWalletId);
}
