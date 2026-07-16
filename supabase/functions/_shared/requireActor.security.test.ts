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

function reqNoHeader(): Request {
  return new Request('http://localhost/treasury/partner/yield-withdraw', {
    method: 'POST',
  });
}

/**
 * Injected SIWE session seam. Under SIWE, ownership is proven by the wallet's
 * login signature; the seam stands in for verifying X-Session-Token and returns
 * the proven, lowercased wallet address (or throws HttpError(401)).
 */
const sessionFor = (wallet: string) => async () => wallet.toLowerCase();
const sessionUnauthorized = async () => {
  throw new HttpError(401, 'Session token required (X-Session-Token)');
};

describe('requireActorWallet (V-01/F2, SIWE)', () => {
  it('returns the proven session wallet when no X-Wallet-Address header is sent', async () => {
    const sb = makeSb([{ wallet_address: OWNER_WALLET, privy_user_id: OWNER_WALLET }]);
    const result = await requireActorWallet(sb as never, reqNoHeader(), {
      verifySession: sessionFor(OWNER_WALLET),
    });
    expect(result).toBe(OWNER_WALLET.toLowerCase());
    expect(sb._updates).toHaveLength(0);
  });

  it('returns the header wallet (checksum casing) when it matches the session', async () => {
    const sb = makeSb([{ wallet_address: OWNER_WALLET, privy_user_id: OWNER_WALLET }]);
    const result = await requireActorWallet(sb as never, reqWith(OWNER_WALLET), {
      verifySession: sessionFor(OWNER_WALLET),
    });
    expect(result).toBe(OWNER_WALLET);
  });

  it('rejects (403) when the X-Wallet-Address header disagrees with the session', async () => {
    const sb = makeSb([{ wallet_address: OWNER_WALLET, privy_user_id: OWNER_WALLET }]);
    await expect(
      requireActorWallet(sb as never, reqWith(OTHER_WALLET), {
        verifySession: sessionFor(OWNER_WALLET),
      }),
    ).rejects.toMatchObject({ status: 403, message: 'Wallet header does not match session' });
  });

  it('binds an unbound profile to the SIWE subject on first authenticated use', async () => {
    const sb = makeSb([{ wallet_address: UNBOUND_WALLET, privy_user_id: null }]);
    const result = await requireActorWallet(sb as never, reqWith(UNBOUND_WALLET), {
      verifySession: sessionFor(UNBOUND_WALLET),
    });
    expect(result).toBe(UNBOUND_WALLET);
    expect(sb._rows[0].privy_user_id).toBe(UNBOUND_WALLET.toLowerCase());
    expect(sb._updates).toHaveLength(1);
  });

  it('migrates a legacy Privy DID binding to the wallet subject', async () => {
    const sb = makeSb([{ wallet_address: OWNER_WALLET, privy_user_id: 'did:privy:legacy' }]);
    const result = await requireActorWallet(sb as never, reqWith(OWNER_WALLET), {
      verifySession: sessionFor(OWNER_WALLET),
    });
    expect(result).toBe(OWNER_WALLET);
    expect(sb._rows[0].privy_user_id).toBe(OWNER_WALLET.toLowerCase());
    expect(sb._updates).toHaveLength(1);
  });

  it('does not re-bind a profile already recorded against its own subject', async () => {
    const sb = makeSb([
      { wallet_address: OWNER_WALLET, privy_user_id: OWNER_WALLET.toLowerCase() },
    ]);
    const result = await requireActorWallet(sb as never, reqWith(OWNER_WALLET), {
      verifySession: sessionFor(OWNER_WALLET),
    });
    expect(result).toBe(OWNER_WALLET);
    expect(sb._updates).toHaveLength(0);
  });

  it('rejects (403) when the session subject is already bound to another wallet', async () => {
    const sb = makeSb([
      { wallet_address: OTHER_WALLET, privy_user_id: OWNER_WALLET.toLowerCase() },
    ]);
    await expect(
      requireActorWallet(sb as never, reqNoHeader(), {
        verifySession: sessionFor(OWNER_WALLET),
      }),
    ).rejects.toMatchObject({ status: 403, message: 'Session bound to another wallet' });
  });

  it('handles a brand-new user (no profile) with only a proven session', async () => {
    const sb = makeSb([]);
    const result = await requireActorWallet(sb as never, reqWith(OWNER_WALLET), {
      verifySession: sessionFor(OWNER_WALLET),
    });
    expect(result).toBe(OWNER_WALLET);
    // No profile to bind yet; created downstream by the route.
    expect(sb._updates).toHaveLength(0);
  });

  it('fails CLOSED with 401 when there is no valid SIWE session', async () => {
    const sb = makeSb([]);
    await expect(
      requireActorWallet(sb as never, reqWith(OWNER_WALLET), {
        verifySession: sessionUnauthorized,
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
