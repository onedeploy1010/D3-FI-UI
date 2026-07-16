import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertMoneyAmount,
  MONEY_AMOUNT_MAX,
  requireActorWallet,
} from './requireActor.ts';
import { HttpError } from './wallet.ts';
import { isDemoModeRequest } from './demo.ts';

const OWNER_WALLET = '0x1111111111111111111111111111111111111111';
const OTHER_WALLET = '0x2222222222222222222222222222222222222222';
const UNBOUND_WALLET = '0x3333333333333333333333333333333333333333';

type Profile = { wallet_address: string; privy_user_id: string | null };

/**
 * Minimal fake of the Supabase query builder covering exactly the chains
 * requireActor uses: select().eq().maybeSingle(), select().ilike().maybeSingle(),
 * and update().eq() (awaited directly).
 */
function makeSb(seed: Profile[]) {
  const rows = seed.map((p) => ({ ...p }));
  const updates: Array<{ data: Record<string, unknown>; filters: unknown[] }> = [];

  function matchRow(filters: Array<[string, string, unknown]>): Profile | null {
    return (
      rows.find((row) =>
        filters.every(([op, col, val]) => {
          const cell = (row as Record<string, unknown>)[col];
          if (op === 'ilike') {
            return String(cell ?? '').toLowerCase() === String(val).toLowerCase();
          }
          return cell === val;
        }),
      ) ?? null
    );
  }

  function builder() {
    const filters: Array<[string, string, unknown]> = [];
    let updateData: Record<string, unknown> | null = null;
    const chain: Record<string, unknown> = {
      select() {
        return chain;
      },
      eq(col: string, val: unknown) {
        filters.push(['eq', col, val]);
        return chain;
      },
      ilike(col: string, val: unknown) {
        filters.push(['ilike', col, val]);
        return chain;
      },
      update(data: Record<string, unknown>) {
        updateData = data;
        return chain;
      },
      async maybeSingle() {
        return { data: matchRow(filters), error: null };
      },
      // update().eq(...) is awaited directly — make the chain thenable.
      then(resolve: (v: unknown) => void) {
        if (updateData) {
          const target = matchRow(filters);
          if (target) Object.assign(target, updateData);
          updates.push({ data: updateData, filters: [...filters] });
        }
        resolve({ data: null, error: null });
      },
    };
    return chain;
  }

  return {
    // deno-lint-ignore no-explicit-any
    from: (_table: string) => builder() as any,
    _rows: rows,
    _updates: updates,
  };
}

function reqWith(wallet: string): Request {
  return new Request('http://localhost/treasury/partner/yield-withdraw', {
    method: 'POST',
    headers: { 'x-wallet-address': wallet },
  });
}

// Injected Privy seams: money routes require configured + valid auth.
const configured = () => true;
const verifierFor = (sub: string) => async () => ({ sub }) as { sub: string };

/**
 * Injectable Privy user->wallets lookup used to PROVE ownership before a
 * first-touch bind. Records calls so tests can assert the fast path never
 * hits the network.
 */
function makeWalletLookup(map: Record<string, string[]>) {
  const calls: string[] = [];
  const fn = async (sub: string): Promise<string[]> => {
    calls.push(sub);
    return (map[sub] ?? []).map((w) => w.toLowerCase());
  };
  return Object.assign(fn, { calls });
}

