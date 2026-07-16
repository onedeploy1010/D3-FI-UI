import { describe, it, expect } from 'vitest';
import {
  assertPriceWithinGuardrails,
  getD3PriceUsdt,
  D3_PRICE_DEFAULT_USDT,
} from './d3Price.ts';

/**
 * V-05 regression suite: the D3 price is a single unbounded mutable row. A low
 * price inflates minted D3 and drains payouts, so the guardrail helper must
 * reject unsafe prices and value-bearing reads must fail closed on stale prices.
 */

/**
 * Minimal Supabase query-builder mock supporting the chain used by getD3PriceInfo:
 *   sb.from(t).select(cols).eq(col, val).maybeSingle()
 */
function mockSb(row: Record<string, unknown> | null, error: unknown = null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: row, error }),
  };
  return { from: () => builder } as unknown as Parameters<typeof getD3PriceUsdt>[0];
}

describe('assertPriceWithinGuardrails', () => {
  it('rejects non-positive / non-finite prices (0, -1, NaN, Infinity)', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => assertPriceWithinGuardrails(bad, {})).toThrow(/D3 price/i);
    }
  });

  it('rejects a price below the configured minimum', () => {
    expect(() => assertPriceWithinGuardrails(0.5, { min: 1 })).toThrow(/below minimum/i);
  });

  it('rejects a price above the configured maximum', () => {
    expect(() => assertPriceWithinGuardrails(100, { max: 10 })).toThrow(/above maximum/i);
  });

  it('rejects a jump exceeding maxDeviationPct (prev=5, price=0.01, dev=20)', () => {
    expect(() =>
      assertPriceWithinGuardrails(0.01, { prev: 5, maxDeviationPct: 20 }),
    ).toThrow(/deviation/i);
  });

  it('rejects a large upward jump too (both directions blocked)', () => {
    expect(() =>
      assertPriceWithinGuardrails(10, { prev: 5, maxDeviationPct: 20 }),
    ).toThrow(/deviation/i);
  });

  it('accepts a small change within the deviation limit', () => {
    // 5 -> 5.5 is a 10% move, under the 20% cap.
    expect(() =>
      assertPriceWithinGuardrails(5.5, { prev: 5, maxDeviationPct: 20 }),
    ).not.toThrow();
  });

  it('accepts a valid in-bounds price', () => {
    expect(() =>
      assertPriceWithinGuardrails(5, { min: 1, max: 10, prev: 5, maxDeviationPct: 20 }),
    ).not.toThrow();
  });

  it('exposes a machine-readable error code on the thrown error', () => {
    try {
      assertPriceWithinGuardrails(0, {});
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as { body?: { code?: string } }).body?.code).toBe('D3_PRICE_INVALID');
    }
  });
});

describe('getD3PriceUsdt staleness (fail-closed)', () => {
  it('throws when expires_at is in the past', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const sb = mockSb({ price_usdt: 5, source: 'admin_const', updated_at: null, expires_at: past });
    await expect(getD3PriceUsdt(sb)).rejects.toThrow(/stale/i);
  });

  it('returns the price when expires_at is in the future', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const sb = mockSb({ price_usdt: 7, source: 'admin_const', updated_at: null, expires_at: future });
    await expect(getD3PriceUsdt(sb)).resolves.toBe(7);
  });

  it('returns the price when expires_at is null (no freshness window)', async () => {
    const sb = mockSb({ price_usdt: 6, source: 'admin_const', updated_at: null, expires_at: null });
    await expect(getD3PriceUsdt(sb)).resolves.toBe(6);
  });

  it('allows a stale read when allowStale is true (display path)', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const sb = mockSb({ price_usdt: 5, source: 'admin_const', updated_at: null, expires_at: past });
    await expect(getD3PriceUsdt(sb, { allowStale: true })).resolves.toBe(5);
  });

  it('falls back to the default price (fresh) when the row is missing', async () => {
    const sb = mockSb(null);
    await expect(getD3PriceUsdt(sb)).resolves.toBe(D3_PRICE_DEFAULT_USDT);
  });
});
