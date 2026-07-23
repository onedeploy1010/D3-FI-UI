import {
  encodeFunctionData,
  getAddress,
  type Address,
  type WalletClient,
} from 'viem';
import { bscPublicClient, d3DefaultChain } from '@/lib/chains';
import { ensureD3Chain } from '@/lib/wagmiWallet';

/**
 * Frontend for the on-chain ReferralRegistry (contracts/src/ReferralRegistry.sol).
 * The user calls bind() from their own wallet and pays gas — no relay.
 */

const RAW_ADDRESS = import.meta.env.VITE_REFERRAL_REGISTRY_ADDRESS?.trim();

export const REFERRAL_REGISTRY_ADDRESS: `0x${string}` | null = (() => {
  if (!RAW_ADDRESS) return null;
  try {
    return getAddress(RAW_ADDRESS);
  } catch {
    return null;
  }
})();

export function isOnchainReferralEnabled(): boolean {
  return REFERRAL_REGISTRY_ADDRESS !== null;
}

const registryAbi = [
  { name: 'bind', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'upline', type: 'address' }], outputs: [] },
  {
    name: 'uplineOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'isBound',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'isRoot',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
] as const;

const ZERO = '0x0000000000000000000000000000000000000000';

/** Current on-chain upline for `user` (null if unbound / registry not configured). */
export async function readUplineOnchain(user: string): Promise<string | null> {
  if (!REFERRAL_REGISTRY_ADDRESS) return null;
  const upline = (await bscPublicClient.readContract({
    address: REFERRAL_REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'uplineOf',
    args: [user as Address],
  })) as string;
  return upline && upline.toLowerCase() !== ZERO ? getAddress(upline) : null;
}

/**
 * Whether `wallet` is bound on-chain (or is a genesis root, which has no upline
 * but counts as bound). This mirrors the contract's own `bind()` precondition
 * (`isRoot[x] || isBound[x]`), so it doubles as the sponsor-registered check —
 * a root that has no off-chain profile yet is correctly treated as registered.
 * On-chain is the source of truth.
 */
export async function isBoundOrRootOnchain(wallet: string): Promise<boolean> {
  if (!REFERRAL_REGISTRY_ADDRESS) return false;
  const addr = wallet as Address;
  const [root, bound] = await Promise.all([
    bscPublicClient.readContract({
      address: REFERRAL_REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'isRoot',
      args: [addr],
    }) as Promise<boolean>,
    bscPublicClient.readContract({
      address: REFERRAL_REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'isBound',
      args: [addr],
    }) as Promise<boolean>,
  ]);
  return Boolean(root) || Boolean(bound);
}

/** A valid on-chain upline is exactly a bound-or-root wallet. */
export const isSponsorRegisteredOnchain = isBoundOrRootOnchain;

/**
 * Bind `upline` on-chain from the user's wallet (they pay gas). Returns the tx hash.
 * The caller should then POST /referrals/bind with { sponsorWallet, txHash } to sync.
 */
export async function bindReferralOnchain(
  walletClient: WalletClient,
  upline: string,
): Promise<string> {
  if (!REFERRAL_REGISTRY_ADDRESS) throw new Error('On-chain referral registry not configured');
  const account = walletClient.account?.address as Address | undefined;
  if (!account) throw new Error('No connected wallet account');
  await ensureD3Chain(walletClient);

  const data = encodeFunctionData({ abi: registryAbi, functionName: 'bind', args: [upline as Address] });

  const txHash = await walletClient.sendTransaction({ account, to: REFERRAL_REGISTRY_ADDRESS, data, chain: d3DefaultChain });
  // Wait for confirmation so the backend's uplineOf() read reflects the binding.
  await bscPublicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
  return txHash;
}
