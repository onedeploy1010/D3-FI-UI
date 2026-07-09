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
import { useLogin, usePrivy, useWallets } from '@privy-io/react-auth';
import {
  clearDemoWalletSession,
  DEMO_LINE_LEADER_WALLET,
  DEMO_PROFILE,
  readDemoWalletFromSession,
  writeDemoWalletSession,
} from '@/lib/demoWallet';
import { shortWallet } from '@/lib/wallet';
import { resolvePrimaryWalletAddress } from '@/lib/privyWallet';
import { ensureUnionProfile, setUnionAccessTokenGetter } from '@/lib/unionApi';

type WalletContextValue = {
  wallet: string | null;
  shortAddress: string | null;
  privyUserId: string | null;
  isConnected: boolean;
  isDemo: boolean;
  /** Privy SDK finished initializing (`usePrivy().ready`). */
  isPrivyReady: boolean;
  /** Privy failed to initialize within the timeout window. */
  privyInitFailed: boolean;
  /** Safe to load wallet-bound APIs (Privy ready or demo session). */
  isReady: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  connectDemo: () => Promise<void>;
  disconnect: () => void;
};

/** Detect when Privy `ready` never fires (blocked SDK, wrong origin, ad blocker). */
const PRIVY_INIT_TIMEOUT_MS = 8000;
/** Reset stuck "connecting" if Privy modal never completes. */
const LOGIN_STUCK_TIMEOUT_MS = 90_000;

const privyInitFailedMessage =
  'Privy 初始化失败：请在 Privy Dashboard 将本站域名加入 Allowed origins，关闭广告拦截后刷新页面。';
const privyNotReadyMessage = 'Privy 正在初始化，请稍候…';

const WalletContext = createContext<WalletContextValue | null>(null);

const privyConfigured = Boolean(import.meta.env.VITE_PRIVY_APP_ID);
const privyMissingError = '请在 .env 配置 VITE_PRIVY_APP_ID';

function useDemoWalletState() {
  const [demoWallet, setDemoWallet] = useState<string | null>(() => readDemoWalletFromSession());

  const activateDemo = useCallback(async () => {
    writeDemoWalletSession();
    setDemoWallet(DEMO_LINE_LEADER_WALLET);
    try {
      await ensureUnionProfile(DEMO_LINE_LEADER_WALLET, {
        lang: 'zh',
        displayName: DEMO_PROFILE.displayNameZh,
      });
    } catch {
      // Supabase may be offline during UI-only dev
    }
  }, []);

  const deactivateDemo = useCallback(() => {
    clearDemoWalletSession();
    setDemoWallet(null);
  }, []);

  return { demoWallet, isDemo: Boolean(demoWallet), activateDemo, deactivateDemo };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  if (!privyConfigured) {
    return <WalletProviderUnconfigured>{children}</WalletProviderUnconfigured>;
  }
  return <WalletProviderInner>{children}</WalletProviderInner>;
}

