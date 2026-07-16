import type { ConnectedWallet } from '@privy-io/react-auth';
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  formatUnits,
  type Address,
} from 'viem';
import { bscPublicClient, d3DefaultChain } from '@/lib/chains';
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
export async function claimTestUsdt(wallet: ConnectedWallet): Promise<string> {
  const account = wallet.address as Address;
  await wallet.switchChain(d3DefaultChain.id);

  const data = encodeFunctionData({ abi: faucetAbi, functionName: 'claim', args: [] });
  const provider = await wallet.getEthereumProvider();
  const walletClient = createWalletClient({ account, chain: d3DefaultChain, transport: custom(provider) });

  return walletClient.sendTransaction({ to: BSC_USDT_ADDRESS, data, chain: d3DefaultChain });
}
