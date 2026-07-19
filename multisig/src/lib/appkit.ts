import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { bsc } from '@reown/appkit/networks';

/** Reown AppKit + wagmi — wallet-only (partners sign in with their wallet). */
export const REOWN_PROJECT_ID =
  import.meta.env.VITE_REOWN_PROJECT_ID?.trim() || '3797379276b38cfb9f98d7e8b4d6c5dd';

const appUrl =
  (typeof window !== 'undefined' && window.location.origin) || 'https://sign.d3-fi.com';

export const wagmiAdapter = new WagmiAdapter({
  networks: [bsc],
  projectId: REOWN_PROJECT_ID,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

createAppKit({
  adapters: [wagmiAdapter],
  networks: [bsc],
  defaultNetwork: bsc,
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: 'D3 多签系统',
    description: 'D3 多签系统 — 合伙人与项目方',
    url: appUrl,
    icons: ['https://sign.d3-fi.com/favicon.ico'],
  },
  features: { analytics: false, email: false, socials: false },
});
