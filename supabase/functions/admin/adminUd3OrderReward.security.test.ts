import { describe, it, expect } from 'vitest';
import { mapUd3OrderReward } from './index.ts';

/**
 * Fund-safety regression for the admin UD3 反向金 order dialog under the V3
 * tier-coefficient × cumulative-difference model. The row→payload mapping must:
 *   - render exactly SIX network slots S1..S6 (driven off config, matched by
 *     reward_tier_code), each CALCULATED (paid) or BURN (无合格上级 → 记录销毁);
 *   - keep the 引路人 (guide) ladder INDEPENDENT and never let a guide row shadow
 *     the network S-slot of the same code;
 *   - reconcile networkAllocated + networkBurned == networkTotal (conserved).
 * These are money paths: a mis-mapped slot silently misreports who was paid.
 */

const INTENT = '11111111-1111-1111-1111-111111111111';

const guideRow = {
  reward_type: 'GUIDE_REWARD',
  recipient_wallet: '0xref',
  beneficiary_level: 'S1',
  tier_coefficient: '1',
  ud3_amount: '600',
  reward_status: 'CALCULATED',
  // NOTE: V3 settlement writes reward_tier_code=null on the guide row.
  reward_tier_code: null,
};

// One network tier-slot ledger row.
function net(
  code: string,
  rank: number,
  recipient: string | null,
  depth: number | null,
  amount: string,
  opts: { burned?: boolean; reason?: string; extra?: Record<string, unknown> } = {},
) {
  const burned = opts.burned === true;
  return {
    reward_type: burned ? 'BURN' : 'NETWORK_DIFFERENCE_REWARD',
    reward_tier_code: code,
    reward_tier_rank: rank,
    recipient_wallet: recipient,
    relation_depth: depth,
    receiver_tier_code: burned ? null : code,
    receiver_tier_rank: burned ? null : rank,
    reward_status: burned ? 'UNALLOCATED' : 'CALCULATED',
    unallocated_reason: burned ? (opts.reason ?? 'NO_QUALIFIED_ANCESTOR') : null,
    ud3_amount: amount,
    ...(opts.extra ?? {}),
  };
}

const baseEvent = {
  intent_id: INTENT,
  depositor_wallet: '0xdep',
  referrer_wallet: '0xref',
  principal_amount: '1000',
  deposit_usdt: '1000',
};

describe('mapUd3OrderReward — V3 full chain (all CALCULATED)', () => {
  const ledger = [
    guideRow,
    // Deliberately out of code order to exercise the config-driven S1..S6 sort.
    net('S3', 3, '0xn3', 3, '72'),
    net('S1', 1, '0xn1', 1, '80'),
    net('S2', 2, '0xn2', 2, '88'),
    net('S6', 6, '0xn6', 6, '90'),
    net('S4', 4, '0xn4', 4, '78'),
    net('S5', 5, '0xn5', 5, '84'),
  ];
  const out = mapUd3OrderReward(baseEvent, ledger);

  it('maps the order header (V3 shape)', () => {
    expect(out.order.intentId).toBe(INTENT);
    expect(out.order.depositorWallet).toBe('0xdep');
    expect(out.order.referrerWallet).toBe('0xref');
    expect(out.order.principalUsdt).toBe('1000');
    expect(out.order.networkRatePct).toBe('0.4');
    expect(out.order.algorithmVersion).toBe('V3_TIER_COEFFICIENT_CUMULATIVE_DIFFERENCE');
  });

  it('renders exactly six slots S1..S6 in rank order with the spec amounts', () => {
    expect(out.tiers.map((t) => t.rewardTierCode)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    expect(out.tiers.map((t) => t.amount)).toEqual(['80', '88', '72', '78', '84', '90']);
    expect(out.tiers.every((t) => t.status === 'CALCULATED')).toBe(true);
  });

  it('wires each slot to its receiver', () => {
    expect(out.tiers.map((t) => t.receiverWallet)).toEqual([
      '0xn1', '0xn2', '0xn3', '0xn4', '0xn5', '0xn6',
    ]);
    expect(out.tiers[2].receiverTierCode).toBe('S3');
    expect(out.tiers[2].receiverRelationDepth).toBe(3);
  });

  it('maps the independent guide reward', () => {
    expect(out.guide).toEqual({
      wallet: '0xref',
      tierCode: 'S1',
      coefficient: '1',
      amount: '600',
      status: 'CALCULATED',
    });
  });

  it('totals and conserves (allocated + burned == total)', () => {
    expect(out.networkTotalUd3).toBe('492');
    expect(out.networkAllocatedUd3).toBe('492');
    expect(out.networkBurnedUd3).toBe('0');
    expect(out.conserved).toBe(true);
  });
});

describe('mapUd3OrderReward — V3 partial chain (unmatched slots BURNED)', () => {
  // Chain reaches only S3: S1..S3 paid, S4..S6 burned (无合格上级 → 记录销毁).
  const ledger = [
    guideRow,
    net('S1', 1, '0xn1', 1, '80'),
    net('S2', 2, '0xn2', 2, '88'),
    net('S3', 3, '0xn3', 3, '72'),
    net('S4', 4, '0xburn', null, '78', { burned: true }),
    net('S5', 5, '0xburn', null, '84', { burned: true }),
    net('S6', 6, '0xburn', null, '90', { burned: true }),
  ];
  const out = mapUd3OrderReward(baseEvent, ledger);

  it('flags the unmatched slots as BURN and clears their receiver', () => {
    expect(out.tiers.map((t) => t.status)).toEqual([
      'CALCULATED', 'CALCULATED', 'CALCULATED', 'BURN', 'BURN', 'BURN',
    ]);
    expect(out.tiers[3].receiverWallet).toBeNull();
    expect(out.tiers[3].unallocatedReason).toBe('NO_QUALIFIED_ANCESTOR');
  });

  it('splits allocated vs burned and stays conserved', () => {
    expect(out.networkAllocatedUd3).toBe('240'); // 80+88+72
    expect(out.networkBurnedUd3).toBe('252'); // 78+84+90
    expect(out.networkTotalUd3).toBe('492');
    expect(out.conserved).toBe(true);
  });
});

describe('mapUd3OrderReward — guide row never shadows the network S-slot', () => {
  it('picks the network S1 amount (80), not a guide row stamped S1 (600)', () => {
    const ledger = [
      // Legacy/bad data: a guide row that also carries reward_tier_code 'S1'.
      { ...guideRow, reward_tier_code: 'S1', reward_tier_rank: 1 },
      net('S1', 1, '0xn1', 1, '80'),
      net('S2', 2, '0xn2', 2, '88'),
      net('S3', 3, '0xn3', 3, '72'),
      net('S4', 4, '0xn4', 4, '78'),
      net('S5', 5, '0xn5', 5, '84'),
      net('S6', 6, '0xn6', 6, '90'),
    ];
    const out = mapUd3OrderReward(baseEvent, ledger);
    expect(out.tiers[0].amount).toBe('80');
    expect(out.tiers[0].receiverWallet).toBe('0xn1');
    expect(out.guide?.amount).toBe('600');
    expect(out.networkTotalUd3).toBe('492');
  });
});
