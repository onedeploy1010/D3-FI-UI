import { describe, it, expect } from 'vitest';
import Decimal from 'npm:decimal.js@10';
import {
  calculateUd3RewardDistribution,
  ud3RewardIdempotencyKey,
  type CalculateUd3RewardInput,
} from './ud3Reward.ts';
import {
  UD3_REWARD_CONFIG_V2,
  guideLevelRateFor,
  networkCumulativeRateFor,
  getUd3RewardConfig,
  maxNetworkCumulativeRate,
} from './ud3RewardConfig.ts';

/**
 * Fund-safety regression suite for the UD3 reward split. UD3 is money: an
 * off-by-a-rounding-tail split silently mints or burns value. These vectors pin
 * the EXACT spec numbers and assert exact conservation
 * (guide + network + burn == totalBribe) with no negative amounts.
 */

const VERSION = UD3_REWARD_CONFIG_V2.version;
const D = (v: Decimal.Value) => new Decimal(v);

/** Build ancestors from [level, cumulativeRate] pairs at increasing depth. */
function ancestors(rows: Array<[string, string]>, startDepth = 1) {
  return rows.map(([level, rate], i) => ({
    userId: `anc-${i}`,
    relationDepth: startDepth + i,
    level,
    cumulativeRate: D(rate),
  }));
}

/** Assert exact conservation + non-negativity + ceiling on any result. */
function assertInvariants(result: ReturnType<typeof calculateUd3RewardDistribution>) {
  const total = result.guideReward.rewardAmount
    .plus(result.networkRewardTotal)
    .plus(result.burnAmount);
  expect(total.toString()).toBe(result.totalBribeAmount.toString());

  expect(result.guideReward.rewardAmount.isNegative()).toBe(false);
  expect(result.burnAmount.isNegative()).toBe(false);
  for (const row of result.networkRewards) {
    expect(row.rewardAmount.isNegative()).toBe(false);
  }
  const ceiling = result.networkBasePool.times(maxNetworkCumulativeRate(UD3_REWARD_CONFIG_V2));
  expect(result.networkRewardTotal.lte(ceiling)).toBe(true);
}

