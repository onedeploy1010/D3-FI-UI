import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Decimal from 'npm:decimal.js@10';
import {
  resetAndResettleUd3,
  describeUd3ResetPlan,
  buildUd3RecomputeInput,
} from './ud3Recompute.ts';
import { calculateUd3TierDifferenceRewards } from './ud3Reward.ts';
import { UD3_REWARD_CONFIG_V3 } from './ud3RewardConfig.ts';

/**
 * Fund-safety regression suite for the UD3 RESET + RE-SETTLE engine (V3).
 *
 * This engine wipes production-shaped UD3 data and rebuilds it. The dangerous path
 * (apply) MUST be double-gated and dryrun MUST be strictly read-only. These tests
 * pin: (1) the exact reset plan (what gets deleted / kept / zeroed), (2) the apply
 * guard refuses without BOTH the confirm token AND the env flag — with ZERO writes,
 * (3) dryrun performs no writes at all, and (4) the V3 projection builder resolves
 * the guide 档位 + per-ancestor tier/eligibility and feeds the V3 calculator.
 */

const WRITE_OPS = new Set(['delete', 'update', 'insert', 'upsert', 'rpc']);

type Call = { op: string; table?: string; name?: string; args?: unknown };

function makeSpySb(opts?: { counts?: Record<string, number>; intents?: unknown[] }) {
  const calls: Call[] = [];
  const counts = opts?.counts ?? {};
  const intents = opts?.intents ?? [];

  // deno-lint-ignore no-explicit-any
  const sb: any = {
    rpc: (name: string, args: unknown) => {
      calls.push({ op: 'rpc', name, args });
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      const state: { isCount: boolean } = { isCount: false };
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: (_cols?: string, o?: { count?: string; head?: boolean }) => {
          calls.push({ op: 'select', table });
          if (o?.head) state.isCount = true;
          return b;
        },
        delete: () => { calls.push({ op: 'delete', table }); return b; },
        update: (p: unknown) => { calls.push({ op: 'update', table, args: p }); return b; },
        insert: (p: unknown) => { calls.push({ op: 'insert', table, args: p }); return b; },
        upsert: (p: unknown) => { calls.push({ op: 'upsert', table, args: p }); return b; },
        eq: () => b,
        neq: () => b,
        in: () => b,
        ilike: () => b,
        not: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () => Promise.resolve(resolve()),
        single: () => Promise.resolve(resolve()),
        then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(f, r),
      };
      function resolve() {
        if (state.isCount) return { count: counts[table] ?? 0, data: null, error: null };
        if (table === 'stake_intents') return { data: intents, error: null };
        return { data: [], error: null };
      }
      return b;
    },
  };

  const writes = () => calls.filter((c) => WRITE_OPS.has(c.op));
  return { sb, calls, writes };
}

describe('describeUd3ResetPlan — pure target inventory', () => {
  it('targets exactly the UD3-derived tables, UD3-funded stake kinds, and balance columns', () => {
    const plan = describeUd3ResetPlan();

    // Full-wipe tables (all UD3-derived); note stake_intents / deposits are NOT here.
    expect(plan.deleteAllTables).toEqual([
      'partner_ud3_ledger',
      'partner_ud3_calc_logs',
      'partner_ud3_events',
      'partner_ud3_transfers',
    ]);
    expect(plan.deleteAllTables).not.toContain('stake_intents');
    expect(plan.deleteAllTables).not.toContain('deposit_records');

    // UD3-funded stake positions are removed; USDT-funded positions are kept.
    expect(plan.deletePositionKinds).toEqual(['ud3', 'sd3']);
    expect(plan.keepPositionKinds).toEqual(['partner_join', 'crowdfund_stake']);
    // No overlap — a kept kind can never be a deleted kind.
    for (const k of plan.keepPositionKinds) expect(plan.deletePositionKinds).not.toContain(k);

    // Only the UD3/SD3 balance columns are zeroed.
    expect(plan.accountResetColumns).toEqual([
      'ud3_balance',
      'pending_ud3',
      'lifetime_ud3_earned',
      'sd3_balance',
      'lifetime_sd3_earned',
    ]);

    // Re-settle draws from every CONFIRMED (post-credit) USDT deposit — credited and
    // the swept states it advances into — so already-swept deposits aren't dropped.
    expect(plan.resettleIntentTypes).toEqual(['partner_join', 'crowdfund_stake']);
    expect(plan.resettleStatuses).toEqual(['credited', 'sweep_pending', 'completed']);
  });
});

describe('resetAndResettleUd3 — apply guard (fund safety)', () => {
  beforeEach(() => {
    delete process.env.ALLOW_UD3_RECOMPUTE;
  });
  afterEach(() => {
    delete process.env.ALLOW_UD3_RECOMPUTE;
  });

  it('refuses apply WITHOUT the confirm token — and performs NO reads or writes', async () => {
    process.env.ALLOW_UD3_RECOMPUTE = 'true'; // env satisfied; confirm missing.
    const { sb, calls, writes } = makeSpySb();

    await expect(resetAndResettleUd3(sb, { mode: 'apply' })).rejects.toThrow(/CONFIRM/i);
    // Guard throws before touching the DB at all.
    expect(calls.length).toBe(0);
    expect(writes().length).toBe(0);
  });

  it('refuses apply when ALLOW_UD3_RECOMPUTE !== "true" — and performs NO writes', async () => {
    // Confirm token present, but env flag not set.
    const { sb, calls, writes } = makeSpySb();

    await expect(
      resetAndResettleUd3(sb, { mode: 'apply', confirm: 'UD3-RESET-RESETTLE' }),
    ).rejects.toThrow(/DISABLED/i);
    expect(calls.length).toBe(0);
    expect(writes().length).toBe(0);
  });

  it('refuses apply when the env flag is a near-miss ("TRUE"/"1")', async () => {
    process.env.ALLOW_UD3_RECOMPUTE = 'TRUE';
    const { sb, writes } = makeSpySb();
    await expect(
      resetAndResettleUd3(sb, { mode: 'apply', confirm: 'UD3-RESET-RESETTLE' }),
    ).rejects.toThrow(/DISABLED/i);
    expect(writes().length).toBe(0);
  });
});

