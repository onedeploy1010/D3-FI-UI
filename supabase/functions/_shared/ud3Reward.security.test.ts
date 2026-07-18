import { describe, it, expect } from 'vitest';
import Decimal from 'npm:decimal.js@10';
import {
  calculateUd3TierDifferenceRewards,
  ud3TierRewardIdempotencyKey,
  type CalculateUd3TierDifferenceRewardsInput,
  type CalculateUd3TierDifferenceRewardsResult,
  type Ud3NetworkAncestor,
} from './ud3Reward.ts';
import {
  UD3_REWARD_CONFIG_V3,
  UD3_ALGO_VERSION_V3,
  getUd3RewardConfig,
  validateUd3Config,
  tierRank,
  incrementalRate,
  type Ud3RewardConfig,
  type Ud3TierDef,
} from './ud3RewardConfig.ts';

/**
 * Fund-safety regression suite for the UD3 V3 tier-difference reward split. UD3 is
 * money: an off-by-a-rounding-tail split silently mints or burns value. These
 * vectors pin the EXACT spec numbers (Decimal string equality) and assert exact
 * conservation (allocated + unallocated == networkTotalCalculated), no negatives,
 * and the per-tier nearest-qualified-ancestor matching rule.
 */

const VERSION = UD3_REWARD_CONFIG_V3.version;
const D = (v: Decimal.Value) => new Decimal(v);

/** Build ancestors from tier codes at increasing depth (nearest first). */
function anc(
  rows: Array<{ code: string; eligible?: boolean }>,
  startDepth = 1,
): Ud3NetworkAncestor[] {
  return rows.map((r, i) => ({
    userId: `anc-${i}`,
    relationDepth: startDepth + i,
    tierCode: r.code,
    tierRank: tierRank(r.code),
    isRewardEligible: r.eligible ?? true,
  }));
}

/** rewardTierCode -> tier reward row. */
function byTier(r: CalculateUd3TierDifferenceRewardsResult) {
  const m: Record<string, CalculateUd3TierDifferenceRewardsResult['tierRewards'][number]> = {};
  for (const row of r.tierRewards) m[row.rewardTierCode] = row;
  return m;
}

/** receiverUserId -> summed rewardAmount over CALCULATED slots. */
function receiverTotals(r: CalculateUd3TierDifferenceRewardsResult): Record<string, string> {
  const totals: Record<string, Decimal> = {};
  for (const row of r.tierRewards) {
    if (row.status === 'CALCULATED' && row.receiverUserId) {
      totals[row.receiverUserId] = (totals[row.receiverUserId] ?? new Decimal(0)).plus(row.rewardAmount);
    }
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(totals)) out[k] = v.toString();
  return out;
}

/** Exact conservation + non-negativity on any result. */
function assertInvariants(r: CalculateUd3TierDifferenceRewardsResult) {
  expect(r.networkAllocated.plus(r.networkUnallocated).toString()).toBe(
    r.networkTotalCalculated.toString(),
  );
  expect(r.guideReward.rewardAmount.isNegative()).toBe(false);
  for (const row of r.tierRewards) {
    expect(row.rewardAmount.isNegative()).toBe(false);
  }
}

function baseInput(
  overrides: Partial<CalculateUd3TierDifferenceRewardsInput>,
): CalculateUd3TierDifferenceRewardsInput {
  return {
    orderId: 'o',
    principalAmount: D(1000),
    guideUserId: null,
    guideTierCode: null,
    networkAncestors: [],
    configVersion: VERSION,
    ...overrides,
  };
}

// Canonical per-tier amounts for principal 1000 (spec vectors).
const TIER_AMOUNTS: Record<string, string> = {
  S1: '80', S2: '88', S3: '72', S4: '78', S5: '84', S6: '90',
};
const TIER_TOTAL = '492';

describe('calculateUd3TierDifferenceRewards — per-tier amounts', () => {
  it('principal 1000 → S1=80,S2=88,S3=72,S4=78,S5=84,S6=90; total 492', () => {
    const r = calculateUd3TierDifferenceRewards(
      baseInput({
        orderId: 'amt',
        networkAncestors: anc([{ code: 'S6' }]), // single S6 absorbs all → all CALCULATED
      }),
    );
    const t = byTier(r);
    expect(t.S1.rewardAmount.toString()).toBe('80');
    expect(t.S2.rewardAmount.toString()).toBe('88');
    expect(t.S3.rewardAmount.toString()).toBe('72');
    expect(t.S4.rewardAmount.toString()).toBe('78');
    expect(t.S5.rewardAmount.toString()).toBe('84');
    expect(t.S6.rewardAmount.toString()).toBe('90');
    expect(r.networkTotalCalculated.toString()).toBe('492');
    assertInvariants(r);
  });
});

