import { useCallback, useEffect, useState } from 'react';
import { isReferralBoundForWallet } from '@/lib/referral';
import { fetchUnionProfile } from '@/lib/unionApi';

/**
 * Referral binding status for a wallet.
 *
 * IMPORTANT: a failed profile fetch (expired SIWE session, network blip, 5xx) is
 * NOT the same as "no referral". Treating it as unbound would show an already-bound
 * user the "please bind a referrer" gate — alarming and wrong. So a fetch error is
 * surfaced as `error` and the caller keeps the user out of the bind gate (retry
 * instead). We only report `hasReferralBound=false` when a fetch SUCCEEDS and the
 * wallet genuinely has no active referral.
 */
export function useReferralStatus(wallet: string | null) {
  const [hasReferralBound, setHasReferralBound] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(wallet));
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);

  const refetch = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!wallet) {
      setHasReferralBound(false);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const data = await fetchUnionProfile(wallet);
        if (cancelled) return;
        setHasReferralBound(isReferralBoundForWallet(wallet, data.referrals));
        setError(false);
      } catch {
        // Do NOT flip to unbound — the binding is likely fine, the fetch just failed.
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet, version]);

  return { hasReferralBound, loading, error, refetch };
}
