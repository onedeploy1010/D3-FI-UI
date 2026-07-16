import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError, requireWallet, walletEquals } from './wallet.ts';
import { DEMO_WALLET_ADDRESS, isDemoModeRequest } from './demo.ts';
import {
  isPrivyAuthConfigured,
  requirePrivyAuth,
  type PrivyAccessClaims,
} from './privy.ts';

/**
 * Minimal profile shape needed to bind a wallet to a Privy identity.
 * Kept narrow so it works against the full `profiles` row too.
 */
type ActorProfile = {
  wallet_address: string;
  privy_user_id: string | null;
};

/** Upper bound for any single money-amount input (V-15). Sanity cap, not a policy limit. */
export const MONEY_AMOUNT_MAX = 1e9;

/**
 * V-15: reject non-finite, non-positive, or absurdly large money amounts before
 * they reach balance math. Throws HttpError(400) on any invalid input; returns
 * the validated number on success.
 */
export function assertMoneyAmount(n: unknown, opts: { max?: number } = {}): number {
  const max = opts.max ?? MONEY_AMOUNT_MAX;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > max) {
    throw new HttpError(400, 'Invalid amount');
  }
  return n;
}

export interface RequireActorOpts {
  /** Allow the seeded demo wallet to bypass Privy (demo/PoC routes only). */
  allowDemo?: boolean;
  /**
   * Test seam: override the "is Privy configured" check.
   * Production callers omit this and use the real env-driven check.
   */
  privyConfigured?: () => boolean;
  /**
   * Test seam: override Privy verification. Must throw HttpError(401) on an
   * invalid/missing token and return claims (with `sub`) on success.
   */
  verifyPrivy?: (req: Request) => Promise<PrivyAccessClaims | null>;
}

async function findProfileByWalletCI(
  sb: SupabaseClient,
  wallet: string,
): Promise<ActorProfile | null> {
  const exact = await sb
    .from('profiles')
    .select('wallet_address, privy_user_id')
    .eq('wallet_address', wallet)
    .maybeSingle();
  if (exact.data) return exact.data as ActorProfile;
  const ci = await sb
    .from('profiles')
    .select('wallet_address, privy_user_id')
    .ilike('wallet_address', wallet.toLowerCase())
    .maybeSingle();
  return (ci.data as ActorProfile | null) ?? null;
}

async function findProfileBoundToSub(
  sb: SupabaseClient,
  sub: string,
): Promise<ActorProfile | null> {
  const { data } = await sb
    .from('profiles')
    .select('wallet_address, privy_user_id')
    .eq('privy_user_id', sub)
    .maybeSingle();
  return (data as ActorProfile | null) ?? null;
}

/**
 * Resolve the acting wallet for an authenticated money/user route, binding the
 * spoofable `X-Wallet-Address` header to the verified Privy JWT `sub`.
 *
 * Fails CLOSED: money routes never fall back to the header when Privy is not
 * configured. (V-01 / F2)
 */
export async function requireActorWallet(
  sb: SupabaseClient,
  req: Request,
  opts: RequireActorOpts = {},
): Promise<string> {
  // 1. Demo path (only when explicitly allowed and demo mode is active).
  if (opts.allowDemo && isDemoModeRequest(req)) {
    return DEMO_WALLET_ADDRESS;
  }

  // 2. Require verified Privy auth. Do NOT trust the header alone for money.
  const privyConfigured = opts.privyConfigured ?? isPrivyAuthConfigured;
  const verifyPrivy = opts.verifyPrivy ?? requirePrivyAuth;
  if (!privyConfigured()) {
    throw new HttpError(503, 'Auth not configured');
  }
  const claims = await verifyPrivy(req);
  const sub = claims?.sub;
  if (!sub) {
    throw new HttpError(401, 'Privy authentication required');
  }

  // 3. The claimed wallet still comes from the header, but must be proven owned.
  const headerWallet = requireWallet(req);

  // 4a. One-sub-one-wallet: reject a session already bound to a different wallet.
  const boundElsewhere = await findProfileBoundToSub(sb, sub);
  if (boundElsewhere && !walletEquals(boundElsewhere.wallet_address, headerWallet)) {
    throw new HttpError(403, 'Session bound to another wallet');
  }

  // 4b. Bind / verify the header wallet's profile against this sub.
  const profile = await findProfileByWalletCI(sb, headerWallet);
  if (profile) {
    const existingSub = profile.privy_user_id;
    if (existingSub != null && existingSub !== '') {
      if (existingSub !== sub) {
        throw new HttpError(403, 'Wallet not owned by caller');
      }
    } else {
      // First authenticated use of this wallet — bind it to the caller's sub.
      await sb
        .from('profiles')
        .update({ privy_user_id: sub })
        .eq('wallet_address', profile.wallet_address);
    }
  }
  // No profile yet: one-sub-one-wallet already enforced above; profile is
  // created downstream by the route (ensureProfile) carrying this sub.

  // 5. Return the canonical header wallet.
  return headerWallet;
}
