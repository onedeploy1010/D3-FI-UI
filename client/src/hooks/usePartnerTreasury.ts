import { useEffect, useState } from 'react';
import { fetchPartnerTreasury, type PartnerTreasury } from '@/lib/partnerApi';

export function usePartnerTreasury() {
  const [treasury, setTreasury] = useState<PartnerTreasury | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPartnerTreasury();
        if (!cancelled) setTreasury(data);
      } catch {
        if (!cancelled) setTreasury(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return treasury;
}
