import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { formatUnits } from 'npm:viem@2';
import { getBscPublicClient } from './turnkey.ts';
import { BSC_USDT_CONTRACT, BSC_USDT_DECIMALS } from './tokens.ts';

type Sb = SupabaseClient;

const erc20BalanceAbi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export type InfraWalletBalance = {
  walletType: string;
  label: string | null;
  address: string;
  status: string;
  bnb: number;
  usdt: number;
};

/**
 * Read on-chain balances (native BNB + settlement USDT) for the operational
 * Turnkey wallets shown in the admin fund-management view: gas, treasury,
 * flash-swap and every settlement wallet. Deposit wallets are summarised by
 * count elsewhere (there are hundreds). Read-only — no signing, so this works
 * regardless of the Turnkey signing quota.
 */
export async function getInfraWalletBalances(sb: Sb): Promise<{
  wallets: InfraWalletBalance[];
  depositCount: number;
  usdtContract: string;
}> {
  const { data: rows } = await sb
    .from('wallet_accounts')
    .select('wallet_type, address, status, metadata')
    .in('wallet_type', ['gas', 'treasury', 'flash_swap', 'settlement'])
    .order('wallet_type', { ascending: true });

  const { count: depositCount } = await sb
    .from('wallet_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_type', 'deposit');

  const client = getBscPublicClient();
  const wallets: InfraWalletBalance[] = await Promise.all(
    (rows ?? []).map(async (w) => {
      const address = w.address as string;
      let bnb = 0;
      let usdt = 0;
      try {
        const [wei, tokenWei] = await Promise.all([
          client.getBalance({ address: address as `0x${string}` }),
          client.readContract({
            address: BSC_USDT_CONTRACT as `0x${string}`,
            abi: erc20BalanceAbi,
            functionName: 'balanceOf',
            args: [address as `0x${string}`],
          }) as Promise<bigint>,
        ]);
        bnb = Number(formatUnits(wei, 18));
        usdt = Number(formatUnits(tokenWei, BSC_USDT_DECIMALS));
      } catch {
        // Leave zeros on RPC failure — the row still renders with its address.
      }
      return {
        walletType: w.wallet_type as string,
        label: ((w.metadata as { label?: string } | null)?.label) ?? null,
        address,
        status: w.status as string,
        bnb: Math.round(bnb * 1e6) / 1e6,
        usdt: Math.round(usdt * 1e4) / 1e4,
      };
    }),
  );

  return { wallets, depositCount: depositCount ?? 0, usdtContract: BSC_USDT_CONTRACT };
}
