import type { ConnectedWallet } from '@privy-io/react-auth';
import { createWalletClient, custom, encodeFunctionData, parseUnits, type Hex } from 'viem';
import { d3DefaultChain } from '@/lib/chains';

/** BSC USDT (BEP-20) */
export const BSC_USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955' as const;

export const BSC_CAIP2 = 'eip155:56' as const;

export type PartnerPaymentMethod = 'wallet' | 'fiat' | 'crypto';

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

async function sendUsdt(
  wallet: ConnectedWallet,
  amountUsdt: number,
  toAddress: string,
): Promise<string> {
  const data = encodeFunctionData({
    abi: erc20TransferAbi,
    functionName: 'transfer',
    args: [toAddress as `0x${string}`, parseUnits(String(amountUsdt), 18)],
  });

  await wallet.switchChain(d3DefaultChain.id);
  const provider = await wallet.getEthereumProvider();
  const walletClient = createWalletClient({
    account: wallet.address as Hex,
    chain: d3DefaultChain,
    transport: custom(provider),
  });

  return walletClient.sendTransaction({
    to: BSC_USDT_ADDRESS,
    data,
    chain: d3DefaultChain,
  });
}

/** Pay USDT to a user-specific deposit address (never treasury). */
export async function payToDepositAddress(opts: {
  amountUsdt: number;
  depositAddress: string;
  isDemo: boolean;
  wallet: ConnectedWallet | null;
}): Promise<{ txHash: string | null }> {
  if (opts.isDemo) {
    return { txHash: null };
  }
  if (!opts.wallet) {
    throw new Error('请连接钱包后再支付');
  }
  const txHash = await sendUsdt(opts.wallet, opts.amountUsdt, opts.depositAddress);
  return { txHash };
}
