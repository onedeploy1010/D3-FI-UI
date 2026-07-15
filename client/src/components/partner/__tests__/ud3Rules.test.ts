import { describe, expect, it } from 'vitest';
import {
  allocateNetworkDifferential,
  generateUd3FromDeposit,
  getUd3Tier,
  resolveUd3SLevel,
  settleUd3DepositEvent,
} from '../ud3Rules';

describe('UD3 tier S1–S6 (generation)', () => {
  it('uses +10% steps from 100% to 150%', () => {
    expect(getUd3Tier(50_000)?.label).toBe('S1');
    expect(getUd3Tier(50_000)?.ratePct).toBe(100);
    expect(getUd3Tier(100_000)?.ratePct).toBe(100);
    expect(getUd3Tier(150_000)?.label).toBe('S2');
    expect(getUd3Tier(150_000)?.ratePct).toBe(110);
    expect(getUd3Tier(250_000)?.ratePct).toBe(120);
    expect(getUd3Tier(400_000)?.ratePct).toBe(130);
    expect(getUd3Tier(700_000)?.ratePct).toBe(140);
    expect(getUd3Tier(900_000)?.label).toBe('S6');
    expect(getUd3Tier(900_000)?.ratePct).toBe(150);
  });

  it('generates deposit × 引路人档位 then splits 60/40', () => {
    // S1 100%: 1000 × 100% = 1000 → direct 600 / pool 400
    const g1 = generateUd3FromDeposit(1000, 50_000);
    expect(g1.tierRatePct).toBe(100);
    expect(g1.generatedUd3).toBe(1000);
    expect(g1.directUd3).toBe(600);
    expect(g1.networkPoolUd3).toBe(400);

    // S2 110%: 1000 × 110% = 1100 → direct 660 / pool 440
    const g2 = generateUd3FromDeposit(1000, 150_000);
    expect(g2.tierRatePct).toBe(110);
    expect(g2.generatedUd3).toBe(1100);
    expect(g2.directUd3).toBe(660);
    expect(g2.networkPoolUd3).toBe(440);
  });

  it('S6 generates 150%', () => {
    const g = generateUd3FromDeposit(1000, 900_000);
    expect(g.generatedUd3).toBe(1500);
    expect(g.directUd3).toBe(900);
    expect(g.networkPoolUd3).toBe(600);
  });
});

describe('UD3 gap level = same ladder as 档位', () => {
  it('demo-scale 7600 is S1 at 20% pool share', () => {
    expect(resolveUd3SLevel({ totalPerfUsdt: 7_600, smallAreaPerfUsdt: 0 })?.label).toBe('S1');
    expect(resolveUd3SLevel({ totalPerfUsdt: 7_600, smallAreaPerfUsdt: 0 })?.sharePct).toBe(20);
  });

  it('requires ≥1000 total; higher 档位 unlocks higher gap share', () => {
    expect(resolveUd3SLevel({ totalPerfUsdt: 500, smallAreaPerfUsdt: 0 })).toBeNull();
    expect(resolveUd3SLevel({ totalPerfUsdt: 2_000, smallAreaPerfUsdt: 0 })?.label).toBe('S1');
    expect(resolveUd3SLevel({ totalPerfUsdt: 150_000, smallAreaPerfUsdt: 0 })?.label).toBe('S2');
    expect(resolveUd3SLevel({ totalPerfUsdt: 150_000, smallAreaPerfUsdt: 0 })?.sharePct).toBe(40);
    expect(resolveUd3SLevel({ totalPerfUsdt: 250_000, smallAreaPerfUsdt: 0 })?.label).toBe('S3');
    expect(resolveUd3SLevel({ totalPerfUsdt: 900_000, smallAreaPerfUsdt: 0 })?.label).toBe('S6');
  });
});

