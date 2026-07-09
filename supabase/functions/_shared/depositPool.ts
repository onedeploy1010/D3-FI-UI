import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { writeAuditLog } from './audit.ts';
import {
  deriveDepositAccounts,
  ensureDepositsHdWallet,
  getDepositsHdParent,
} from './depositsHd.ts';
import {
  BSC_CHAIN_ID,
  BSC_CHAIN_NAME,
  BSC_USDT_CONTRACT,
  BSC_USDT_SYMBOL,
} from './tokens.ts';
import type { DerivedDepositAccount } from './turnkey.ts';

type Sb = SupabaseClient;

export function depositPoolTargetSize(): number {
  const raw = Deno.env.get('DEPOSIT_POOL_TARGET_SIZE');
  const n = raw ? Number(raw) : 50;
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 500) : 50;
}

export function depositPoolMinAvailable(): number {
  const raw = Deno.env.get('DEPOSIT_POOL_MIN_AVAILABLE');
  const n = raw ? Number(raw) : 10;
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 100) : 10;
}

export function depositPoolBatchSize(): number {
  const raw = Deno.env.get('DEPOSIT_POOL_BATCH_SIZE');
  const n = raw ? Number(raw) : 10;
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 25) : 10;
}

async function countAvailableDepositWallets(sb: Sb): Promise<number> {
  const { count } = await sb
    .from('wallet_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_type', 'deposit')
    .eq('status', 'available');
  return count ?? 0;
}

async function registerPoolAccount(
  sb: Sb,
  account: DerivedDepositAccount,
): Promise<{ id: string; address: string }> {
  const label = `D3-Deposit-${String(account.derivationIndex).padStart(4, '0')}`;
  const { data, error } = await sb
    .from('wallet_accounts')
    .insert({
      wallet_address: null,
      batch_id: null,
      turnkey_wallet_id: account.turnkeyWalletId,
      turnkey_wallet_account_id: account.address,
      address: account.address,
      chain_id: BSC_CHAIN_ID,
      chain_name: BSC_CHAIN_NAME,
      token_symbol: BSC_USDT_SYMBOL,
      token_contract: BSC_USDT_CONTRACT,
      wallet_type: 'deposit',
      status: 'available',
      metadata: {
        provider: account.provider,
        pool: true,
        architecture: 'hd_accounts',
        derivation_index: account.derivationIndex,
        path: account.path,
        label,
      },
    })
    .select('id, address')
    .single();

  if (error) throw error;

  await writeAuditLog(sb, {
    actorType: 'system',
    action: 'deposit_pool_account_derived',
    entityType: 'wallet_accounts',
    entityId: data.id as string,
    newValue: { address: data.address, derivationIndex: account.derivationIndex, label },
  });

  return { id: data.id as string, address: data.address as string };
}

/** Pre-derive deposit addresses via Turnkey createWalletAccounts (HD parent wallet). */
export async function replenishDepositPool(
  sb: Sb,
  opts: { target?: number; batchSize?: number } = {},
): Promise<{
  target: number;
  availableBefore: number;
  available: number;
  created: number;
  addresses: string[];
  depositsHdWalletId: string | null;
  architecture: string;
}> {
  await ensureDepositsHdWallet(sb);
  const parent = await getDepositsHdParent(sb);

  const target = opts.target ?? depositPoolTargetSize();
  const batchSize = opts.batchSize ?? depositPoolBatchSize();
  const availableBefore = await countAvailableDepositWallets(sb);
  const need = target - availableBefore;

  if (need <= 0) {
    return {
      target,
      availableBefore,
      available: availableBefore,
      created: 0,
      addresses: [],
      depositsHdWalletId: parent?.turnkeyWalletId ?? null,
      architecture: 'hd_accounts',
    };
  }

  const toCreate = Math.min(need, batchSize);
  const derived = await deriveDepositAccounts(sb, toCreate);
  const addresses: string[] = [];

  for (const account of derived) {
    const row = await registerPoolAccount(sb, account);
    addresses.push(row.address);
  }

  const available = availableBefore + addresses.length;
  return {
    target,
    availableBefore,
    available,
    created: addresses.length,
    addresses,
    depositsHdWalletId: parent?.turnkeyWalletId ?? null,
    architecture: 'hd_accounts',
  };
}

