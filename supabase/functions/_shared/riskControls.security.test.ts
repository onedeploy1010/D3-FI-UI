import { describe, it, expect } from 'vitest';

// Break the chain: solvency.ts pulls turnkey (esm.sh) at import time. We inject
// computeSolvency via deps in every test, so the real one is never called.
import { vi } from 'vitest';
vi.mock('./solvency.ts', () => ({ computeSolvency: async () => ({ ratio: 999 }) }));

import { assertWithdrawAllowed, assertNotPaused, type RiskDeps } from './riskControls.ts';
import { HttpError } from './wallet.ts';

type Rows = Array<{ net_amount_usdt: number }>;

type Canned = {
  pauseRow?: { paused: boolean } | null;
  limitsRow?: Record<string, number> | null;
  userDailyRows?: Rows;
  platformHourlyRows?: Rows;
};

const DEFAULT_LIMITS = {
  max_withdraw_per_tx_usdt: 2000,
  max_user_daily_usdt: 5000,
  max_platform_hourly_usdt: 50000,
  min_solvency_ratio: 1.0,
};

/** Programmable fake Supabase client covering exactly the queries riskControls makes. */
function makeSb(canned: Canned) {
  function builder(table: string) {
    const eqs: Array<[string, unknown]> = [];
    function resolve() {
      if (table === 'system_pause_flags') {
        return { data: canned.pauseRow ?? { paused: false }, error: null };
      }
      if (table === 'risk_limits') {
        return { data: canned.limitsRow ?? DEFAULT_LIMITS, error: null };
      }
      if (table === 'partner_yield_withdrawals') {
        const scopedToWallet = eqs.some(([c]) => c === 'wallet_address');
        const rows = scopedToWallet
          ? (canned.userDailyRows ?? [])
          : (canned.platformHourlyRows ?? []);
        return { data: rows, error: null };
      }
      return { data: null, error: null };
    }
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) => { eqs.push([col, val]); return b; },
      gte: () => b,
      in: () => b,
      maybeSingle: () => Promise.resolve(resolve()),
      then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) =>
        Promise.resolve(resolve()).then(f, r),
    };
    return b;
  }
  // deno-lint-ignore no-explicit-any
  return { from: (table: string) => builder(table) } as any;
}

const okSolvency: RiskDeps = { computeSolvency: async () => ({ ratio: 5 }) };

describe('assertWithdrawAllowed — V-09/V-10 risk controls', () => {
  it('flash_swap paused -> 503', async () => {
    const sb = makeSb({ pauseRow: { paused: true } });
    await expect(
      assertWithdrawAllowed(sb, { walletAddress: '0xabc', amountUsdt: 100 }, okSolvency),
    ).rejects.toMatchObject({ status: 503, message: 'Flash-swap temporarily paused' });
  });

  it('over per-transaction limit -> 400', async () => {
    const sb = makeSb({});
    await expect(
      assertWithdrawAllowed(sb, { walletAddress: '0xabc', amountUsdt: 2500 }, okSolvency),
    ).rejects.toMatchObject({ status: 400, message: 'Exceeds per-transaction limit' });
  });

  it('over per-wallet daily limit -> 429', async () => {
    const sb = makeSb({ userDailyRows: [{ net_amount_usdt: 4900 }] });
    await expect(
      assertWithdrawAllowed(sb, { walletAddress: '0xabc', amountUsdt: 200 }, okSolvency),
    ).rejects.toMatchObject({ status: 429, message: 'Exceeds daily withdrawal limit' });
  });

  it('over platform hourly limit -> 503', async () => {
    const sb = makeSb({ platformHourlyRows: [{ net_amount_usdt: 49900 }] });
    await expect(
      assertWithdrawAllowed(sb, { walletAddress: '0xabc', amountUsdt: 200 }, okSolvency),
    ).rejects.toMatchObject({ status: 503, message: 'Platform hourly withdrawal limit reached' });
  });

  it('solvency ratio below floor -> 503', async () => {
    const sb = makeSb({});
    const lowSolvency: RiskDeps = { computeSolvency: async () => ({ ratio: 0.5 }) };
    await expect(
      assertWithdrawAllowed(sb, { walletAddress: '0xabc', amountUsdt: 100 }, lowSolvency),
    ).rejects.toMatchObject({ status: 503, message: 'Solvency guard: withdrawals paused' });
  });

  it('solvency report unavailable (throws) -> block 503 (fail-safe)', async () => {
    const sb = makeSb({});
    const brokenSolvency: RiskDeps = {
      computeSolvency: async () => { throw new Error('rpc down'); },
    };
    await expect(
      assertWithdrawAllowed(sb, { walletAddress: '0xabc', amountUsdt: 100 }, brokenSolvency),
    ).rejects.toMatchObject({ status: 503, message: 'Solvency guard: withdrawals paused' });
  });

  it('no-liability sentinel (ratio -1) -> allowed', async () => {
    const sb = makeSb({});
    const noLiability: RiskDeps = { computeSolvency: async () => ({ ratio: -1 }) };
    await expect(
      assertWithdrawAllowed(sb, { walletAddress: '0xabc', amountUsdt: 100 }, noLiability),
    ).resolves.toBeUndefined();
  });

  it('all guards clear -> resolves', async () => {
    const sb = makeSb({
      userDailyRows: [{ net_amount_usdt: 100 }],
      platformHourlyRows: [{ net_amount_usdt: 1000 }],
    });
    await expect(
      assertWithdrawAllowed(sb, { walletAddress: '0xabc', amountUsdt: 500 }, okSolvency),
    ).resolves.toBeUndefined();
  });

  it('throws HttpError instances (not plain errors)', async () => {
    const sb = makeSb({ pauseRow: { paused: true } });
    await expect(
      assertWithdrawAllowed(sb, { walletAddress: '0xabc', amountUsdt: 100 }, okSolvency),
    ).rejects.toBeInstanceOf(HttpError);
  });
});

describe('assertNotPaused', () => {
  it('resolves when flag not paused', async () => {
    const sb = makeSb({ pauseRow: { paused: false } });
    await expect(assertNotPaused(sb, 'flash_swap')).resolves.toBeUndefined();
  });

  it('throws 503 when flag paused', async () => {
    const sb = makeSb({ pauseRow: { paused: true } });
    await expect(assertNotPaused(sb, 'flash_swap')).rejects.toMatchObject({ status: 503 });
  });
});
