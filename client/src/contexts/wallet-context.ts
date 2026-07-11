import { createContext, useContext } from 'react';

export type WalletContextValue = {
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
  /** Bumps after each demo login reset so wallet-bound hooks re-fetch clean baseline. */
  demoSessionKey: number;
  error: string | null;
  connect: () => void;
  connectDemo: () => Promise<void>;
  disconnect: () => void;
};

/** Stable context instance — separate module avoids Vite HMR duplicating createContext(). */
export const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