describe('calculateUd3TierDifferenceRewards — spec vectors', () => {
  it('Test 1: full chain S1..S6 all eligible → each tier to its own depth user', () => {
    const r = calculateUd3TierDifferenceRewards(
      baseInput({
        orderId: 't1',
        networkAncestors: anc([
          { code: 'S1' }, { code: 'S2' }, { code: 'S3' },
          { code: 'S4' }, { code: 'S5' }, { code: 'S6' },
        ]),
      }),
    );
    const t = byTier(r);
    // A..F = anc-0..anc-5
    expect(t.S1.receiverUserId).toBe('anc-0'); // A
    expect(t.S2.receiverUserId).toBe('anc-1'); // B
    expect(t.S3.receiverUserId).toBe('anc-2'); // C
    expect(t.S4.receiverUserId).toBe('anc-3'); // D
    expect(t.S5.receiverUserId).toBe('anc-4'); // E (S5)
    expect(t.S6.receiverUserId).toBe('anc-5'); // F (S6)
    expect(r.tierRewards.every((x) => x.status === 'CALCULATED')).toBe(true);
    expect(r.networkTotalCalculated.toString()).toBe(TIER_TOTAL);
    expect(r.networkAllocated.toString()).toBe(TIER_TOTAL);
    assertInvariants(r);
  });

  it('Test 2 (十节): S1,S1,S3,S4,S6 → A=80, C=160, D=78, E=174; B nothing; total 492', () => {
    // A=anc-0 S1(d1), B=anc-1 S1(d2), C=anc-2 S3(d3), D=anc-3 S4(d4), E=anc-4 S6(d5)
    const r = calculateUd3TierDifferenceRewards(
      baseInput({
        orderId: 't2',
        networkAncestors: anc([
          { code: 'S1' }, { code: 'S1' }, { code: 'S3' },
          { code: 'S4' }, { code: 'S6' },
        ]),
      }),
    );
    const t = byTier(r);
    expect(t.S1.receiverUserId).toBe('anc-0'); // A
    expect(t.S2.receiverUserId).toBe('anc-2'); // C
    expect(t.S3.receiverUserId).toBe('anc-2'); // C
    expect(t.S4.receiverUserId).toBe('anc-3'); // D
    expect(t.S5.receiverUserId).toBe('anc-4'); // E
    expect(t.S6.receiverUserId).toBe('anc-4'); // E

    const totals = receiverTotals(r);
    expect(totals['anc-0']).toBe('80');  // A
    expect(totals['anc-2']).toBe('160'); // C = 88 + 72
    expect(totals['anc-3']).toBe('78');  // D
    expect(totals['anc-4']).toBe('174'); // E = 84 + 90
    // B (anc-1, S1 at d2) receives nothing — S1 taken by nearer A.
    expect(totals['anc-1']).toBeUndefined();

    expect(r.networkTotalCalculated.toString()).toBe(TIER_TOTAL);
    expect(r.networkAllocated.toString()).toBe(TIER_TOTAL);
    assertInvariants(r);
  });

  it('Test 3: single ancestor S6 → S6 absorbs all six (80/88/72/78/84/90 = 492)', () => {
    const r = calculateUd3TierDifferenceRewards(
      baseInput({ orderId: 't3', networkAncestors: anc([{ code: 'S6' }]) }),
    );
    expect(r.tierRewards.every((x) => x.receiverUserId === 'anc-0')).toBe(true);
    expect(r.tierRewards.every((x) => x.status === 'CALCULATED')).toBe(true);
    expect(receiverTotals(r)['anc-0']).toBe('492');
    expect(r.networkAllocated.toString()).toBe(TIER_TOTAL);
    assertInvariants(r);
  });

  it('Test 4: S3(d1),S6(d2) → S1,S2,S3 to d1 S3; S4,S5,S6 to d2 S6 (never nearer skipped)', () => {
    const r = calculateUd3TierDifferenceRewards(
      baseInput({ orderId: 't4', networkAncestors: anc([{ code: 'S3' }, { code: 'S6' }]) }),
    );
    const t = byTier(r);
    expect(t.S1.receiverUserId).toBe('anc-0');
    expect(t.S2.receiverUserId).toBe('anc-0');
    expect(t.S3.receiverUserId).toBe('anc-0');
    expect(t.S4.receiverUserId).toBe('anc-1');
    expect(t.S5.receiverUserId).toBe('anc-1');
    expect(t.S6.receiverUserId).toBe('anc-1');
    expect(receiverTotals(r)['anc-0']).toBe('240'); // 80+88+72
    expect(receiverTotals(r)['anc-1']).toBe('252'); // 78+84+90
    assertInvariants(r);
  });

  it('Test 5: S2,S2,S4 → 1st S2 gets S1+S2; 2nd S2 nothing; S4 gets S3+S4; S5,S6 UNALLOCATED', () => {
    const r = calculateUd3TierDifferenceRewards(
      baseInput({
        orderId: 't5',
        networkAncestors: anc([{ code: 'S2' }, { code: 'S2' }, { code: 'S4' }]),
      }),
    );
    const t = byTier(r);
    expect(t.S1.receiverUserId).toBe('anc-0');
    expect(t.S2.receiverUserId).toBe('anc-0');
    expect(t.S3.receiverUserId).toBe('anc-2');
    expect(t.S4.receiverUserId).toBe('anc-2');
    expect(t.S5.status).toBe('UNALLOCATED');
    expect(t.S5.unallocatedReason).toBe('NO_QUALIFIED_ANCESTOR');
    expect(t.S6.status).toBe('UNALLOCATED');
    expect(t.S6.unallocatedReason).toBe('NO_QUALIFIED_ANCESTOR');
    expect(receiverTotals(r)['anc-0']).toBe('168'); // 80+88
    expect(receiverTotals(r)['anc-2']).toBe('150'); // 72+78
    expect(receiverTotals(r)['anc-1']).toBeUndefined();
    expect(r.networkAllocated.toString()).toBe('318'); // 168+150
    expect(r.networkUnallocated.toString()).toBe('174'); // 84+90
    assertInvariants(r);
  });

  it('Test 6: S4,S2,S6 → d1 S4 gets S1+S2+S3+S4; d2 S2 nothing; d3 S6 gets S5+S6', () => {
    const r = calculateUd3TierDifferenceRewards(
      baseInput({
        orderId: 't6',
        networkAncestors: anc([{ code: 'S4' }, { code: 'S2' }, { code: 'S6' }]),
      }),
    );
    const t = byTier(r);
    expect(t.S1.receiverUserId).toBe('anc-0');
    expect(t.S2.receiverUserId).toBe('anc-0');
    expect(t.S3.receiverUserId).toBe('anc-0');
    expect(t.S4.receiverUserId).toBe('anc-0');
    expect(t.S5.receiverUserId).toBe('anc-2');
    expect(t.S6.receiverUserId).toBe('anc-2');
    expect(receiverTotals(r)['anc-0']).toBe('318'); // 80+88+72+78
    expect(receiverTotals(r)['anc-2']).toBe('174'); // 84+90
    expect(receiverTotals(r)['anc-1']).toBeUndefined();
    assertInvariants(r);
  });

  it('Test 7: d1 S4 ineligible + d2 S5 eligible → all S1..S5 to d2 S5; S6 UNALLOCATED', () => {
    const r = calculateUd3TierDifferenceRewards(
      baseInput({
        orderId: 't7',
        networkAncestors: anc([
          { code: 'S4', eligible: false },
          { code: 'S5', eligible: true },
        ]),
      }),
    );
    const t = byTier(r);
    for (const code of ['S1', 'S2', 'S3', 'S4', 'S5']) {
      expect(t[code].receiverUserId).toBe('anc-1'); // d2 S5
      expect(t[code].status).toBe('CALCULATED');
    }
    // d1 (anc-0) skipped entirely (ineligible).
    expect(r.tierRewards.some((x) => x.receiverUserId === 'anc-0')).toBe(false);
    expect(t.S6.status).toBe('UNALLOCATED');
    expect(t.S6.unallocatedReason).toBe('NO_QUALIFIED_ANCESTOR');
    expect(receiverTotals(r)['anc-1']).toBe('402'); // 80+88+72+78+84
    expect(r.networkUnallocated.toString()).toBe('90');
    assertInvariants(r);
  });

  it('Test 8: no ancestors → all six UNALLOCATED with reason EMPTY_REFERRAL_CHAIN', () => {
    const r = calculateUd3TierDifferenceRewards(baseInput({ orderId: 't8', networkAncestors: [] }));
    expect(r.tierRewards.every((x) => x.status === 'UNALLOCATED')).toBe(true);
    expect(r.tierRewards.every((x) => x.unallocatedReason === 'EMPTY_REFERRAL_CHAIN')).toBe(true);
    expect(r.networkAllocated.toString()).toBe('0');
    expect(r.networkUnallocated.toString()).toBe(TIER_TOTAL);
    assertInvariants(r);
  });

  it('ALL_MATCHED_USERS_INELIGIBLE when a qualified-rank ancestor exists but is ineligible', () => {
    const r = calculateUd3TierDifferenceRewards(
      baseInput({
        orderId: 'inelig',
        networkAncestors: anc([{ code: 'S6', eligible: false }]),
      }),
    );
    expect(r.tierRewards.every((x) => x.status === 'UNALLOCATED')).toBe(true);
    expect(r.tierRewards.every((x) => x.unallocatedReason === 'ALL_MATCHED_USERS_INELIGIBLE')).toBe(true);
    assertInvariants(r);
  });
});