describe('requireActorWallet (V-01/F2)', () => {
  it('rejects when the header wallet is owned by a different Privy sub (403)', async () => {
    const sb = makeSb([{ wallet_address: OWNER_WALLET, privy_user_id: 'sub-owner' }]);
    const lookup = makeWalletLookup({});
    await expect(
      requireActorWallet(sb as never, reqWith(OWNER_WALLET), {
        privyConfigured: configured,
        verifyPrivy: verifierFor('sub-attacker'),
        getUserWallets: lookup,
      }),
    ).rejects.toMatchObject({ status: 403, message: 'Wallet not owned by caller' });
    // Already bound to a sub -> fast path, no ownership API call.
    expect(lookup.calls).toHaveLength(0);
  });

  it('rejects when the session sub is already bound to another wallet (403)', async () => {
    const sb = makeSb([{ wallet_address: OTHER_WALLET, privy_user_id: 'sub-1' }]);
    await expect(
      requireActorWallet(sb as never, reqWith(OWNER_WALLET), {
        privyConfigured: configured,
        verifyPrivy: verifierFor('sub-1'),
        getUserWallets: makeWalletLookup({ 'sub-1': [OWNER_WALLET] }),
      }),
    ).rejects.toMatchObject({ status: 403, message: 'Session bound to another wallet' });
  });

  it('binds an unbound profile when the header wallet IS one of the Privy user wallets', async () => {
    const sb = makeSb([{ wallet_address: UNBOUND_WALLET, privy_user_id: null }]);
    const lookup = makeWalletLookup({ 'sub-new': [UNBOUND_WALLET] });
    const result = await requireActorWallet(sb as never, reqWith(UNBOUND_WALLET), {
      privyConfigured: configured,
      verifyPrivy: verifierFor('sub-new'),
      getUserWallets: lookup,
    });
    expect(result).toBe(UNBOUND_WALLET);
    expect(sb._rows[0].privy_user_id).toBe('sub-new');
    expect(sb._updates).toHaveLength(1);
    expect(lookup.calls).toEqual(['sub-new']);
  });

  it('rejects the takeover: unbound profile but header wallet NOT in Privy wallets (403)', async () => {
    // Attacker with a fresh Privy account tries to claim a null-binding profile
    // that referral-sync pre-created for a wallet they do not control.
    const sb = makeSb([{ wallet_address: UNBOUND_WALLET, privy_user_id: null }]);
    const lookup = makeWalletLookup({ 'sub-attacker': [OTHER_WALLET] });
    await expect(
      requireActorWallet(sb as never, reqWith(UNBOUND_WALLET), {
        privyConfigured: configured,
        verifyPrivy: verifierFor('sub-attacker'),
        getUserWallets: lookup,
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Wallet not linked to this Privy account',
    });
    // Must NOT have bound the profile.
    expect(sb._rows[0].privy_user_id).toBeNull();
    expect(sb._updates).toHaveLength(0);
  });

  it('binds a brand-new user (no profile) when the header wallet is proven owned', async () => {
    const sb = makeSb([]);
    const lookup = makeWalletLookup({ 'sub-fresh': [OWNER_WALLET] });
    const result = await requireActorWallet(sb as never, reqWith(OWNER_WALLET), {
      privyConfigured: configured,
      verifyPrivy: verifierFor('sub-fresh'),
      getUserWallets: lookup,
    });
    expect(result).toBe(OWNER_WALLET);
    expect(sb._updates).toHaveLength(0);
    expect(lookup.calls).toEqual(['sub-fresh']);
  });

  it('rejects a brand-new user whose header wallet is not one of their Privy wallets (403)', async () => {
    const sb = makeSb([]);
    const lookup = makeWalletLookup({ 'sub-fresh': [OTHER_WALLET] });
    await expect(
      requireActorWallet(sb as never, reqWith(OWNER_WALLET), {
        privyConfigured: configured,
        verifyPrivy: verifierFor('sub-fresh'),
        getUserWallets: lookup,
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Wallet not linked to this Privy account',
    });
  });

  it('accepts a matching bound profile without re-binding OR calling Privy', async () => {
    const sb = makeSb([{ wallet_address: OWNER_WALLET, privy_user_id: 'sub-owner' }]);
    const lookup = makeWalletLookup({ 'sub-owner': [OWNER_WALLET] });
    const result = await requireActorWallet(sb as never, reqWith(OWNER_WALLET), {
      privyConfigured: configured,
      verifyPrivy: verifierFor('sub-owner'),
      getUserWallets: lookup,
    });
    expect(result).toBe(OWNER_WALLET);
    expect(sb._updates).toHaveLength(0);
    // Fast path: ownership already proven previously -> no Privy outage exposure.
    expect(lookup.calls).toHaveLength(0);
  });

  it('fails CLOSED with 503 when the Privy ownership lookup throws on first touch', async () => {
    const sb = makeSb([{ wallet_address: UNBOUND_WALLET, privy_user_id: null }]);
    const lookup = async (): Promise<string[]> => {
      throw new Error('privy api down');
    };
    await expect(
      requireActorWallet(sb as never, reqWith(UNBOUND_WALLET), {
        privyConfigured: configured,
        verifyPrivy: verifierFor('sub-new'),
        getUserWallets: lookup,
      }),
    ).rejects.toMatchObject({ status: 503, message: 'Cannot verify wallet ownership' });
    // Did not bind on unverified.
    expect(sb._rows[0].privy_user_id).toBeNull();
    expect(sb._updates).toHaveLength(0);
  });

  it('fails CLOSED with 503 when Privy is unconfigured on a money route', async () => {
    const sb = makeSb([{ wallet_address: OWNER_WALLET, privy_user_id: null }]);
    await expect(
      requireActorWallet(sb as never, reqWith(OWNER_WALLET), {
        privyConfigured: () => false,
        verifyPrivy: verifierFor('whatever'),
      }),
    ).rejects.toMatchObject({ status: 503, message: 'Auth not configured' });
  });

  it('throws 401 when configured but the token yields no sub', async () => {
    const sb = makeSb([]);
    await expect(
      requireActorWallet(sb as never, reqWith(OWNER_WALLET), {
        privyConfigured: configured,
        // deno-lint-ignore no-explicit-any
        verifyPrivy: async () => null as any,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('assertMoneyAmount (V-15)', () => {
  it('rejects invalid amounts', () => {
    for (const bad of [Infinity, -Infinity, NaN, 0, -1, MONEY_AMOUNT_MAX + 1]) {
      expect(() => assertMoneyAmount(bad)).toThrow(HttpError);
    }
    // non-number inputs are rejected too
    expect(() => assertMoneyAmount('100' as never)).toThrow(HttpError);
    expect(() => assertMoneyAmount(undefined as never)).toThrow(HttpError);
  });

  it('accepts a valid positive finite amount and returns it', () => {
    expect(assertMoneyAmount(5000)).toBe(5000);
    expect(assertMoneyAmount(0.1)).toBe(0.1);
    expect(assertMoneyAmount(MONEY_AMOUNT_MAX)).toBe(MONEY_AMOUNT_MAX);
  });

  it('honors a custom max', () => {
    expect(() => assertMoneyAmount(11, { max: 10 })).toThrow(HttpError);
    expect(assertMoneyAmount(10, { max: 10 })).toBe(10);
  });
});

describe('isDemoModeRequest default-OFF (V-17)', () => {
  const demoWallet =
    process.env.DEMO_WALLET_ADDRESS ?? '0x1234567890abcdef1234567890abcdef12345678';
  const demoReq = () =>
    new Request('http://localhost/treasury/health', {
      headers: { 'x-demo-mode': '1', 'x-wallet-address': demoWallet },
    });

  beforeEach(() => {
    delete process.env.DEMO_MODE_ENABLED;
  });

  it('is false when DEMO_MODE_ENABLED is unset', () => {
    expect(isDemoModeRequest(demoReq())).toBe(false);
  });

  it('is false when DEMO_MODE_ENABLED is anything other than "true"', () => {
    process.env.DEMO_MODE_ENABLED = '1';
    expect(isDemoModeRequest(demoReq())).toBe(false);
    process.env.DEMO_MODE_ENABLED = 'yes';
    expect(isDemoModeRequest(demoReq())).toBe(false);
  });

  it('is true only when explicitly enabled and the demo wallet matches', () => {
    process.env.DEMO_MODE_ENABLED = 'true';
    expect(isDemoModeRequest(demoReq())).toBe(true);
  });
});
