import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { shortWallet } from '@/lib/wallet';
import { resolvePrimaryWalletAddress } from '@/lib/privyWallet';
import { ensureUnionProfile, setUnionAccessTokenGetter } from '@/lib/unionApi';

type WalletContextValue = {
  wallet: string | null;
  shortAddress: string | null;
  privyUserId: string | null;
  isConnected: boolean;
  isReady: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const privyConfigured = Boolean(import.meta.env.VITE_PRIVY_APP_ID);

export function WalletProvider({ children }: { children: ReactNode }) {
  if (!privyConfigured) {
    return <WalletProviderUnconfigured>{children}</WalletProviderUnconfigured>;
  }
  return <WalletProviderInner>{children}</WalletProviderInner>;
}

function WalletProviderUnconfigured({ children }: { children: ReactNode }) {
  const error = '请在 .env 配置 VITE_PRIVY_APP_ID';
  const value = useMemo<WalletContextValue>(
    () => ({
      wallet: null,
      shortAddress: null,
      privyUserId: null,
      isConnected: false,
      isReady: true,
      isConnecting: false,
      error,
      connect: async () => {
        throw new Error(error);
      },
      disconnect: () => {},
    }),
    [],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function WalletProviderInner({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useLayoutEffect(() => {
    setUnionAccessTokenGetter(async () => {
      if (!authenticated) return null;
      try {
        return await getAccessToken();
      } catch {
        return null;
      }
    });
  }, [authenticated, getAccessToken]);

  const wallet = useMemo(() => {
    if (!authenticated) return null;
    return resolvePrimaryWalletAddress(wallets, user?.wallet?.address);
  }, [authenticated, wallets, user?.wallet?.address]);

  const privyUserId = user?.id ?? null;
  const isReady = ready && walletsReady;

  const syncProfile = useCallback(
    async (address: string) => {
      try {
        await ensureUnionProfile(address, {
          privyUserId: privyUserId ?? undefined,
          displayName: user?.email?.address ?? undefined,
        });
      } catch {
        // Supabase may be offline during UI-only dev
      }
    },
    [privyUserId, user?.email?.address],
  );

  useEffect(() => {
    if (!wallet) return;
    void syncProfile(wallet);
  }, [wallet, syncProfile]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await login();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setIsConnecting(false);
    }
  }, [login]);

  const disconnect = useCallback(() => {
    setError(null);
    void logout();
  }, [logout]);

  const value = useMemo<WalletContextValue>(
    () => ({
      wallet,
      shortAddress: wallet ? shortWallet(wallet) : null,
      privyUserId,
      isConnected: Boolean(wallet),
      isReady,
      isConnecting: isConnecting || !isReady,
      error,
      connect,
      disconnect,
    }),
    [wallet, privyUserId, isReady, isConnecting, error, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
