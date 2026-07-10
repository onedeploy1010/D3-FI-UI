import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { writeAuditLog } from './audit.ts';
import {
  BSC_CHAIN_ID,
  BSC_CHAIN_NAME,
  BSC_USDT_CONTRACT,
  BSC_USDT_SYMBOL,
} from './tokens.ts';
import {
  createManagedWallet,
  flashSwapWalletFromEnv,
  gasWalletFromEnv,
  isTurnkeyConsensusError,
  settlementWalletCount,
  settlementWalletsFromEnv,
  treasuryAddressFromEnv,
  treasuryWalletIdFromEnv,
} from './turnkey.ts';
import { getDepositPoolStats } from './depositPool.ts';

type Sb = SupabaseClient;

export type WalletRow = {
  id: string;
  address: string;
  wallet_type: string;
  status: string;
  turnkey_wallet_id: string;
  metadata: Record<string, unknown> | null;
};

async function nextWalletIndex(sb: Sb): Promise<number> {
  const { count } = await sb.from('wallet_accounts').select('id', { count: 'exact', head: true });
  return count ?? 0;
}

async function insertWalletAccount(
  sb: Sb,
  input: {
    walletType: 'deposit' | 'settlement' | 'treasury' | 'gas' | 'flash_swap';
    label: string;
    status: 'available' | 'active' | 'assigned';
    turnkeyWalletId: string;
    address: string;
    metadata: Record<string, unknown>;
    turnkeyWalletAccountId?: string | null;
  },
): Promise<WalletRow> {
  const { data, error } = await sb
    .from('wallet_accounts')
    .insert({
      wallet_address: null,
      batch_id: null,
      turnkey_wallet_id: input.turnkeyWalletId,
      turnkey_wallet_account_id: input.turnkeyWalletAccountId ?? null,
      address: input.address,
      chain_id: BSC_CHAIN_ID,
      chain_name: BSC_CHAIN_NAME,
      token_symbol: BSC_USDT_SYMBOL,
      token_contract: BSC_USDT_CONTRACT,
      wallet_type: input.walletType,
      status: input.status,
      assigned_at: input.status === 'assigned' ? new Date().toISOString() : null,
      metadata: input.metadata,
    })
    .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
    .single();

  if (error) throw error;

  await writeAuditLog(sb, {
    actorType: 'system',
    action: 'wallet_account_registered',
    entityType: 'wallet_accounts',
    entityId: data.id as string,
    newValue: { walletType: input.walletType, address: input.address, label: input.label },
  });

  return data as WalletRow;
}

async function createAndRegisterWallet(
  sb: Sb,
  walletType: 'settlement' | 'gas' | 'flash_swap',
  label: string,
  status: 'available' | 'active',
): Promise<WalletRow> {
  const index = await nextWalletIndex(sb);
  const created = await createManagedWallet(index, label);
  return insertWalletAccount(sb, {
    walletType,
    label,
    status,
    turnkeyWalletId: created.turnkeyWalletId,
    address: created.address,
    metadata: {
      provider: created.provider,
      ...(created.hdIndex !== undefined ? { hd_index: created.hdIndex } : {}),
      label,
    },
  });
}

async function registerExternalWallet(
  sb: Sb,
  walletType: 'settlement' | 'gas' | 'treasury' | 'flash_swap',
  address: string,
  turnkeyWalletId: string | undefined,
  label: string,
): Promise<WalletRow> {
  const { data: existing } = await sb
    .from('wallet_accounts')
    .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
    .eq('wallet_type', walletType)
    .ilike('address', address)
    .maybeSingle();

  if (existing) return existing as WalletRow;

  return insertWalletAccount(sb, {
    walletType,
    label,
    status: 'active',
    turnkeyWalletId: turnkeyWalletId ?? `${walletType}-ext-${address.slice(0, 10)}`,
    address,
    metadata: { provider: turnkeyWalletId ? 'turnkey' : 'external', label },
  });
}

const CONSENSUS_HELP =
  'Turnkey Policy blocked automatic wallet creation (CONSENSUS_NEEDED). Create wallets in Turnkey Dashboard, then set secrets: TURNKEY_SETTLEMENT_ADDRESSES, TURNKEY_SETTLEMENT_WALLET_IDS, TURNKEY_GAS_WALLET_ADDRESS, TURNKEY_GAS_WALLET_ID. Or add a Policy allowing your backend API user to create wallets.';

