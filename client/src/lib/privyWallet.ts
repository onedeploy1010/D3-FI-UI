import type { ConnectedWallet } from '@privy-io/react-auth';
import { formatWalletAddress } from './wallet';

/** Prefer Privy embedded wallet, then most recently connected wallet. */
export function resolvePrimaryWallet(wallets: ConnectedWallet[]): ConnectedWallet | null {
  try {
    return wallets.find((w) => w.walletClientType === 'privy') ?? wallets[0] ?? null;
  } catch {
    return null;
  }
}

export function resolvePrimaryWalletAddress(
  wallets: ConnectedWallet[],
  linkedAddress?: string | null,
): string | null {
  try {
    const primary = resolvePrimaryWallet(wallets);
    if (primary?.address) return formatWalletAddress(primary.address);
    if (linkedAddress) return formatWalletAddress(linkedAddress);
  } catch {
    return null;
  }
  return null;
}
