import { useCallback } from 'react';
import { useUnionProfileQuery } from '@/hooks/useUnionProfileQuery';

/**
 * Whether a wallet is a partner — read from the shared union-profile cache instead
 * of an independent full-bundle fetch (dedupes with the gate / partner page).
 */
export function usePartnerMembership(wallet: string | null) {
  const query = useUnionProfileQuery(wallet);
  const isPartner = Boolean(query.data?.partnerAccount?.is_partner);
  const loading = Boolean(wallet) && query.isLoading;

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return { isPartner, loading, refetch };
}
