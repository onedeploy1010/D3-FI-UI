import {
  encodeFunctionData,
  formatUnits,
  type Address,
  type WalletClient,
} from 'viem';
import { bscPublicClient, d3DefaultChain } from '@/lib/chains';
import { ensureD3Chain } from '@/lib/wagmiWallet';
import { BSC_USDT_ADDRESS, BSC_USDT_DECIMALS } from '@/lib/tokens';

/** Minimal ABI for the TestUSDT faucet (contracts/src/TestUSDT.sol). */
const faucetAbi = [
  { name: 'claim', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'faucetAmount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    name: 'claimableIn',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export type FaucetStatus = {
  balance: number;
  faucetAmount: number;
  claimableInSec: number;
};

export async function getFaucetStatus(account: string): Promise<FaucetStatus> {
  const addr = account as Address;
  const [balance, amount, claimableIn] = await Promise.all([
    bscPublicClient.readContract({ address: BSC_USDT_ADDRESS, abi: faucetAbi, functionName: 'balanceOf', args: [addr] }),
    bscPublicClient.readContract({ address: BSC_USDT_ADDRESS, abi: faucetAbi, functionName: 'faucetAmount' }),
    bscPublicClient.readContract({ address: BSC_USDT_ADDRESS, abi: faucetAbi, functionName: 'claimableIn', args: [addr] }),
  ]);
  return {
    balance: Number(formatUnits(balance, BSC_USDT_DECIMALS)),
    faucetAmount: Number(formatUnits(amount, BSC_USDT_DECIMALS)),
    claimableInSec: Number(claimableIn),
  };
}

/** Call claim() on the faucet token; returns the tx hash. */
export async function claimTestUsdt(walletClient: WalletClient): Promise<string> {
  const account = walletClient.account?.address as Address | undefined;
  if (!account) throw new Error('No connected wallet account');
  await ensureD3Chain(walletClient);

  const data = encodeFunctionData({ abi: faucetAbi, functionName: 'claim', args: [] });
  return walletClient.sendTransaction({ account, to: BSC_USDT_ADDRESS, data, chain: d3DefaultChain });
}
