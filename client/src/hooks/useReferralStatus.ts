import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isReferralBoundForWallet, isReferralRootWallet } from '@/lib/referral';
import { isBoundOrRootOnchain, isOnchainReferralEnabled } from '@/lib/referralRegistry';
import { isDemoWallet } from '@/lib/demoWallet';
import { useUnionProfileQuery } from '@/hooks/useUnionProfileQuery';

/**
 * Referral binding status for a wallet.
 *
 * When the on-chain ReferralRegistry is configured it is the source of truth, so
 * the answer is a single unauthenticated RPC read (`isBound || isRoot`). That keeps
 * the bind gate off the slow path entirely: no waiting for the SIWE session to be
 * established and no downloading the whole union-profile bundle just to answer one
 * boolean. Without a registry we fall back to the shared profile bundle.
 *
 * IMPORTANT: a failed check (RPC outage, expired SIWE session, network blip, 5xx)
 * is NOT the same as "no referral". Treating it as unbound would show an already-
 * bound user the "please bind a referrer" gate — alarming and wrong. So a fetch
 * error is surfaced as `error` and the caller keeps the user out of the bind gate
 * (retry instead). We only report `hasReferralBound=false` when a check SUCCEEDS
 * and the wallet genuinely has no active referral.
 */
export function useReferralStatus(wallet: string | null) {
  // Genesis root(s) have no sponsor — treat them as bound so every referral gate
  // (bind gate, home/stake "please bind" prompts) lets them straight in. The demo
  // session has no SIWE token (profile fetch 401s), so it is also always "bound".
  const alwaysBound = isDemoWallet(wallet) || isReferralRootWallet(wallet);
  const onchain = isOnchainReferralEnabled();

  const onchainQuery = useQuery({
    queryKey: ['referralBoundOnchain', wallet ? wallet.trim().toLowerCase() : null],
    queryFn: () => isBoundOrRootOnchain(wallet as string),
    enabled: onchain && !alwaysBound && Boolean(wallet),
    staleTime: 30_000,
    retry: 2,
  });
  const profileQuery = useUnionProfileQuery(wallet, { enabled: !onchain });

  const query = onchain ? onchainQuery : profileQuery;
  const hasReferralBound = alwaysBound
    ? true
    : onchain
      ? onchainQuery.data === true
      : wallet && profileQuery.data
        ? isReferralBoundForWallet(wallet, profileQuery.data.referrals)
        : false;
  const loading = !alwaysBound && Boolean(wallet) && query.isLoading;
  // Only an actual error with no data on hand — never flip a bound user to "unbound".
  const error = !alwaysBound && query.isError && query.data === undefined;

  const refetch = useCallback(() => {
    void query.refetch();
  }, [query]);

  return { hasReferralBound, loading, error, refetch };
}