describe('calculateUd3TierDifferenceRewards — guide ladder (independent)', () => {
  it('guide S1 → 1000×0.6×1.00 = 600; guide S6 → 1000×0.6×1.50 = 900', () => {
    const r1 = calculateUd3TierDifferenceRewards(
      baseInput({ orderId: 'g1', guideUserId: 'g', guideTierCode: 'S1' }),
    );
    expect(r1.guideReward.rewardAmount.toString()).toBe('600');
    expect(r1.guideReward.coefficient.toString()).toBe('1');

    const r6 = calculateUd3TierDifferenceRewards(
      baseInput({ orderId: 'g6', guideUserId: 'g', guideTierCode: 'S6' }),
    );
    expect(r6.guideReward.rewardAmount.toString()).toBe('900');
    expect(r6.guideReward.coefficient.toString()).toBe('1.5');
  });

  it('no guide → guideReward 0 with null user/tier', () => {
    const r = calculateUd3TierDifferenceRewards(
      baseInput({ orderId: 'gn', guideUserId: null, guideTierCode: null }),
    );
    expect(r.guideReward.rewardAmount.toString()).toBe('0');
    expect(r.guideReward.userId).toBeNull();
    expect(r.guideReward.tierCode).toBeNull();
  });
});

describe('config — incremental derivation & validation', () => {
  it('Test 9: cumulative 0.20/0.40/0.55/0.70/0.85/1.00 → incremental 0.2/0.2/0.15/0.15/0.15/0.15', () => {
    expect(incrementalRate('S1').toString()).toBe('0.2');
    expect(incrementalRate('S2').toString()).toBe('0.2');
    expect(incrementalRate('S3').toString()).toBe('0.15');
    expect(incrementalRate('S4').toString()).toBe('0.15');
    expect(incrementalRate('S5').toString()).toBe('0.15');
    expect(incrementalRate('S6').toString()).toBe('0.15');
    // Same derivation surfaced on the tier rows.
    const r = calculateUd3TierDifferenceRewards(
      baseInput({ orderId: 'inc', networkAncestors: anc([{ code: 'S6' }]) }),
    );
    expect(r.tierRewards.map((x) => x.incrementalRate.toString())).toEqual([
      '0.2', '0.2', '0.15', '0.15', '0.15', '0.15',
    ]);
  });

  it('the shipped V3 config passes validateUd3Config', () => {
    expect(() => validateUd3Config(UD3_REWARD_CONFIG_V3)).not.toThrow();
    expect(getUd3RewardConfig().version).toBe(VERSION);
    expect(getUd3RewardConfig().algorithmVersion).toBe(UD3_ALGO_VERSION_V3);
  });

  it('Test 10: cumulative 0.20/0.40/0.35/... (non-monotonic) → validateUd3Config throws', () => {
    const tiers: Ud3TierDef[] = UD3_REWARD_CONFIG_V3.tiers.map((t) => ({ ...t }));
    tiers[2] = { ...tiers[2], cumulativeRate: new Decimal('0.35') }; // S3 dips below S2 (0.40)
    const bad: Ud3RewardConfig = { ...UD3_REWARD_CONFIG_V3, tiers };
    expect(() => validateUd3Config(bad)).toThrow(/non-decreasing/i);
  });

  it('validateUd3Config rejects a non-Decimal rate', () => {
    const bad = {
      ...UD3_REWARD_CONFIG_V3,
      networkRate: 0.4 as unknown as Decimal,
    } as Ud3RewardConfig;
    expect(() => validateUd3Config(bad)).toThrow(/Decimal/i);
  });
});

