import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { siweSignIn, hasValidSession, fetchPartnerProfile, clearSiweSession } from '@/lib/siwe';

export type PartnerState = 'idle' | 'verifying' | 'partner' | 'not_partner' | 'error';

/**
 * Partner login: connect wallet (Reown) → SIWE sign-in → verify is_partner.
 * Only a genuine partner (partner_accounts.is_partner) reaches 'partner'.
 */
export function usePartnerAuth() {
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const [state, setState] = useState<PartnerState>('idle');
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(async () => {
    if (!address || !isConnected) {
      setState('idle');
      return;
    }
    setError(null);
    setState('verifying');
    try {
      if (!hasValidSession(address)) {
        await siweSignIn(address, chainId ?? 56, signMessageAsync);
      }
      const profile = await fetchPartnerProfile(address);
      setState(profile.partnerAccount?.is_partner ? 'partner' : 'not_partner');
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证失败');
      setState('error');
    }
  }, [address, chainId, isConnected, signMessageAsync]);

  useEffect(() => {
    if (isConnected && address) void verify();
    else setState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  const logout = useCallback(() => {
    clearSiweSession();
    disconnect();
    setState('idle');
  }, [disconnect]);

  return { address: address ?? null, isConnected, state, error, verify, logout };
}