describe('network differential', () => {
  it('continuous S1→S6 gaps sum to 100%', () => {
    const chain = [20, 40, 55, 70, 85, 100].map((vSharePct, i) => ({
      wallet: `w${i}`,
      vSharePct,
      vLabel: `S${i + 1}`,
    }));
    const r = allocateNetworkDifferential(1000, chain);
    expect(r.payouts.map((p) => p.gapPct)).toEqual([20, 20, 15, 15, 15, 15]);
    expect(r.allocatedPct).toBe(100);
    expect(r.remainingUd3).toBe(0);
    expect(r.allocatedUd3).toBe(1000);
  });

  it('same level only pays once', () => {
    const r = allocateNetworkDifferential(1000, [
      { wallet: 'a', vSharePct: 55, vLabel: 'S3' },
      { wallet: 'b', vSharePct: 55, vLabel: 'S3' },
      { wallet: 'c', vSharePct: 85, vLabel: 'S5' },
      { wallet: 'd', vSharePct: 100, vLabel: 'S6' },
    ]);
    expect(r.payouts.map((p) => p.gapPct)).toEqual([55, 0, 30, 15]);
    expect(r.allocatedPct).toBe(100);
  });

  it('引路人 S1 floor → upline S1 gap is 0', () => {
    const r = allocateNetworkDifferential(
      400,
      [{ wallet: 'demo', vSharePct: 20, vLabel: 'S1' }],
      20, // 引路人 already S1
    );
    expect(r.payouts[0].gapPct).toBe(0);
    expect(r.payouts[0].ud3Amount).toBe(0);
    // Floor 20% of pool not paid again (guide already took 60% direct) → reserve 80%
    expect(r.remainingUd3).toBe(400);
    expect(r.remainingPct).toBe(100);
  });

  it('引路人 S1 floor → upline S2 takes 20% gap of pool', () => {
    const r = allocateNetworkDifferential(
      400,
      [{ wallet: 'up', vSharePct: 40, vLabel: 'S2' }],
      20,
    );
    expect(r.payouts[0].gapPct).toBe(20);
    expect(r.payouts[0].ud3Amount).toBe(80);
    // Paid 20% of pool; unpaid includes floor 20% + above-S2 60% = 80% → 320
    expect(r.remainingUd3).toBe(320);
    expect(r.remainingPct).toBe(80);
  });

  it('引路人 S1 floor + S6 tops out: unpaid floor slice → remainingPct from UD3', () => {
    const r = allocateNetworkDifferential(
      400,
      [
        { wallet: 'a', vSharePct: 20, vLabel: 'S1' },
        { wallet: 'b', vSharePct: 100, vLabel: 'S6' },
      ],
      20,
    );
    expect(r.payouts.map((p) => p.gapPct)).toEqual([0, 80]);
    expect(r.payouts[1].ud3Amount).toBe(320);
    expect(r.allocatedPct).toBe(100);
    // 20% of pool (=80) reserved for floor, not double-paid to guide
    expect(r.remainingUd3).toBe(80);
    expect(r.remainingPct).toBe(20);
  });

  it('skips levels and still fills gaps', () => {
    const r = allocateNetworkDifferential(1000, [
      { wallet: 'a', vSharePct: 40, vLabel: 'S2' },
      { wallet: 'b', vSharePct: 70, vLabel: 'S4' },
      { wallet: 'c', vSharePct: 100, vLabel: 'S6' },
    ]);
    expect(r.payouts.map((p) => p.gapPct)).toEqual([40, 30, 30]);
  });

  it('lower under higher gets 0 until higher rank', () => {
    const r = allocateNetworkDifferential(1000, [
      { wallet: 'a', vSharePct: 85, vLabel: 'S5' },
      { wallet: 'b', vSharePct: 55, vLabel: 'S3' },
      { wallet: 'c', vSharePct: 40, vLabel: 'S2' },
      { wallet: 'd', vSharePct: 100, vLabel: 'S6' },
    ]);
    expect(r.payouts.map((p) => p.gapPct)).toEqual([85, 0, 0, 15]);
  });

  it('holds remainder when no S6', () => {
    const r = allocateNetworkDifferential(1000, [
      { wallet: 'a', vSharePct: 20, vLabel: 'S1' },
      { wallet: 'b', vSharePct: 40, vLabel: 'S2' },
      { wallet: 'c', vSharePct: 70, vLabel: 'S4' },
    ]);
    expect(r.allocatedPct).toBe(70);
    expect(r.remainingPct).toBe(30);
    expect(r.remainingUd3).toBe(300);
  });
});

describe('full settle event', () => {
  it('referrer 60% + network 40% differential (S2 110%)', () => {
    const event = settleUd3DepositEvent({
      depositUsdt: 1000,
      referrerWallet: 'ref',
      referrerTotalPerfUsdt: 150_000, // S2 → 1100 UD3, floor 40%
      networkChainAboveReferrer: [
        { wallet: 'u1', vSharePct: 40, vLabel: 'S2' },
        { wallet: 'u2', vSharePct: 100, vLabel: 'S6' },
      ],
    });
    expect(event.generatedUd3).toBe(1100);
    expect(event.directUd3).toBe(660);
    expect(event.networkPoolUd3).toBe(440);
    expect(event.referrerNetworkSharePct).toBe(40);
    // u1 same S2 as 引路人 → 0; u2 takes 100−40=60
    expect(event.network.payouts[0].ud3Amount).toBe(0);
    expect(event.network.payouts[1].gapPct).toBe(60);
    expect(event.network.payouts[1].ud3Amount).toBe(264);
  });

  it('S1 引路人 → S1 demo upline gets no gap', () => {
    const event = settleUd3DepositEvent({
      depositUsdt: 1000,
      referrerWallet: 'guide',
      referrerTotalPerfUsdt: 7_600, // S1
      networkChainAboveReferrer: [{ wallet: 'demo', vSharePct: 20, vLabel: 'S1' }],
    });
    expect(event.referrerNetworkSharePct).toBe(20);
    expect(event.network.payouts[0].gapPct).toBe(0);
    expect(event.network.payouts[0].ud3Amount).toBe(0);
  });
});
