import type { ConnectedWallet } from '@privy-io/react-auth';
import { formatWalletAddress } from './wallet';

/** Prefer Privy embedded wallet, then most recently connected wallet. */
export function resolvePrimaryWalletAddress(
  wallets: ConnectedWallet[],
  linkedAddress?: string | null,
): string | null {
  try {
    const embedded = wallets.find((w) => w.walletClientType === 'privy');
    if (embedded?.address) return formatWalletAddress(embedded.address);
    if (wallets[0]?.address) return formatWalletAddress(wallets[0].address);
    if (linkedAddress) return formatWalletAddress(linkedAddress);
  } catch {
    return null;
  }
  return null;
}
