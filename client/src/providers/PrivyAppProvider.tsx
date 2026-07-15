import type { ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { d3DefaultChain, d3SupportedChains } from '@/lib/chains';

const appId = import.meta.env.VITE_PRIVY_APP_ID;
const clientId = import.meta.env.VITE_PRIVY_CLIENT_ID;

if (!appId && import.meta.env.DEV) {
  console.error('[Privy] Missing VITE_PRIVY_APP_ID in .env');
}

/** Privy SDK only — wrap with WalletProvider outside (see main.tsx). */
export function PrivyAppProvider({ children }: { children: ReactNode }) {
  if (!appId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      {...(clientId ? { clientId } : {})}
      config={{
        appearance: {
          theme: 'light',
          accentColor: '#8A2B57',
          // TokenPocket has no dedicated Privy entry — use WalletConnect (registry + QR)
          // and detected EIP-6963 / in-app browsers so TP extension & TP app browser work.
          walletList: [
            'metamask',
            'okx_wallet',
            'coinbase_wallet',
            'bitget_wallet',
            'detected_ethereum_wallets',
            'wallet_connect',
            'wallet_connect_qr',
          ],
        },
        loginMethods: ['wallet', 'email'],
        defaultChain: d3DefaultChain,
        supportedChains: d3SupportedChains,
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
