// @refresh reset
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAccount, useChainId, useDisconnect, useSignMessage } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import {
  clearDemoWalletSession,
  DEMO_LINE_LEADER_WALLET,
  DEMO_PARTNER_SPONSOR_WALLET,
  DEMO_PROFILE,
  readDemoWalletFromSession,
  writeDemoWalletSession,
} from '@/lib/demoWallet';
import { clearDemoPartnerLocalStorage } from '@/components/partner/partnerData';
import { clearLocalDemoSim, resetLocalDemoSim } from '@/components/partner/ud3DemoDailyTick';
import { clearDemoPartnerSession } from '@/lib/demoPartnerSession';
import { resetDemoPartnerSession } from '@/lib/unionApi';
import { shortWallet } from '@/lib/wallet';
import { bindReferral, ensureUnionProfile } from '@/lib/unionApi';
import { clearSiweSession, hasValidSession, siweSignIn } from '@/lib/siwe';
import { WalletContext, type WalletContextValue } from './wallet-context';

const siweRejectedMessage = '您取消了签名。请重新连接钱包并在弹窗中签名以登录。';

function useDemoWalletState() {
  const [demoWallet, setDemoWallet] = useState<string | null>(() => readDemoWalletFromSession());
  const [demoSessionKey, setDemoSessionKey] = useState(0);

  const activateDemo = useCallback(async () => {
    clearDemoPartnerLocalStorage(DEMO_LINE_LEADER_WALLET);
    clearDemoPartnerSession();
    resetLocalDemoSim();
    writeDemoWalletSession();
    try {
      await ensureUnionProfile(DEMO_LINE_LEADER_WALLET, {
        lang: 'zh',
        displayName: DEMO_PROFILE.displayNameZh,
      });
      try {
        await bindReferral(DEMO_LINE_LEADER_WALLET, DEMO_PARTNER_SPONSOR_WALLET, 'partner');
      } catch {
        // 远程未 seed 时由 isReferralBoundForWallet 客户端兜底
      }
      await resetDemoPartnerSession(DEMO_LINE_LEADER_WALLET);
    } catch {
      // Supabase may be offline during UI-only dev — client fallback covers team data
    }
    setDemoWallet(DEMO_LINE_LEADER_WALLET);
    setDemoSessionKey((k) => k + 1);
  }, []);

  const deactivateDemo = useCallback(() => {
    clearDemoPartnerSession();
    clearDemoPartnerLocalStorage(DEMO_LINE_LEADER_WALLET);
    clearLocalDemoSim();
    clearDemoWalletSession();
    setDemoWallet(null);
  }, []);

  return { demoWallet, isDemo: Boolean(demoWallet), demoSessionKey, activateDemo, deactivateDemo };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { open } = useAppKit();
  const { address, status } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const chainId = useChainId();

  const { demoWallet, isDemo, demoSessionKey, activateDemo, deactivateDemo } = useDemoWalletState();
  const [error, setError] = useState<string | null>(null);
  const [siweInProgress, setSiweInProgress] = useState(false);

  // wagmi's connected address is only authoritative when not in demo mode.
  const externalAddress = demoWallet ? null : (address ?? null);
  const wallet = demoWallet ?? externalAddress;
  const isConnecting = siweInProgress || status === 'connecting';

  const syncProfile = useCallback(
    async (addr: string) => {
      if (isDemo) return;
      try {
        await ensureUnionProfile(addr);
      } catch {
        // Supabase may be offline during UI-only dev
      }
    },
    [isDemo],
  );

  // Establish a SIWE session once per connected external address.
  const attemptedAddrRef = useRef<string | null>(null);
  useEffect(() => {
    if (!externalAddress) return;
    const addrLc = externalAddress.toLowerCase();
    if (attemptedAddrRef.current === addrLc) return;

    let cancelled = false;
    void (async () => {
      try {
        if (!hasValidSession(externalAddress)) {
          setSiweInProgress(true);
          await siweSignIn(externalAddress, chainId, signMessageAsync);
        }
        attemptedAddrRef.current = addrLc;
        if (!cancelled) setError(null);
        // Off the critical path: the profile loader self-provisions on 404, so the
        // referral gate shouldn't wait ~2s for this ensure round-trip on every login.
        void syncProfile(externalAddress);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const lower = msg.toLowerCase();
        if (lower.includes('rejected') || lower.includes('denied') || lower.includes('cancel')) {
          // User declined the signature — disconnect so a retry starts clean.
          setError(siweRejectedMessage);
          clearSiweSession();
          wagmiDisconnect();
        } else {
          setError(msg);
        }
      } finally {
        if (!cancelled) setSiweInProgress(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [externalAddress, chainId, signMessageAsync, syncProfile, wagmiDisconnect]);

  const connect = useCallback(() => {
    setError(null);
    if (wallet) return;
    deactivateDemo();
    void open();
  }, [wallet, deactivateDemo, open]);

  const connectDemo = useCallback(async () => {
    setError(null);
    try {
      if (address) wagmiDisconnect();
      clearSiweSession();
      attemptedAddrRef.current = null;
      deactivateDemo();
      await activateDemo();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    }
  }, [address, wagmiDisconnect, deactivateDemo, activateDemo]);

  const disconnect = useCallback(() => {
    setError(null);
    attemptedAddrRef.current = null;
    clearSiweSession();
    deactivateDemo();
    if (address) wagmiDisconnect();
  }, [address, wagmiDisconnect, deactivateDemo]);

  const value = useMemo<WalletContextValue>(
    () => ({
      wallet,
      shortAddress: wallet ? shortWallet(wallet) : null,
      privyUserId: null,
      isConnected: Boolean(wallet),
      isDemo,
      isPrivyReady: true,
      privyInitFailed: false,
      isReady: true,
      isConnecting,
      demoSessionKey,
      error,
      connect,
      connectDemo,
      disconnect,
    }),
    [wallet, isDemo, isConnecting, demoSessionKey, error, connect, connectDemo, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
