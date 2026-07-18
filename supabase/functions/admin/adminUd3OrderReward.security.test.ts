import { describe, it, expect } from 'vitest';
import { mapUd3OrderReward } from './index.ts';

/**
 * Fund-safety regression for the admin UD3 反向金 (bribe) order dialog. The
 * row→payload mapping must render BOTH the v2 snapshot schema
 * (reward_type / cumulative_rate / difference_rate / …) and legacy orders
 * (role / v_level / v_share_pct / gap_pct / ud3_amount + event.network_remaining_ud3),
 * and its `conserved` flag must catch a guide+network+burn split that does not
 * add back up to the generated total.
 */

const INTENT = '11111111-1111-1111-1111-111111111111';

describe('mapUd3OrderReward — v2 snapshot rows', () => {
  // Full S1..S6 chain: guide 600, network 80/96/88/100/112/124 (=600), burn 300.
  const event = {
    intent_id: INTENT,
    depositor_wallet: '0xdep',
    referrer_wallet: '0xref',
    principal_amount: '1000',
    bribe_rate_pct: '150',
    total_bribe_amount: '1500',
    network_base_pool: '400',
    level_config_version: 'ud3-v2-2026-07',
  };
  const ledger = [
    {
      reward_type: 'GUIDE_REWARD',
      recipient_wallet: '0xref',
      beneficiary_level: 'S1',
      guide_level_rate: '1.0',
      ud3_amount: '600',
      reward_status: 'REWARDED',
    },
    // Deliberately out of order to exercise the relation_depth asc sort.
    { reward_type: 'NETWORK_DIFFERENCE_REWARD', recipient_wallet: '0xn3', relation_depth: 3, beneficiary_level: 'S3', cumulative_rate: '0.66', previous_released_rate: '0.44', difference_rate: '0.22', ud3_amount: '88', reward_status: 'REWARDED' },
    { reward_type: 'NETWORK_DIFFERENCE_REWARD', recipient_wallet: '0xn1', relation_depth: 1, beneficiary_level: 'S1', cumulative_rate: '0.20', previous_released_rate: '0', difference_rate: '0.20', ud3_amount: '80', reward_status: 'REWARDED' },
    { reward_type: 'NETWORK_DIFFERENCE_REWARD', recipient_wallet: '0xn2', relation_depth: 2, beneficiary_level: 'S2', cumulative_rate: '0.44', previous_released_rate: '0.20', difference_rate: '0.24', ud3_amount: '96', reward_status: 'REWARDED' },
    { reward_type: 'NETWORK_DIFFERENCE_REWARD', recipient_wallet: '0xn4', relation_depth: 4, beneficiary_level: 'S4', cumulative_rate: '0.91', previous_released_rate: '0.66', difference_rate: '0.25', ud3_amount: '100', reward_status: 'REWARDED' },
    { reward_type: 'NETWORK_DIFFERENCE_REWARD', recipient_wallet: '0xn5', relation_depth: 5, beneficiary_level: 'S5', cumulative_rate: '1.19', previous_released_rate: '0.91', difference_rate: '0.28', ud3_amount: '112', reward_status: 'REWARDED' },
    { reward_type: 'NETWORK_DIFFERENCE_REWARD', recipient_wallet: '0xn6', relation_depth: 6, beneficiary_level: 'S6', cumulative_rate: '1.50', previous_released_rate: '1.19', difference_rate: '0.31', ud3_amount: '124', reward_status: 'REWARDED' },
    { reward_type: 'BURN', recipient_wallet: '0xburn', ud3_amount: '300' },
  ];

  const out = mapUd3OrderReward(event, ledger);

  it('maps the order header from the v2 snapshot columns', () => {
    expect(out.order).toEqual({
      intentId: INTENT,
      depositorWallet: '0xdep',
      referrerWallet: '0xref',
      principalUsdt: '1000',
      bribeRatePct: '150',
      totalBribeUd3: '1500',
    });
    expect(out.configVersion).toBe('ud3-v2-2026-07');
  });

  it('maps the guide reward', () => {
    expect(out.guide).toEqual({
      wallet: '0xref',
      level: 'S1',
      levelRate: '1.0',
      amount: '600',
      status: 'REWARDED',
    });
  });

  it('orders network rows by relation_depth asc and sums them', () => {
    expect(out.network.map((n) => n.relationDepth)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out.network.map((n) => n.amount)).toEqual(['80', '96', '88', '100', '112', '124']);
    expect(out.network[2]).toEqual({
      wallet: '0xn3',
      relationDepth: 3,
      level: 'S3',
      cumulativeRate: '0.66',
      previousReleasedRate: '0.44',
      differenceRate: '0.22',
      amount: '88',
      status: 'REWARDED',
    });
    expect(out.networkTotalUd3).toBe('600');
  });

  it('reports burn, total and conservation', () => {
    expect(out.burnUd3).toBe('300');
    expect(out.totalUd3).toBe('1500'); // 600 + 600 + 300
    expect(out.conserved).toBe(true);
  });

  it('includes NO_DIFFERENCE network rows and flags non-conservation', () => {
    const partial = mapUd3OrderReward(
      { ...event, total_bribe_amount: '1500' },
      [
        ledger[0], // guide 600
        { reward_type: 'NETWORK_DIFFERENCE_REWARD', recipient_wallet: '0xa', relation_depth: 1, beneficiary_level: 'S2', cumulative_rate: '0.44', difference_rate: '0.44', ud3_amount: '176', reward_status: 'REWARDED' },
        { reward_type: 'NETWORK_DIFFERENCE_REWARD', recipient_wallet: '0xb', relation_depth: 2, beneficiary_level: 'S2', cumulative_rate: '0.44', difference_rate: '0', ud3_amount: '0', reward_status: 'NO_DIFFERENCE' },
        { reward_type: 'BURN', recipient_wallet: '0xburn', ud3_amount: '300' },
      ],
    );
    // NO_DIFFERENCE row is kept in the list.
    expect(partial.network.map((n) => n.status)).toEqual(['REWARDED', 'NO_DIFFERENCE']);
    expect(partial.networkTotalUd3).toBe('176');
    // 600 + 176 + 300 = 1076 ≠ 1500 → not conserved.
    expect(partial.totalUd3).toBe('1076');
    expect(partial.conserved).toBe(false);
  });
});

