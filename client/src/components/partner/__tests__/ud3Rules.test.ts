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

describe('UD3 S network levels', () => {
  it('S1–S2 use total; S3–S6 use small area', () => {
    expect(resolveUd3SLevel({ totalPerfUsdt: 2_000, smallAreaPerfUsdt: 0 })?.label).toBe('S1');
    expect(resolveUd3SLevel({ totalPerfUsdt: 6_000, smallAreaPerfUsdt: 0 })?.label).toBe('S2');
    expect(resolveUd3SLevel({ totalPerfUsdt: 6_000, smallAreaPerfUsdt: 12_000 })?.label).toBe('S3');
    expect(resolveUd3SLevel({ totalPerfUsdt: 1_000, smallAreaPerfUsdt: 350_000 })?.label).toBe('S6');
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
      referrerTotalPerfUsdt: 150_000, // S2 → 1100 UD3
      networkChainAboveReferrer: [
        { wallet: 'u1', vSharePct: 40, vLabel: 'S2' },
        { wallet: 'u2', vSharePct: 100, vLabel: 'S6' },
      ],
    });
    expect(event.generatedUd3).toBe(1100);
    expect(event.directUd3).toBe(660);
    expect(event.networkPoolUd3).toBe(440);
    expect(event.network.payouts[0].ud3Amount).toBe(176); // 40% of 440
    expect(event.network.payouts[1].ud3Amount).toBe(264); // 60% of 440
  });
});