export async function replenishDepositPoolIfLow(sb: Sb): Promise<void> {
  const available = await countAvailableDepositWallets(sb);
  const min = depositPoolMinAvailable();
  if (available >= min) return;
  await replenishDepositPool(sb);
}

export async function getDepositPoolStats(sb: Sb) {
  const target = depositPoolTargetSize();
  const minAvailable = depositPoolMinAvailable();
  const available = await countAvailableDepositWallets(sb);
  const parent = await getDepositsHdParent(sb);

  const { count: assigned } = await sb
    .from('wallet_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_type', 'deposit')
    .eq('status', 'assigned');

  const { count: settled } = await sb
    .from('wallet_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_type', 'deposit')
    .in('status', ['settled', 'sweeping', 'archived']);

  return {
    architecture: 'hd_accounts',
    depositsHdWalletId: parent?.turnkeyWalletId ?? null,
    depositsHdAddress: parent?.address ?? null,
    target,
    minAvailable,
    available,
    assigned: assigned ?? 0,
    settled: settled ?? 0,
    needsReplenish: available < minAvailable,
  };
}

/** Claim oldest available deposit wallet from pool; returns null if pool empty. */
export async function claimDepositWalletFromPool(
  sb: Sb,
  walletAddress: string,
  batchId: string,
): Promise<{ walletId: string; address: string } | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: candidate, error: selErr } = await sb
      .from('wallet_accounts')
      .select('id, address')
      .eq('wallet_type', 'deposit')
      .eq('status', 'available')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (selErr) throw selErr;
    if (!candidate) return null;

    const now = new Date().toISOString();
    const { data: claimed, error: updErr } = await sb
      .from('wallet_accounts')
      .update({
        wallet_address: walletAddress,
        batch_id: batchId,
        status: 'assigned',
        assigned_at: now,
        updated_at: now,
      })
      .eq('id', candidate.id)
      .eq('status', 'available')
      .select('id, address')
      .maybeSingle();

    if (updErr) throw updErr;
    if (!claimed) continue;

    await writeAuditLog(sb, {
      actorType: 'system',
      action: 'deposit_wallet_claimed_from_pool',
      entityType: 'wallet_accounts',
      entityId: claimed.id as string,
      newValue: { walletAddress, batchId, address: claimed.address },
    });

    return { walletId: claimed.id as string, address: claimed.address as string };
  }

  return null;
}

/** Fallback: derive one account on demand when pool is empty. */
export async function createOnDemandDepositWallet(
  sb: Sb,
  walletAddress: string,
  batchId: string,
  _label: string,
): Promise<{ walletId: string; address: string }> {
  const [account] = await deriveDepositAccounts(sb, 1);
  if (!account) throw new Error('Failed to derive deposit account');

  const { data, error } = await sb
    .from('wallet_accounts')
    .insert({
      wallet_address: walletAddress,
      batch_id: batchId,
      turnkey_wallet_id: account.turnkeyWalletId,
      turnkey_wallet_account_id: account.address,
      address: account.address,
      chain_id: BSC_CHAIN_ID,
      chain_name: BSC_CHAIN_NAME,
      token_symbol: BSC_USDT_SYMBOL,
      token_contract: BSC_USDT_CONTRACT,
      wallet_type: 'deposit',
      status: 'assigned',
      assigned_at: new Date().toISOString(),
      metadata: {
        provider: account.provider,
        pool: false,
        on_demand: true,
        architecture: 'hd_accounts',
        derivation_index: account.derivationIndex,
        path: account.path,
        label: `D3-Deposit-${String(account.derivationIndex).padStart(4, '0')}`,
      },
    })
    .select('id, address')
    .single();

  if (error) throw error;

  await writeAuditLog(sb, {
    actorType: 'system',
    action: 'deposit_wallet_derived_on_demand',
    entityType: 'wallet_accounts',
    entityId: data.id as string,
    newValue: { walletAddress, batchId, address: data.address },
  });

  return { walletId: data.id as string, address: data.address as string };
}
