import type { ConnectedWallet } from '@privy-io/react-auth';
import { formatWalletAddress, walletEquals } from './wallet';

/** Prefer external wallet (MetaMask / TokenPocket) over empty Privy embedded wallet. */
export function resolvePrimaryWallet(wallets: ConnectedWallet[]): ConnectedWallet | null {
  try {
    const external = wallets.find((w) => w.walletClientType !== 'privy');
    if (external) return external;
    return wallets.find((w) => w.walletClientType === 'privy') ?? wallets[0] ?? null;
  } catch {
    return null;
  }
}

/** Resolve the wallet used for signing — must match the connected address when possible. */
export function resolveWalletForAddress(
  wallets: ConnectedWallet[],
  address: string | null,
): ConnectedWallet | null {
  try {
    if (address) {
      const match = wallets.find((w) => walletEquals(w.address, address));
      if (match) return match;
    }
    return resolvePrimaryWallet(wallets);
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
