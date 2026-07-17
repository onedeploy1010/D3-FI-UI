import { describe, it, expect, vi } from 'vitest';

/**
 * R-11 regression: `upsertReferralFromChain` must reject a self-referral (user === upline,
 * case-insensitive) BEFORE writing anything to `referrals`. The on-chain ReferralRegistry
 * already rejects self-edges; this is a defense-in-depth backstop for the DB index cache.
 *
 * referralRegistry.ts imports viem + ./turnkey.ts at module top (heavy, BSC/RPC-backed).
 * The self-referral guard only exercises `walletEquals` (pure, from ./wallet.ts) and never
 * reaches those, so we stub them so the module loads under Node/vitest.
 */
vi.mock('npm:viem@2', () => ({
  getAddress: (a: string) => a,
  parseAbi: () => [],
  parseAbiItem: () => ({}),
}));
vi.mock('./turnkey.ts', () => ({
  getBscPublicClient: () => ({}),
}));

import { upsertReferralFromChain } from './referralRegistry.ts';

type Op = { table: string; op: 'select' | 'update' | 'upsert'; payload?: unknown };

function makeSb() {
  const ops: Op[] = [];

  // deno-lint-ignore no-explicit-any
  const sb: any = {
    from: (table: string) => {
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: () => {
          ops.push({ table, op: 'select' });
          return b;
        },
        update: (p: Record<string, unknown>) => {
          ops.push({ table, op: 'update', payload: p });
          return b;
        },
        upsert: (p: Record<string, unknown>) => {
          ops.push({ table, op: 'upsert', payload: p });
          return b;
        },
        eq: () => b,
        ilike: () => b,
        not: () => b,
        // ensureMinimalProfile resolves the stored wallet from the first select.
        maybeSingle: () => Promise.resolve({ data: { wallet_address: '0xSTORED' }, error: null }),
        then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(f, r),
      };
      return b;
    },
  };
  return { sb, ops };
}

describe('upsertReferralFromChain — R-11 self-referral guard', () => {
  it('self-referral (same address) -> returns early, no referrals write, no profile touch', async () => {
    const { sb, ops } = makeSb();
    await upsertReferralFromChain(sb, '0xABCabc', '0xABCabc');
    expect(ops).toHaveLength(0);
  });

  it('self-referral differing only by case -> still rejected', async () => {
    const { sb, ops } = makeSb();
    await upsertReferralFromChain(sb, '0xAbCdEf0000000000000000000000000000000001', '0xabcdef0000000000000000000000000000000001');
    expect(ops).toHaveLength(0);
  });

  it('distinct user/upline -> proceeds and upserts into referrals', async () => {
    const { sb, ops } = makeSb();
    await upsertReferralFromChain(sb, '0xUSER', '0xSPONSOR');
    // Guard did NOT short-circuit: a referrals upsert must have been issued.
    expect(ops.some((o) => o.table === 'referrals' && o.op === 'upsert')).toBe(true);
  });
});