describe('mapUd3OrderReward — legacy rows', () => {
  // Legacy schema: role direct/differential/reserve, v_level/v_share_pct/gap_pct,
  // and the event's network_remaining_ud3 as the burn/reserve remainder.
  const event = {
    intent_id: INTENT,
    depositor_wallet: '0xdep',
    referrer_wallet: '0xref',
    deposit_usdt: '1000',
    tier_rate_pct: '120',
    generated_ud3: '1200',
    network_pool_ud3: '480',
    network_allocated_ud3: '300',
    network_remaining_ud3: '180',
  };
  const ledger = [
    { role: 'direct', recipient_wallet: '0xref', v_level: 3, v_share_pct: '60', ud3_amount: '720' },
    { role: 'differential', recipient_wallet: '0xn1', v_level: 1, v_share_pct: '20', gap_pct: '20', ud3_amount: '200' },
    { role: 'differential', recipient_wallet: '0xn2', v_level: 1, v_share_pct: '20', gap_pct: '0', ud3_amount: '0' },
    { role: 'differential', recipient_wallet: '0xn3', v_level: 2, v_share_pct: '30', gap_pct: '10', ud3_amount: '100' },
    { role: 'reserve', recipient_wallet: '0xburn', ud3_amount: '180' },
  ];

  const out = mapUd3OrderReward(event, ledger);

  it('falls back to legacy event columns for the order header', () => {
    expect(out.order.principalUsdt).toBe('1000');
    expect(out.order.bribeRatePct).toBe('120');
    expect(out.order.totalBribeUd3).toBe('1200');
    expect(out.configVersion).toBeNull();
  });

  it('derives the guide reward from role=direct', () => {
    expect(out.guide).toEqual({
      wallet: '0xref',
      level: '3',
      levelRate: '60',
      amount: '720',
      status: 'REWARDED',
    });
  });

  it('derives network rows from role=differential, deriving status from amount', () => {
    expect(out.network.map((n) => n.amount)).toEqual(['200', '0', '100']);
    expect(out.network.map((n) => n.status)).toEqual(['REWARDED', 'NO_DIFFERENCE', 'REWARDED']);
    expect(out.network[0]).toEqual({
      wallet: '0xn1',
      relationDepth: null,
      level: '1',
      cumulativeRate: '20',
      previousReleasedRate: null,
      differenceRate: '20',
      amount: '200',
      status: 'REWARDED',
    });
    expect(out.networkTotalUd3).toBe('300');
  });

  it('uses the reserve line for burn and conserves the generated total', () => {
    expect(out.burnUd3).toBe('180');
    expect(out.totalUd3).toBe('1200'); // 720 + 300 + 180
    expect(out.conserved).toBe(true);
  });

  it('falls back to event.network_remaining_ud3 when no reserve ledger line exists', () => {
    const noReserve = mapUd3OrderReward(event, ledger.slice(0, 4));
    expect(noReserve.burnUd3).toBe('180');
    expect(noReserve.totalUd3).toBe('1200');
    expect(noReserve.conserved).toBe(true);
  });
});
