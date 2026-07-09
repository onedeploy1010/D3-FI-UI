import { addRpcUrlOverrideToChain } from '@privy-io/react-auth';
import { base, bsc } from 'viem/chains';

const bscRpcUrl = import.meta.env.VITE_BSC_RPC_URL?.trim();

/** D3 protocol default network — BNB Smart Chain (chainId 56) */
export const d3DefaultChain = bscRpcUrl ? addRpcUrlOverrideToChain(bsc, bscRpcUrl) : bsc;

/** Extra chains for Privy onramp providers (MoonPay / Coinbase) that do not support BSC directly. */
export const d3SupportedChains = [d3DefaultChain, base];