describe('resetAndResettleUd3 — dryrun is strictly read-only', () => {
  beforeEach(() => {
    delete process.env.ALLOW_UD3_RECOMPUTE;
  });
  afterEach(() => {
    delete process.env.ALLOW_UD3_RECOMPUTE;
  });

  it('reports reset counts and re-settle scope WITHOUT any delete/update/insert/rpc', async () => {
    const { sb, writes } = makeSpySb({
      counts: {
        partner_ud3_ledger: 42,
        partner_ud3_events: 7,
        partner_ud3_calc_logs: 7,
        partner_ud3_transfers: 3,
        partner_stake_positions: 5,
      },
      intents: [], // no intents → projection loop is skipped; still zero writes.
    });

    const summary = await resetAndResettleUd3(sb, { mode: 'dryrun' });

    expect(summary.mode).toBe('dryrun');
    expect(summary.reset.partner_ud3_ledger).toBe(42);
    expect(summary.reset.partner_ud3_events).toBe(7);
    expect(summary.totals.intents).toBe(0);
    expect(summary.totals.newUd3Paid).toBe('0.000000');
    expect(summary.totals.newUnallocated).toBe('0.000000');

    // The whole point: a dryrun must never mutate anything.
    expect(writes().length).toBe(0);
  });

  it('default mode is dryrun even when apply-only fields are absent (no accidental write)', async () => {
    const { sb, writes } = makeSpySb();
    // deno-lint-ignore no-explicit-any
    const summary = await resetAndResettleUd3(sb, {} as any);
    expect(summary.mode).toBe('dryrun');
    expect(writes().length).toBe(0);
  });
});

describe('buildUd3RecomputeInput — V3 projection', () => {
  it('resolves guide 档位 from perf and per-ancestor tier/rank + eligibility', () => {
    const input = buildUd3RecomputeInput(
      {
        depositUsdt: 1000,
        referrerWallet: '0xREF',
        referrerTotalPerfUsdt: 1000, // ≤100k → S1 guide
        networkChain: [
          { wallet: '0xUP1', tierCode: 'S1', isRewardEligible: true },
          { wallet: '0xUP2', tierCode: 'S2', isRewardEligible: true },
          { wallet: '0xUP3', tierCode: 'S3', isRewardEligible: true },
          { wallet: '0xUP4', tierCode: 'S4', isRewardEligible: true },
          { wallet: '0xUP5', tierCode: 'S5', isRewardEligible: true },
          { wallet: '0xUP6', tierCode: 'S6', isRewardEligible: true },
        ],
      },
      UD3_REWARD_CONFIG_V3,
    );

    expect(input.guideTierCode).toBe('S1');
    expect(input.guideUserId).toBe('0xREF');
    expect(input.principalAmount.toString()).toBe('1000');
    expect(input.configVersion).toBe(UD3_REWARD_CONFIG_V3.version);
    expect(input.networkAncestors.map((a) => a.tierCode)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    expect(input.networkAncestors.map((a) => a.tierRank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(input.networkAncestors.map((a) => a.relationDepth)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(input.networkAncestors.every((a) => a.isRewardEligible)).toBe(true);

    // Feeding it to the V3 calculator yields the expected S1-guide split.
    const result = calculateUd3TierDifferenceRewards(input);
    expect(result.guideReward.rewardAmount.toString()).toBe('600'); // 1000×0.6×1.0
    // network slots 80/88/72/78/84/90 → allocated 492, fully covered (no unallocated).
    expect(result.tierRewards.map((t) => t.rewardAmount.toString())).toEqual([
      '80', '88', '72', '78', '84', '90',
    ]);
    expect(result.networkAllocated.toString()).toBe('492');
    expect(result.networkUnallocated.toString()).toBe('0');
    // Conservation.
    expect(result.networkAllocated.plus(result.networkUnallocated).toString())
      .toBe(result.networkTotalCalculated.toString());
    expect(new Decimal(result.networkUnallocated).isNegative()).toBe(false);
  });

  it('an unmatched high tier slot projects as UNALLOCATED (no qualified ancestor)', () => {
    // Chain only S1..S3 → slots S4..S6 have no rank-qualified ancestor.
    const input = buildUd3RecomputeInput(
      {
        depositUsdt: 1000,
        referrerWallet: '0xREF',
        referrerTotalPerfUsdt: 1000,
        networkChain: [
          { wallet: '0xUP1', tierCode: 'S1', isRewardEligible: true },
          { wallet: '0xUP2', tierCode: 'S2', isRewardEligible: true },
          { wallet: '0xUP3', tierCode: 'S3', isRewardEligible: true },
        ],
      },
      UD3_REWARD_CONFIG_V3,
    );
    const result = calculateUd3TierDifferenceRewards(input);
    expect(result.networkAllocated.toString()).toBe('240'); // 80+88+72
    expect(result.networkUnallocated.toString()).toBe('252'); // 78+84+90
    expect(result.tierRewards.slice(3).every((t) => t.status === 'UNALLOCATED')).toBe(true);
    expect(result.tierRewards.slice(3).every((t) => t.unallocatedReason === 'NO_QUALIFIED_ANCESTOR')).toBe(true);
  });
});
