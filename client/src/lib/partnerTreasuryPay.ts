import type { ConnectedWallet } from '@privy-io/react-auth';
import { encodeFunctionData, parseUnits } from 'viem';
import { d3DefaultChain } from '@/lib/chains';
import { fetchPartnerTreasury } from '@/lib/partnerApi';

/** BSC USDT (BEP-20) */
export const BSC_USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955' as const;

const erc20TransferAbi = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

export async function resolvePartnerTreasuryAddress(cached?: string | null): Promise<string> {
  if (cached) return cached;
  const treasury = await fetchPartnerTreasury();
  return treasury.treasuryAddress;
}

async function sendUsdtToTreasury(
  wallet: ConnectedWallet,
  amountUsdt: number,
  treasuryAddress: string,
): Promise<string> {
  const data = encodeFunctionData({
    abi: erc20TransferAbi,
    functionName: 'transfer',
    args: [treasuryAddress as `0x${string}`, parseUnits(String(amountUsdt), 18)],
  });

  const result = await wallet.sendTransaction(
    {
      to: BSC_USDT_ADDRESS,
      data,
      chainId: d3DefaultChain.id,
    },
    { address: wallet.address },
  );

  const hash =
    (result as { hash?: string }).hash ??
    (result as { transactionHash?: string }).transactionHash ??
    null;
  if (!hash) throw new Error('Transaction submitted without hash');
  return hash;
}

/** Pay USDT to the partner global treasury. Demo mode skips on-chain transfer. */
export async function payPartnerTreasury(opts: {
  amountUsdt: number;
  treasuryAddress?: string | null;
  isDemo: boolean;
  wallet: ConnectedWallet | null;
}): Promise<{ treasuryAddress: string; txHash: string | null }> {
  const treasuryAddress = await resolvePartnerTreasuryAddress(opts.treasuryAddress);
  if (opts.isDemo) {
    return { treasuryAddress, txHash: null };
  }
  if (!opts.wallet) {
    throw new Error('请连接钱包后再支付');
  }
  const txHash = await sendUsdtToTreasury(opts.wallet, opts.amountUsdt, treasuryAddress);
  return { treasuryAddress, txHash };
}
