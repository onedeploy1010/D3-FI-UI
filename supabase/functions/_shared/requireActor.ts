import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getWalletHeader, HttpError, walletEquals } from './wallet.ts';
import { DEMO_WALLET_ADDRESS, isDemoModeRequest } from './demo.ts';
import { verifySiweSession } from './siwe.ts';

/**
 * Minimal profile shape needed to bind a wallet to its login identity.
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
  /** Allow the seeded demo wallet to bypass SIWE auth (demo/PoC routes only). */
  allowDemo?: boolean;
  /**
   * Test seam / proof source: verify the request's SIWE session and return the
   * proven, lowercased wallet address (or throw HttpError(401)). Production
   * callers omit this and use the real X-Session-Token verifier.
   */
  verifySession?: (req: Request) => Promise<string>;
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
 * Resolve the acting wallet for an authenticated money/user route.
 *
 * Identity now comes from a verified SIWE session (X-Session-Token): the wallet
 * cryptographically signed a nonce-bound message at login, so the token's
 * subject IS the proven wallet. This REPLACES the Privy-JWT + on-chain ownership
 * dance while preserving every V-series invariant:
 *   - V-01/F2: the spoofable X-Wallet-Address header is NEVER trusted for
 *     identity. It may only accompany the request as long as it matches the
 *     proven session wallet; ownership is proven by the signature, not the header.
 *   - Fails CLOSED: no session token (or an invalid/expired one) => 401; a
 *     missing SIWE_SESSION_SECRET => 503. Money routes never fall back to a header.
 *   - One-wallet-one-identity: a session subject already recorded against a
 *     different wallet is rejected (403).
 */
export async function requireActorWallet(
  sb: SupabaseClient,
  req: Request,
  opts: RequireActorOpts = {},
): Promise<string> {
  // 1. Demo path (only when explicitly allowed and demo mode is active — V-17).
  if (opts.allowDemo && isDemoModeRequest(req)) {
    return DEMO_WALLET_ADDRESS;
  }

  // 2. Require a verified SIWE session. The subject is the proven, lowercased
  //    wallet address — this is the sole source of identity for money routes.
  const verifySession = opts.verifySession ?? verifySiweSession;
  const sub = await verifySession(req); // lowercased proven wallet or throws 401

  // 3. Defense in depth: if the client also sends X-Wallet-Address it MUST match
  //    the proven session wallet (never trust the header alone). Prefer the
  //    header's checksum casing for backward-compatible DB writes.
  const headerWallet = getWalletHeader(req);
  if (headerWallet && !walletEquals(headerWallet, sub)) {
    throw new HttpError(403, 'Wallet header does not match session');
  }
  const wallet = headerWallet ?? sub;

  // 4. One-wallet-one-identity: the proven subject must not already be recorded
  //    against a DIFFERENT wallet. (The subject is the wallet itself, so this can
  //    only trip on inconsistent data; it preserves the invariant structurally.)
  //    Both lookups are independent reads — fetched concurrently, checked in order.
  const [boundElsewhere, profile] = await Promise.all([
    findProfileBoundToSub(sb, sub),
    findProfileByWalletCI(sb, wallet),
  ]);
  if (boundElsewhere && !walletEquals(boundElsewhere.wallet_address, wallet)) {
    throw new HttpError(403, 'Session bound to another wallet');
  }

  // 5. Record the SIWE subject on this wallet's profile on first authenticated
  //    use (idempotent). Legacy Privy DIDs are migrated to the wallet subject
  //    here. No external ownership lookup is needed — the signature already
  //    proved ownership, so a provider outage can never block an existing user.
  if (profile && !walletEquals(profile.privy_user_id ?? '', sub)) {
    await sb
      .from('profiles')
      .update({ privy_user_id: sub })
      .eq('wallet_address', profile.wallet_address);
  }

  // 6. Return the canonical wallet.
  return wallet;
}
