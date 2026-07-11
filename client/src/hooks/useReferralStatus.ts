import { useCallback, useEffect, useState } from 'react';
import { isReferralBoundForWallet } from '@/lib/referral';
import { fetchUnionProfile } from '@/lib/unionApi';

export function useReferralStatus(wallet: string | null) {
  const [hasReferralBound, setHasReferralBound] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(wallet));
  const [version, setVersion] = useState(0);

  const refetch = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!wallet) {
      setHasReferralBound(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await fetchUnionProfile(wallet);
        if (cancelled) return;
        setHasReferralBound(isReferralBoundForWallet(wallet, data.referrals));
      } catch {
        if (!cancelled) setHasReferralBound(isReferralBoundForWallet(wallet, undefined));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet, version]);

  return { hasReferralBound, loading, refetch };
}