function WalletProviderUnconfigured({ children }: { children: ReactNode }) {
  const { demoWallet, isDemo, activateDemo, deactivateDemo } = useDemoWalletState();
  const [isConnecting, setIsConnecting] = useState(false);

  const connectDemo = useCallback(async () => {
    setIsConnecting(true);
    try {
      await activateDemo();
    } finally {
      setIsConnecting(false);
    }
  }, [activateDemo]);

  const value = useMemo<WalletContextValue>(
    () => ({
      wallet: demoWallet,
      shortAddress: demoWallet ? shortWallet(demoWallet) : null,
      privyUserId: null,
      isConnected: Boolean(demoWallet),
      isDemo,
      isPrivyReady: true,
      privyInitFailed: false,
      isReady: true,
      isConnecting,
      error: null,
      connect: async () => {
        throw new Error(privyMissingError);
      },
      connectDemo,
      disconnect: deactivateDemo,
    }),
    [demoWallet, isDemo, isConnecting, connectDemo, deactivateDemo],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function WalletProviderInner({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { demoWallet, isDemo, activateDemo, deactivateDemo } = useDemoWalletState();
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [privyInitTimedOut, setPrivyInitTimedOut] = useState(false);
  const isPrivyReady = ready;
  const privyInitFailed = privyInitTimedOut && !ready;

  const { login } = useLogin({
    onComplete: () => setIsConnecting(false),
    onError: (loginError) => {
      setIsConnecting(false);
      setError(loginError?.message ?? 'Privy 登录失败');
    },
  });

  useEffect(() => {
    if (ready) {
      setPrivyInitTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setPrivyInitTimedOut(true), PRIVY_INIT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (privyInitFailed) {
      console.warn('[Privy] SDK did not become ready — check Allowed origins in Privy Dashboard');
    }
  }, [privyInitFailed]);

  useEffect(() => {
    if (authenticated) setIsConnecting(false);
  }, [authenticated]);

  useLayoutEffect(() => {
    setUnionAccessTokenGetter(async () => {
      if (demoWallet) return null;
      if (!authenticated) return null;
      try {
        return await getAccessToken();
      } catch {
        return null;
      }
    });
  }, [authenticated, getAccessToken, demoWallet]);

  const privyWallet = useMemo(() => {
    if (!authenticated || demoWallet) return null;
    return resolvePrimaryWalletAddress(wallets, user?.wallet?.address);
  }, [authenticated, demoWallet, wallets, user?.wallet?.address]);

  const wallet = demoWallet ?? privyWallet;
  const privyUserId = demoWallet ? null : (user?.id ?? null);
  const isReady = Boolean(demoWallet) || isPrivyReady;

  const syncProfile = useCallback(
    async (address: string) => {
      if (isDemo) return;
      try {
        await ensureUnionProfile(address, {
          privyUserId: privyUserId ?? undefined,
          displayName: user?.email?.address ?? undefined,
        });
      } catch {
        // Supabase may be offline during UI-only dev
      }
    },
    [isDemo, privyUserId, user?.email?.address],
  );

  useEffect(() => {
    if (!privyWallet || demoWallet) return;
    void syncProfile(privyWallet);
  }, [privyWallet, demoWallet, syncProfile]);

  const connect = useCallback(() => {
    setError(null);
    if (!isPrivyReady) {
      setError(privyInitFailed ? privyInitFailedMessage : privyNotReadyMessage);
      return;
    }
    if (authenticated) return;

    deactivateDemo();
    setIsConnecting(true);
    login();

    window.setTimeout(() => {
      setIsConnecting((connecting) => {
        if (connecting) {
          setError('登录超时：若未弹出 Privy 窗口，请检查广告拦截或将本站域名加入 Privy Allowed origins');
        }
        return false;
      });
    }, LOGIN_STUCK_TIMEOUT_MS);
  }, [isPrivyReady, privyInitFailed, authenticated, deactivateDemo, login]);

  const connectDemo = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      if (authenticated) await logout();
      deactivateDemo();
      await activateDemo();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setIsConnecting(false);
    }
  }, [authenticated, logout, deactivateDemo, activateDemo]);

  const disconnect = useCallback(() => {
    setError(null);
    deactivateDemo();
    if (authenticated) void logout();
  }, [authenticated, logout, deactivateDemo]);

  const value = useMemo<WalletContextValue>(
    () => ({
      wallet,
      shortAddress: wallet ? shortWallet(wallet) : null,
      privyUserId,
      isConnected: Boolean(wallet),
      isDemo,
      isPrivyReady,
      privyInitFailed,
      isReady,
      isConnecting,
      error,
      connect,
      connectDemo,
      disconnect,
    }),
    [
      wallet,
      privyUserId,
      isDemo,
      isPrivyReady,
      privyInitFailed,
      isReady,
      isConnecting,
      error,
      connect,
      connectDemo,
      disconnect,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