/** Ensure settlement pool, gas wallet, flash-swap wallet, and treasury registry exist. */
export async function ensureInfrastructureWallets(sb: Sb): Promise<{
  settlementCount: number;
  gasWallet: WalletRow | null;
  flashSwapWallet: WalletRow | null;
  treasuryWallet: WalletRow | null;
  created: string[];
  warnings: string[];
}> {
  const created: string[] = [];
  const warnings: string[] = [];
  const target = settlementWalletCount();

  const { data: existingSettlement } = await sb
    .from('wallet_accounts')
    .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
    .eq('wallet_type', 'settlement')
    .in('status', ['active', 'available']);

  let settlementRows = (existingSettlement ?? []) as WalletRow[];

  for (const [i, item] of settlementWalletsFromEnv().entries()) {
    const exists = settlementRows.some(
      (r) => r.address.toLowerCase() === item.address.toLowerCase(),
    );
    if (exists) continue;
    const row = await registerExternalWallet(
      sb,
      'settlement',
      item.address,
      item.walletId,
      `D3-Settlement-${i + 1}`,
    );
    settlementRows = [...settlementRows, row];
    created.push(`settlement:${row.address}`);
  }

  while (settlementRows.length < target) {
    const n = settlementRows.length + 1;
    try {
      const row = await createAndRegisterWallet(sb, 'settlement', `D3-Settlement-${n}`, 'active');
      settlementRows = [...settlementRows, row];
      created.push(`settlement:${row.address}`);
    } catch (e) {
      if (isTurnkeyConsensusError(e)) {
        warnings.push(CONSENSUS_HELP);
        break;
      }
      throw e;
    }
  }

  let gasWallet: WalletRow | null = null;
  const { data: gasRows } = await sb
    .from('wallet_accounts')
    .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
    .eq('wallet_type', 'gas')
    .in('status', ['active', 'available'])
    .limit(1);

  if (gasRows && gasRows.length > 0) {
    gasWallet = gasRows[0] as WalletRow;
  } else {
    const envGas = gasWalletFromEnv();
    if (envGas) {
      gasWallet = await registerExternalWallet(sb, 'gas', envGas.address, envGas.walletId, 'D3-Gas');
      created.push(`gas:${gasWallet.address}`);
    } else {
      try {
        gasWallet = await createAndRegisterWallet(sb, 'gas', 'D3-Gas', 'active');
        created.push(`gas:${gasWallet.address}`);
      } catch (e) {
        if (isTurnkeyConsensusError(e)) {
          warnings.push(CONSENSUS_HELP);
        } else {
          throw e;
        }
      }
    }
  }

  let flashSwapWallet: WalletRow | null = null;
  const { data: flashRows } = await sb
    .from('wallet_accounts')
    .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
    .eq('wallet_type', 'flash_swap')
    .in('status', ['active', 'available'])
    .limit(1);

  if (flashRows && flashRows.length > 0) {
    flashSwapWallet = flashRows[0] as WalletRow;
  } else {
    const envFlash = flashSwapWalletFromEnv();
    if (envFlash) {
      flashSwapWallet = await registerExternalWallet(
        sb,
        'flash_swap',
        envFlash.address,
        envFlash.walletId,
        'D3-FlashSwap',
      );
      created.push(`flash_swap:${flashSwapWallet.address}`);
    } else {
      try {
        flashSwapWallet = await createAndRegisterWallet(sb, 'flash_swap', 'D3-FlashSwap', 'active');
        created.push(`flash_swap:${flashSwapWallet.address}`);
      } catch (e) {
        if (isTurnkeyConsensusError(e)) {
          warnings.push(
            `${CONSENSUS_HELP} Or set TURNKEY_FLASH_SWAP_WALLET_ADDRESS / TURNKEY_FLASH_SWAP_WALLET_ID.`,
          );
        } else {
          throw e;
        }
      }
    }
  }

  let treasuryWallet: WalletRow | null = null;
  const treasuryAddress = treasuryAddressFromEnv();
  const treasuryWalletId = treasuryWalletIdFromEnv();
  if (treasuryAddress) {
    const { data: existingTreasury } = await sb
      .from('wallet_accounts')
      .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
      .eq('wallet_type', 'treasury')
      .ilike('address', treasuryAddress)
      .maybeSingle();

    if (existingTreasury) {
      treasuryWallet = existingTreasury as WalletRow;
      if (treasuryWalletId && existingTreasury.turnkey_wallet_id !== treasuryWalletId) {
        const { data: updated } = await sb
          .from('wallet_accounts')
          .update({
            turnkey_wallet_id: treasuryWalletId,
            metadata: {
              ...((existingTreasury.metadata as Record<string, unknown>) ?? {}),
              provider: 'turnkey',
              label: 'D3-Treasury',
              multisig: true,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingTreasury.id)
          .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
          .single();
        if (updated) treasuryWallet = updated as WalletRow;
      }
    } else {
      const { data, error } = await sb
        .from('wallet_accounts')
        .insert({
          wallet_address: null,
          batch_id: null,
          turnkey_wallet_id: treasuryWalletId ?? `treasury-ext-${treasuryAddress.slice(0, 10)}`,
          address: treasuryAddress,
          chain_id: BSC_CHAIN_ID,
          chain_name: BSC_CHAIN_NAME,
          token_symbol: BSC_USDT_SYMBOL,
          token_contract: BSC_USDT_CONTRACT,
          wallet_type: 'treasury',
          status: 'active',
          metadata: {
            provider: treasuryWalletId ? 'turnkey' : 'external',
            label: 'D3-Treasury',
            multisig: true,
          },
        })
        .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
        .single();
      if (error) throw error;
      treasuryWallet = data as WalletRow;
      created.push(`treasury:${treasuryAddress}`);
    }
  }

  return {
    settlementCount: settlementRows.length,
    gasWallet,
    flashSwapWallet,
    treasuryWallet,
    created,
    warnings,
  };
}

/** Pick settlement wallet with fewest queued/recent deposit sweeps. */
export async function pickSettlementWallet(sb: Sb): Promise<WalletRow> {
  const { data: settlements } = await sb
    .from('wallet_accounts')
    .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
    .eq('wallet_type', 'settlement')
    .eq('status', 'active');

  if (!settlements || settlements.length === 0) {
    const boot = await ensureInfrastructureWallets(sb);
    if (!boot.settlementCount) throw new Error('No settlement wallets available');
    return pickSettlementWallet(sb);
  }

  const rows = settlements as WalletRow[];
  let best = rows[0]!;
  let bestCount = Number.MAX_SAFE_INTEGER;

  for (const row of rows) {
    const { count } = await sb
      .from('sweep_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('to_wallet_id', row.id)
      .eq('job_type', 'deposit_to_settlement');
    const c = count ?? 0;
    if (c < bestCount) {
      bestCount = c;
      best = row;
    }
  }

  return best;
}

export async function getGasWallet(sb: Sb): Promise<WalletRow | null> {
  const { data } = await sb
    .from('wallet_accounts')
    .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
    .eq('wallet_type', 'gas')
    .in('status', ['active', 'available'])
    .limit(1)
    .maybeSingle();
  return (data as WalletRow | null) ?? null;
}

export async function getFlashSwapWallet(sb: Sb): Promise<WalletRow | null> {
  const { data } = await sb
    .from('wallet_accounts')
    .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
    .eq('wallet_type', 'flash_swap')
    .in('status', ['active', 'available'])
    .limit(1)
    .maybeSingle();
  return (data as WalletRow | null) ?? null;
}

export async function getTreasuryWallet(sb: Sb): Promise<WalletRow | null> {
  const { data } = await sb
    .from('wallet_accounts')
    .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
    .eq('wallet_type', 'treasury')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return (data as WalletRow | null) ?? null;
}

export async function getWalletById(sb: Sb, id: string): Promise<WalletRow | null> {
  const { data } = await sb
    .from('wallet_accounts')
    .select('id, address, wallet_type, status, turnkey_wallet_id, metadata')
    .eq('id', id)
    .maybeSingle();
  return (data as WalletRow | null) ?? null;
}

export async function getInfrastructureSummary(sb: Sb) {
  const depositPool = await getDepositPoolStats(sb).catch(() => null);
  const { data: wallets } = await sb
    .from('wallet_accounts')
    .select('wallet_type, status')
    .in('wallet_type', ['deposit', 'deposit_hd', 'settlement', 'treasury', 'gas', 'flash_swap']);

  const counts: Record<string, number> = {};
  for (const w of wallets ?? []) {
    const key = `${w.wallet_type}:${w.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const { count: queuedSweeps } = await sb
    .from('sweep_jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'signing', 'broadcasted']);

  const { count: creditedDeposits } = await sb
    .from('deposit_records')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'credited');

  return {
    walletCounts: counts,
    queuedSweeps: queuedSweeps ?? 0,
    creditedDeposits: creditedDeposits ?? 0,
    depositPool,
  };
}
