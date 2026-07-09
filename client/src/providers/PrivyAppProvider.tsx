import type { ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { d3DefaultChain, d3SupportedChains } from '@/lib/chains';
import { d3PrivyWalletList } from '@/lib/privyConfig';

const appId = import.meta.env.VITE_PRIVY_APP_ID;
const clientId = import.meta.env.VITE_PRIVY_CLIENT_ID;

if (!appId && import.meta.env.DEV) {
  console.error('[Privy] Missing VITE_PRIVY_APP_ID in .env');
}

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
          walletChainType: 'ethereum-only',
          walletList: d3PrivyWalletList,
          landingHeader: '登录 D3',
        },
        loginMethods: ['wallet', 'email'],
        defaultChain: d3DefaultChain,
        supportedChains: d3SupportedChains,
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        fundingMethodConfig: {
          moonpay: {
            useSandbox: false,
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
