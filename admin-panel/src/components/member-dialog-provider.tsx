import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { MemberDetailDialog } from './member-detail-dialog';

/**
 * Global "open the member modal from anywhere" plumbing. Mount
 * <MemberDialogProvider> once near the app root; then any component (e.g. an
 * <AddressChip>) can call `useMemberDialog().open(wallet)` without threading
 * dialog state through props.
 */

interface MemberDialogContextValue {
  open: (wallet: string) => void;
  close: () => void;
}

const MemberDialogContext = createContext<MemberDialogContextValue | null>(null);

export function MemberDialogProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<string | null>(null);

  const open = useCallback((w: string) => setWallet(w), []);
  const close = useCallback(() => setWallet(null), []);

  const value = useMemo<MemberDialogContextValue>(() => ({ open, close }), [open, close]);

  return (
    <MemberDialogContext.Provider value={value}>
      {children}
      <MemberDetailDialog wallet={wallet} onClose={close} />
    </MemberDialogContext.Provider>
  );
}

export function useMemberDialog(): MemberDialogContextValue {
  const ctx = useContext(MemberDialogContext);
  if (!ctx) {
    // Fail soft: outside a provider, opening the modal is a no-op rather than a
    // crash, so an <AddressChip> dropped anywhere never throws.
    return { open: () => {}, close: () => {} };
  }
  return ctx;
}
