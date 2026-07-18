import { useCallback } from 'react';
import { isReferralBoundForWallet } from '@/lib/referral';
import { useUnionProfileQuery } from '@/hooks/useUnionProfileQuery';

/**
 * Referral binding status for a wallet, read from the shared union-profile cache
 * (so the gate + partner page no longer each fetch the whole bundle just to answer
 * one boolean).
 *
 * IMPORTANT: a failed profile fetch (expired SIWE session, network blip, 5xx) is
 * NOT the same as "no referral". Treating it as unbound would show an already-bound
 * user the "please bind a referrer" gate — alarming and wrong. So a fetch error is
 * surfaced as `error` and the caller keeps the user out of the bind gate (retry
 * instead). We only report `hasReferralBound=false` when a fetch SUCCEEDS and the
 * wallet genuinely has no active referral.
 */
export function useReferralStatus(wallet: string | null) {
  const query = useUnionProfileQuery(wallet);

  const hasReferralBound =
    wallet && query.data ? isReferralBoundForWallet(wallet, query.data.referrals) : false;
  const loading = Boolean(wallet) && query.isLoading;
  // Only an actual error with no data on hand — never flip a bound user to "unbound".
  const error = query.isError && !query.data;

  const refetch = useCallback(() => {
    void query.refetch();
  }, [query]);

  return { hasReferralBound, loading, error, refetch };
}