describe('ud3TierRewardIdempotencyKey', () => {
  it('Test 11: builds the exact key format', () => {
    expect(ud3TierRewardIdempotencyKey('order1', 'S3', UD3_ALGO_VERSION_V3)).toBe(
      `UD3_TIER_REWARD:order1:S3:${UD3_ALGO_VERSION_V3}`,
    );
    expect(ud3TierRewardIdempotencyKey('o', 'S6', 'vX')).toBe('UD3_TIER_REWARD:o:S6:vX');
    // Defaults to the V3 algorithm version.
    expect(ud3TierRewardIdempotencyKey('o', 'S1')).toBe(
      `UD3_TIER_REWARD:o:S1:${UD3_ALGO_VERSION_V3}`,
    );
  });
});

describe('conservation & matching property (deterministic)', () => {
  it('Test 12: over a seeded batch — each tier ≤ once, exact split, no negatives, nearest-eligible rule', () => {
    const codes = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

    for (let i = 0; i < 500; i++) {
      // Deterministic LCG seeded by the iteration index (NOT Math.random).
      let state = (i * 2654435761 + 12345) & 0x7fffffff;
      const next = () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      };

      const principal = D(Math.floor(next() * 5_000_000) + 1).div(1000);
      const chainLen = Math.floor(next() * 9); // 0..8
      const rows: Array<{ code: string; eligible?: boolean }> = [];
      for (let d = 0; d < chainLen; d++) {
        rows.push({
          code: codes[Math.floor(next() * codes.length)],
          eligible: next() < 0.75,
        });
      }
      const ancestors = anc(rows);

      const guideOn = next() < 0.5;
      const r = calculateUd3TierDifferenceRewards({
        orderId: `prop-${i}`,
        principalAmount: principal,
        guideUserId: guideOn ? `g-${i}` : null,
        guideTierCode: guideOn ? codes[Math.floor(next() * codes.length)] : null,
        networkAncestors: ancestors,
        configVersion: VERSION,
      });

      // Exact conservation.
      expect(r.networkAllocated.plus(r.networkUnallocated).toString()).toBe(
        r.networkTotalCalculated.toString(),
      );
      // Sum of per-tier amounts equals reported total.
      const rowSum = r.tierRewards.reduce((s, x) => s.plus(x.rewardAmount), new Decimal(0));
      expect(rowSum.toString()).toBe(r.networkTotalCalculated.toString());

      // No negatives.
      expect(r.guideReward.rewardAmount.isNegative()).toBe(false);
      for (const row of r.tierRewards) expect(row.rewardAmount.isNegative()).toBe(false);

      // Each rewardTierCode appears exactly once (matched at most once).
      const seenCodes = new Set(r.tierRewards.map((x) => x.rewardTierCode));
      expect(seenCodes.size).toBe(r.tierRewards.length);
      expect(r.tierRewards.length).toBe(codes.length);

      const sorted = [...ancestors].sort((a, b) => a.relationDepth - b.relationDepth);
      for (const row of r.tierRewards) {
        if (row.status === 'CALCULATED') {
          // Receiver rank >= slot rank and eligible.
          expect(row.receiverTierRank).not.toBeNull();
          expect(row.receiverTierRank! >= row.rewardTierRank).toBe(true);
          const rec = sorted.find((a) => a.userId === row.receiverUserId)!;
          expect(rec.isRewardEligible).toBe(true);
          // Must be the NEAREST such eligible ancestor: no earlier ancestor qualifies+eligible.
          const nearest = sorted.find(
            (a) => a.tierRank >= row.rewardTierRank && a.isRewardEligible === true,
          );
          expect(nearest!.userId).toBe(row.receiverUserId);
        } else {
          expect(row.receiverUserId).toBeNull();
          // No eligible qualified ancestor exists for this slot.
          const anyEligibleQualified = sorted.some(
            (a) => a.tierRank >= row.rewardTierRank && a.isRewardEligible === true,
          );
          expect(anyEligibleQualified).toBe(false);
        }
      }
    }
  });
});