describe('calculateUd3RewardDistribution — exact spec vectors', () => {
  it('vector 1: full S1..S6 chain → guide 600, network 80/96/88/100/112/124, burn 300', () => {
    const input: CalculateUd3RewardInput = {
      orderId: 'v1',
      principalAmount: D(1000),
      bribeRate: D('1.5'),
      guideUserId: 'guide',
      guideLevel: 'S1',
      guideLevelRate: D('1.0'),
      networkAncestors: ancestors([
        ['S1', '0.20'],
        ['S2', '0.44'],
        ['S3', '0.66'],
        ['S4', '0.91'],
        ['S5', '1.19'],
        ['S6', '1.50'],
      ]),
      levelConfigVersion: VERSION,
    };
    const r = calculateUd3RewardDistribution(input);

    expect(r.totalBribeAmount.toString()).toBe('1500');
    expect(r.guideReward.rewardAmount.toString()).toBe('600');
    expect(r.networkBasePool.toString()).toBe('400');
    expect(r.networkRewards.map((n) => n.rewardAmount.toString())).toEqual([
      '80', '96', '88', '100', '112', '124',
    ]);
    expect(r.networkRewards.every((n) => n.rewardStatus === 'REWARDED')).toBe(true);
    expect(r.networkRewardTotal.toString()).toBe('600');
    expect(r.burnAmount.toString()).toBe('300');
    assertInvariants(r);
  });

  it('vector 1b (总额度按引路人档位): guide S2/110% → total 1650, guide 660, network 600 (fixed base), burn 390', () => {
    const r = calculateUd3RewardDistribution({
      orderId: 'v1b',
      principalAmount: D(1000),
      bribeRate: D('1.5'),
      guideUserId: 'guide',
      guideLevel: 'S2',
      guideLevelRate: D('1.1'),
      networkAncestors: ancestors([
        ['S1', '0.20'], ['S2', '0.44'], ['S3', '0.66'],
        ['S4', '0.91'], ['S5', '1.19'], ['S6', '1.50'],
      ]),
      levelConfigVersion: VERSION,
    });
    // 总额度 = 1000 × 110% × 150% = 1650 ; 引路人 = 1000 × 60% × 110% = 660.
    // 网体基础池固定 = 入金 × 40% = 400 (不随引路人档位放大) ; 满链 = 600.
    expect(r.totalBribeAmount.toString()).toBe('1650');
    expect(r.guideReward.rewardAmount.toString()).toBe('660');
    expect(r.networkBasePool.toString()).toBe('400');
    expect(r.networkRewardTotal.toString()).toBe('600');
    expect(r.burnAmount.toString()).toBe('390');
    assertInvariants(r);
  });

  it('vector 2: S2,S2,S4 → diffs 0.44/0/0.47 → 176/0/188, 2nd is NO_DIFFERENCE', () => {
    const r = calculateUd3RewardDistribution({
      orderId: 'v2',
      principalAmount: D(1000),
      bribeRate: D('1.5'),
      guideUserId: 'guide',
      guideLevel: 'S1',
      guideLevelRate: D('1.0'),
      networkAncestors: ancestors([
        ['S2', '0.44'],
        ['S2', '0.44'],
        ['S4', '0.91'],
      ]),
      levelConfigVersion: VERSION,
    });
    expect(r.networkRewards.map((n) => n.rewardAmount.toString())).toEqual(['176', '0', '188']);
    expect(r.networkRewards.map((n) => n.differenceRate.toString())).toEqual(['0.44', '0', '0.47']);
    expect(r.networkRewards.map((n) => n.rewardStatus)).toEqual([
      'REWARDED', 'NO_DIFFERENCE', 'REWARDED',
    ]);
    expect(r.networkRewardTotal.toString()).toBe('364');
    assertInvariants(r);
  });

  it('vector 3: S4,S2,S6 → diffs 0.91/0/0.59 → 364/0/236', () => {
    const r = calculateUd3RewardDistribution({
      orderId: 'v3',
      principalAmount: D(1000),
      bribeRate: D('1.5'),
      guideUserId: 'guide',
      guideLevel: 'S1',
      guideLevelRate: D('1.0'),
      networkAncestors: ancestors([
        ['S4', '0.91'],
        ['S2', '0.44'],
        ['S6', '1.50'],
      ]),
      levelConfigVersion: VERSION,
    });
    expect(r.networkRewards.map((n) => n.rewardAmount.toString())).toEqual(['364', '0', '236']);
    expect(r.networkRewards.map((n) => n.rewardStatus)).toEqual([
      'REWARDED', 'NO_DIFFERENCE', 'REWARDED',
    ]);
    expect(r.networkRewardTotal.toString()).toBe('600');
    assertInvariants(r);
  });

  it('vector 4: S1,S4,S6 → diffs 0.20/0.71/0.59 → 80/284/236, total 600', () => {
    const r = calculateUd3RewardDistribution({
      orderId: 'v4',
      principalAmount: D(1000),
      bribeRate: D('1.5'),
      guideUserId: 'guide',
      guideLevel: 'S1',
      guideLevelRate: D('1.0'),
      networkAncestors: ancestors([
        ['S1', '0.20'],
        ['S4', '0.91'],
        ['S6', '1.50'],
      ]),
      levelConfigVersion: VERSION,
    });
    expect(r.networkRewards.map((n) => n.rewardAmount.toString())).toEqual(['80', '284', '236']);
    expect(r.networkRewards.map((n) => n.differenceRate.toString())).toEqual([
      '0.2', '0.71', '0.59',
    ]);
    expect(r.networkRewardTotal.toString()).toBe('600');
    assertInvariants(r);
  });

  it('vector 5: no guide → guideReward 0; burn absorbs; conservation holds', () => {
    const r = calculateUd3RewardDistribution({
      orderId: 'v5',
      principalAmount: D(1000),
      bribeRate: D('1.5'),
      guideUserId: null,
      guideLevel: null,
      guideLevelRate: D('1.0'), // ignored → 0 when no guide
      networkAncestors: ancestors([
        ['S1', '0.20'],
        ['S6', '1.50'],
      ]),
      levelConfigVersion: VERSION,
    });
    expect(r.guideReward.rewardAmount.toString()).toBe('0');
    expect(r.guideReward.userId).toBeNull();
    expect(r.guideReward.level).toBeNull();
    // network: 0.20 → 80, then 1.30 diff → 520; total 600.
    expect(r.networkRewardTotal.toString()).toBe('600');
    // burn = 1500 - 0 - 600 = 900.
    expect(r.burnAmount.toString()).toBe('900');
    assertInvariants(r);
  });

  it('vector 6: no ancestors → networkRewardTotal 0; conservation holds', () => {
    const r = calculateUd3RewardDistribution({
      orderId: 'v6',
      principalAmount: D(1000),
      bribeRate: D('1.5'),
      guideUserId: 'guide',
      guideLevel: 'S1',
      guideLevelRate: D('1.0'),
      networkAncestors: [],
      levelConfigVersion: VERSION,
    });
    expect(r.networkRewards).toEqual([]);
    expect(r.networkRewardTotal.toString()).toBe('0');
    expect(r.guideReward.rewardAmount.toString()).toBe('600');
    // burn = 1500 - 600 - 0 = 900.
    expect(r.burnAmount.toString()).toBe('900');
    assertInvariants(r);
  });
});

