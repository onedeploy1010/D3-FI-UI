import type { WalletClient } from 'viem';
import { getWalletClient } from 'wagmi/actions';
import { wagmiConfig } from '@/lib/appkit';
import { d3DefaultChain } from '@/lib/chains';

/**
 * Bridge from wagmi (Reown AppKit) to viem tx-sending. Replaces the Privy
 * `ConnectedWallet` that used to carry `.getEthereumProvider()` / `.switchChain()`.
 */
export async function getConnectedWalletClient(): Promise<WalletClient | null> {
  try {
    // Cast: the AppKit wagmi adapter's Config is typed against @wagmi/core v2
    // while wagmi/actions resolves v3 — structurally identical at runtime.
    const client = await getWalletClient(wagmiConfig as Parameters<typeof getWalletClient>[0]);
    return client as unknown as WalletClient;
  } catch {
    // ConnectorNotConnectedError when no wallet is connected.
    return null;
  }
}

/** Ensure the connected wallet is on the D3 default chain (BSC) before sending. */
export async function ensureD3Chain(walletClient: WalletClient): Promise<void> {
  if (walletClient.chain?.id === d3DefaultChain.id) return;
  try {
    await walletClient.switchChain({ id: d3DefaultChain.id });
  } catch (e) {
    try {
      await walletClient.addChain({ chain: d3DefaultChain });
      await walletClient.switchChain({ id: d3DefaultChain.id });
    } catch {
      throw e;
    }
  }
}
