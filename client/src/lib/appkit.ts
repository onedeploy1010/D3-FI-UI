import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { bsc } from '@reown/appkit/networks';

/**
 * Reown AppKit + wagmi — wallet-only connection (no email/social).
 * Replaces Privy. Great support for TokenPocket / OKX / Bitget / WalletConnect
 * incl. in-app browsers via injected + WalletConnect.
 */
export const REOWN_PROJECT_ID =
  import.meta.env.VITE_REOWN_PROJECT_ID?.trim() || '3797379276b38cfb9f98d7e8b4d6c5dd';

const appUrl =
  (typeof window !== 'undefined' && window.location.origin) ||
  import.meta.env.VITE_APP_ORIGIN ||
  'https://d3-dapp.pages.dev';

export const wagmiAdapter = new WagmiAdapter({
  networks: [bsc],
  projectId: REOWN_PROJECT_ID,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

// Initialize the modal once at module load.
createAppKit({
  adapters: [wagmiAdapter],
  networks: [bsc],
  defaultNetwork: bsc,
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: 'D3 Finance',
    description: 'D3 Finance — 去中心化金融协议',
    url: appUrl,
    icons: ['https://d3-dapp.pages.dev/favicon.ico'],
  },
  // Wallet-only: no email, no socials.
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
});
