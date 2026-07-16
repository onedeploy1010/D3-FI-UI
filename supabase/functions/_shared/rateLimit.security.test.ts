import { describe, it, expect, vi } from 'vitest';
import { enforceRateLimit, windowStartIso } from './rateLimit.ts';

/**
 * V-16 regression: fixed-window rate limiting.
 *
 * The limiter is driven by a controllable fake `sb`. The happy path uses the
 * `increment_rate_limit` RPC and returns the post-increment count; we assert the
 * limiter resolves under the limit, throws 429 over it, and fails OPEN on infra
 * error (so a limiter outage cannot block money flow).
 */

/** Fake sb whose rpc returns a caller-controlled count. */
function fakeSbWithCount(count: number) {
  return {
    rpc: async () => ({ data: count, error: null }),
  } as any;
}

/** Fake sb whose rpc AND fallback both error (infrastructure outage). */
function fakeSbInfraError() {
  return {
    rpc: async () => ({ data: null, error: { message: 'connection refused' } }),
    from: () => {
      throw new Error('db down');
    },
  } as any;
}

describe('windowStartIso', () => {
  it('floors to the start of the fixed window', () => {
    // 90s past an exact minute boundary, window 60s -> floors back to the minute.
    const base = Date.UTC(2026, 6, 16, 12, 0, 0); // :00
    expect(windowStartIso(base + 90_000, 60)).toBe(new Date(base + 60_000).toISOString());
    expect(windowStartIso(base + 59_000, 60)).toBe(new Date(base).toISOString());
  });
});

describe('enforceRateLimit', () => {
  it('under the limit -> resolves', async () => {
    await expect(
      enforceRateLimit(fakeSbWithCount(3), { key: 'route:0xabc', limit: 5, windowSec: 60 }),
    ).resolves.toBeUndefined();
  });

  it('exactly at the limit -> resolves (limit is inclusive)', async () => {
    await expect(
      enforceRateLimit(fakeSbWithCount(5), { key: 'route:0xabc', limit: 5, windowSec: 60 }),
    ).resolves.toBeUndefined();
  });

  it('over the limit -> throws HttpError(429)', async () => {
    try {
      await enforceRateLimit(fakeSbWithCount(6), { key: 'route:0xabc', limit: 5, windowSec: 60 });
      throw new Error('expected enforceRateLimit to throw');
    } catch (e: any) {
      expect(e.status).toBe(429);
      expect(String(e.message)).toContain('Rate limit');
    }
  });

  it('infrastructure error -> fails open (resolves + logs)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      enforceRateLimit(fakeSbInfraError(), { key: 'route:0xabc', limit: 5, windowSec: 60 }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
