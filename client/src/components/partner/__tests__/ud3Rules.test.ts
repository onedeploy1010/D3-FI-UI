import { describe, expect, it } from 'vitest';
import {
  allocateNetworkDifferential,
  generateUd3FromDeposit,
  getUd3Tier,
  resolveUd3VLevel,
  settleUd3DepositEvent,
} from '../ud3Rules';

describe('UD3 tier (generation only)', () => {
  it('uses chart ceilings for tier rate', () => {
    expect(getUd3Tier(50_000)?.ratePct).toBe(50); // ≤10万 → 第一档
    expect(getUd3Tier(100_000)?.ratePct).toBe(50);
    expect(getUd3Tier(150_000)?.ratePct).toBe(60); // ≤20万
    expect(getUd3Tier(250_000)?.ratePct).toBe(70); // ≤30万
    expect(getUd3Tier(400_000)?.ratePct).toBe(80); // ≤50万
    expect(getUd3Tier(700_000)?.ratePct).toBe(90); // ≤80万
    expect(getUd3Tier(900_000)?.ratePct).toBe(100); // 第六档
    expect(getUd3Tier(1_000_000)?.ratePct).toBe(100);
  });

  it('generates UD3 then splits 60/40', () => {
    // Tier 5 (90%): 1000 × 90% = 900 → direct 540 / pool 360
    const g = generateUd3FromDeposit(1000, 700_000);
    expect(g.tierRatePct).toBe(90);
    expect(g.generatedUd3).toBe(900);
    expect(g.directUd3).toBe(540);
    expect(g.networkPoolUd3).toBe(360);
  });

  it('sixth tier generates 100%', () => {
    const g = generateUd3FromDeposit(1000, 900_000);
    expect(g.generatedUd3).toBe(1000);
    expect(g.directUd3).toBe(600);
    expect(g.networkPoolUd3).toBe(400);
  });
});

describe('UD3 V levels', () => {
  it('V1–V2 use total; V3–V6 use small area', () => {
    expect(resolveUd3VLevel({ totalPerfUsdt: 2_000, smallAreaPerfUsdt: 0 })?.label).toBe('V1');
    expect(resolveUd3VLevel({ totalPerfUsdt: 6_000, smallAreaPerfUsdt: 0 })?.label).toBe('V2');
    expect(resolveUd3VLevel({ totalPerfUsdt: 6_000, smallAreaPerfUsdt: 12_000 })?.label).toBe('V3');
    expect(resolveUd3VLevel({ totalPerfUsdt: 1_000, smallAreaPerfUsdt: 350_000 })?.label).toBe('V6');
  });
});

describe('network differential', () => {
  it('continuous V1→V6 gaps sum to 100%', () => {
    const chain = [20, 40, 55, 70, 85, 100].map((vSharePct, i) => ({
      wallet: `w${i}`,
      vSharePct,
      vLabel: `V${i + 1}`,
    }));
    const r = allocateNetworkDifferential(1000, chain);
    expect(r.payouts.map((p) => p.gapPct)).toEqual([20, 20, 15, 15, 15, 15]);
    expect(r.allocatedPct).toBe(100);
    expect(r.remainingUd3).toBe(0);
    expect(r.allocatedUd3).toBe(1000);
  });

  it('same level only pays once', () => {
    const r = allocateNetworkDifferential(1000, [
      { wallet: 'a', vSharePct: 55, vLabel: 'V3' },
      { wallet: 'b', vSharePct: 55, vLabel: 'V3' },
      { wallet: 'c', vSharePct: 85, vLabel: 'V5' },
      { wallet: 'd', vSharePct: 100, vLabel: 'V6' },
    ]);
    expect(r.payouts.map((p) => p.gapPct)).toEqual([55, 0, 30, 15]);
    expect(r.allocatedPct).toBe(100);
  });

  it('skips levels and still fills gaps', () => {
    const r = allocateNetworkDifferential(1000, [
      { wallet: 'a', vSharePct: 40, vLabel: 'V2' },
      { wallet: 'b', vSharePct: 70, vLabel: 'V4' },
      { wallet: 'c', vSharePct: 100, vLabel: 'V6' },
    ]);
    expect(r.payouts.map((p) => p.gapPct)).toEqual([40, 30, 30]);
  });

  it('lower under higher gets 0 until higher rank', () => {
    const r = allocateNetworkDifferential(1000, [
      { wallet: 'a', vSharePct: 85, vLabel: 'V5' },
      { wallet: 'b', vSharePct: 55, vLabel: 'V3' },
      { wallet: 'c', vSharePct: 40, vLabel: 'V2' },
      { wallet: 'd', vSharePct: 100, vLabel: 'V6' },
    ]);
    expect(r.payouts.map((p) => p.gapPct)).toEqual([85, 0, 0, 15]);
  });

  it('holds remainder when no V6', () => {
    const r = allocateNetworkDifferential(1000, [
      { wallet: 'a', vSharePct: 20, vLabel: 'V1' },
      { wallet: 'b', vSharePct: 40, vLabel: 'V2' },
      { wallet: 'c', vSharePct: 70, vLabel: 'V4' },
    ]);
    expect(r.allocatedPct).toBe(70);
    expect(r.remainingPct).toBe(30);
    expect(r.remainingUd3).toBe(300);
  });
});

describe('full settle event', () => {
  it('referrer 60% + network 40% differential', () => {
    const event = settleUd3DepositEvent({
      depositUsdt: 1000,
      referrerWallet: 'ref',
      referrerTotalPerfUsdt: 700_000, // tier 5 → 900 UD3
      networkChainAboveReferrer: [
        { wallet: 'u1', vSharePct: 40, vLabel: 'V2' },
        { wallet: 'u2', vSharePct: 100, vLabel: 'V6' },
      ],
    });
    expect(event.directUd3).toBe(540);
    expect(event.networkPoolUd3).toBe(360);
    expect(event.network.payouts[0].ud3Amount).toBe(144); // 40% of 360
    expect(event.network.payouts[1].ud3Amount).toBe(216); // 60% of 360
  });
});
