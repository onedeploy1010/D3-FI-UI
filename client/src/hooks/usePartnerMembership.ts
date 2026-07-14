import { useCallback, useEffect, useState } from 'react';
import { fetchUnionProfile } from '@/lib/unionApi';

export function usePartnerMembership(wallet: string | null) {
  const [isPartner, setIsPartner] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(wallet));

  const refetch = useCallback(async () => {
    if (!wallet) {
      setIsPartner(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const bundle = await fetchUnionProfile(wallet);
      setIsPartner(Boolean(bundle.partnerAccount?.is_partner));
    } catch {
      setIsPartner(false);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { isPartner, loading, refetch };
}
