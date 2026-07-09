import { useEffect, useState } from 'react';
import { isReferralBoundForWallet } from '@/lib/referral';
import { fetchUnionProfile } from '@/lib/unionApi';

export function useReferralStatus(wallet: string | null) {
  const [hasReferralBound, setHasReferralBound] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!wallet) {
      setHasReferralBound(false);
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
  }, [wallet]);

  return { hasReferralBound, loading };
}