describe('calculateUd3RewardDistribution — conservation property (deterministic)', () => {
  it('holds over a pseudo-random batch: no negatives, network ≤ ceiling, exact split', () => {
    // Deterministic LCG (Math.random is unavailable in the Deno security harness).
    let state = 123456789;
    const next = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };

    const guideLevels = [null, 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
    const netLevels = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

    for (let i = 0; i < 500; i++) {
      // Principal with up to 6 fractional digits to exercise rounding tails.
      const principal = D(Math.floor(next() * 5_000_000) + 1).div(1000);

      const gl = guideLevels[Math.floor(next() * guideLevels.length)];
      const hasGuide = gl != null;

      const chainLen = Math.floor(next() * 8);
      const chain = [];
      for (let d = 0; d < chainLen; d++) {
        const lvl = netLevels[Math.floor(next() * netLevels.length)];
        chain.push({
          userId: `u-${i}-${d}`,
          relationDepth: d + 1,
          level: lvl,
          cumulativeRate: networkCumulativeRateFor(lvl),
        });
      }
      // Shuffle depths a little so sort/dedupe logic is exercised.
      for (let k = chain.length - 1; k > 0; k--) {
        const j = Math.floor(next() * (k + 1));
        [chain[k].relationDepth, chain[j].relationDepth] = [
          chain[j].relationDepth,
          chain[k].relationDepth,
        ];
      }

      const r = calculateUd3RewardDistribution({
        orderId: `prop-${i}`,
        principalAmount: principal,
        bribeRate: UD3_REWARD_CONFIG_V2.bribeRate,
        guideUserId: hasGuide ? `g-${i}` : null,
        guideLevel: gl,
        guideLevelRate: guideLevelRateFor(gl),
        networkAncestors: chain,
        levelConfigVersion: VERSION,
      });

      const total = r.guideReward.rewardAmount
        .plus(r.networkRewardTotal)
        .plus(r.burnAmount);
      expect(total.toString()).toBe(r.totalBribeAmount.toString());
      expect(r.guideReward.rewardAmount.isNegative()).toBe(false);
      expect(r.networkRewardTotal.isNegative()).toBe(false);
      expect(r.burnAmount.isNegative()).toBe(false);

      const ceiling = r.networkBasePool.times(maxNetworkCumulativeRate(UD3_REWARD_CONFIG_V2));
      expect(r.networkRewardTotal.lte(ceiling)).toBe(true);

      // Sum of per-row amounts must equal the reported network total.
      const rowSum = r.networkRewards.reduce((s, n) => s.plus(n.rewardAmount), new Decimal(0));
      expect(rowSum.toString()).toBe(r.networkRewardTotal.toString());
    }
  });
});

describe('config helpers', () => {
  it('guideLevelRateFor resolves S1..S6 and 0 for null/unknown', () => {
    expect(guideLevelRateFor('S1').toString()).toBe('1');
    expect(guideLevelRateFor('S6').toString()).toBe('1.5');
    expect(guideLevelRateFor(null).toString()).toBe('0');
    expect(guideLevelRateFor('X9').toString()).toBe('0');
  });

  it('networkCumulativeRateFor resolves S0..S6 and 0 for null/unknown', () => {
    expect(networkCumulativeRateFor('S0').toString()).toBe('0');
    expect(networkCumulativeRateFor('S1').toString()).toBe('0.2');
    expect(networkCumulativeRateFor('S6').toString()).toBe('1.5');
    expect(networkCumulativeRateFor(null).toString()).toBe('0');
  });

  it('getUd3RewardConfig returns latest by default and throws on unknown version', () => {
    expect(getUd3RewardConfig().version).toBe(VERSION);
    expect(getUd3RewardConfig(VERSION).version).toBe(VERSION);
    expect(() => getUd3RewardConfig('nope')).toThrow(/unknown/i);
  });
});

describe('ud3RewardIdempotencyKey', () => {
  it('builds the exact key format', () => {
    expect(ud3RewardIdempotencyKey('order1', 'userA', 'GUIDE', VERSION)).toBe(
      `UD3_REWARD:order1:userA:GUIDE:${VERSION}`,
    );
    expect(ud3RewardIdempotencyKey('o', 'b', 'NETWORK', 'v9')).toBe('UD3_REWARD:o:b:NETWORK:v9');
  });

  it('defaults to the latest config version when omitted', () => {
    expect(ud3RewardIdempotencyKey('o', 'b', 'BURN')).toBe(`UD3_REWARD:o:b:BURN:${VERSION}`);
  });
});
