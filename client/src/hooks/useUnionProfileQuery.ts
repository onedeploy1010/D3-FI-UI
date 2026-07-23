import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { UnionProfileBundle } from '@/lib/d3fiTypes';
import { ensureUnionProfile, fetchUnionProfile } from '@/lib/unionApi';
import { hasValidSession } from '@/lib/siwe';
import { isDemoWallet } from '@/lib/demoWallet';

/**
 * Single shared React Query cache for the Union profile bundle.
 *
 * WHY: the same large `fetchUnionProfile(wallet)` bundle was previously downloaded
 * 2-4× per page — the referral gate, the partner page's own gate, the membership
 * check and the partner program hook each fetched it independently with no cache.
 * Every consumer now reads the SAME `['unionProfile', wallet]` entry, so a page load
 * collapses to one request, mounts reuse the cache (30s staleTime), and mutations
 * invalidate one key instead of manually re-reading everything.
 */

type Lang = 'zh' | 'en';

const STALE_MS = 30_000;

const normWallet = (wallet: string | null) => (wallet ? wallet.trim().toLowerCase() : null);

export function unionProfileKey(wallet: string | null) {
  return ['unionProfile', normWallet(wallet)] as const;
}

function isNotFound(msg: string) {
  const m = msg.toLowerCase();
  return m.includes('404') || m.includes('not found');
}

function isAuthError(msg: string) {
  const m = msg.toLowerCase();
  return m.includes('privy') || m.includes('401') || m.includes('token');
}

/**
 * Resilient loader shared by every consumer: on a genuine 404 it provisions the
 * profile (`ensureUnionProfile`) then re-fetches; transient/auth errors bubble up
 * for React Query's `retry` to handle.
 */
/**
 * The authed /profile fetch is useless before the SIWE session exists — firing it
 * during sign-in just burns 401s + retries and slows the referral gate. Briefly
 * wait for the session token to land, then fetch once with it.
 */
async function waitForSiweSession(wallet: string, maxMs = 6000): Promise<void> {
  if (isDemoWallet(wallet) || hasValidSession(wallet)) return;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 150));
    if (hasValidSession(wallet)) return;
  }
}

export async function loadUnionProfileResilient(
  wallet: string,
  lang: Lang = 'zh',
): Promise<UnionProfileBundle> {
  await waitForSiweSession(wallet);
  try {
    return await fetchUnionProfile(wallet);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isNotFound(msg)) {
      await ensureUnionProfile(wallet, { lang });
      return fetchUnionProfile(wallet);
    }
    throw e;
  }
}

const sharedRetry = (failureCount: number, error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  // Auth hiccups (expired SIWE session) are worth a few retries; anything else once.
  return isAuthError(msg) ? failureCount < 3 : failureCount < 1;
};
const sharedRetryDelay = (attempt: number) => 350 * (attempt + 1);

/**
 * Imperative fetch that shares the same cache entry (dedupes with the hook).
 * `force: true` bypasses the staleTime for post-mutation refreshes; otherwise a
 * fresh-enough cache entry is reused.
 */
export function fetchUnionProfileCached(
  qc: QueryClient,
  wallet: string,
  opts?: { lang?: Lang; force?: boolean },
): Promise<UnionProfileBundle> {
  const queryKey = unionProfileKey(wallet);
  const queryFn = () => loadUnionProfileResilient(wallet, opts?.lang ?? 'zh');
  if (opts?.force) {
    // Always hit the network and update the shared cache so other consumers see it.
    return qc.fetchQuery({ queryKey, queryFn, staleTime: 0, retry: sharedRetry, retryDelay: sharedRetryDelay });
  }
  return qc.ensureQueryData({
    queryKey,
    queryFn,
    staleTime: STALE_MS,
    retry: sharedRetry,
    retryDelay: sharedRetryDelay,
  });
}

/** React hook consumers use to read the shared bundle. */
export function useUnionProfileQuery(
  wallet: string | null,
  opts?: { lang?: Lang; enabled?: boolean },
) {
  return useQuery({
    queryKey: unionProfileKey(wallet),
    queryFn: () => loadUnionProfileResilient(wallet as string, opts?.lang ?? 'zh'),
    enabled: Boolean(wallet) && (opts?.enabled ?? true),
    staleTime: STALE_MS,
    retry: sharedRetry,
    retryDelay: sharedRetryDelay,
  });
}
