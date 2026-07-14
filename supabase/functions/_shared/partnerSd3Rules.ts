/** Partner sD3 (bribe) rules — small-area basis + upline split.
 *  sD3 is based on DT quantity: stakeUsdt / CROWDFUND_UNIT_PRICE_USDT.
 */

/** Current DT crowdfund unit price (USDT per DT). */
export const CROWDFUND_UNIT_PRICE_USDT = 5;

export function usdtToDt(amountUsdt: number): number {
  if (!Number.isFinite(amountUsdt) || amountUsdt <= 0 || CROWDFUND_UNIT_PRICE_USDT <= 0) return 0;
  return Math.round((amountUsdt / CROWDFUND_UNIT_PRICE_USDT) * 100) / 100;
}

export const BRIBE_TIER_MIN_USD = 100;

export const BRIBE_TIERS = [
  { min: 100, max: 100_000, rate: 1, ratePct: 100 },
  { min: 100_000, max: 200_000, rate: 0.8, ratePct: 80 },
  { min: 200_000, max: 500_000, rate: 0.6, ratePct: 60 },
  { min: 500_000, max: 1_000_000, rate: 0.5, ratePct: 50 },
] as const;

/** Direct partner / upline partner split by tier (tier 1 = 100–100k). */
export const BRIBE_TIER_SPLITS = [
  { directShare: 0.5, uplineShare: 0.5 },
  { directShare: 0.4, uplineShare: 0.6 },
  { directShare: 0.3, uplineShare: 0.7 },
  { directShare: 0.2, uplineShare: 0.8 },
] as const;

export type PartnerAreaStats = {
  smallAreaUsd: number;
  smallAreaNewUsd: number;
  largeAreaUsd: number;
  largeAreaNewUsd: number;
};

export function getBribeTier(smallAreaPerformanceUsd: number) {
  if (smallAreaPerformanceUsd < BRIBE_TIER_MIN_USD) return null;
  for (const tier of BRIBE_TIERS) {
    if (smallAreaPerformanceUsd >= tier.min && smallAreaPerformanceUsd < tier.max) return tier;
  }
  if (smallAreaPerformanceUsd >= 1_000_000) return BRIBE_TIERS[BRIBE_TIERS.length - 1];
  return null;
}

export function getBribeTierSplit(tier: (typeof BRIBE_TIERS)[number]) {
  const idx = BRIBE_TIERS.indexOf(tier);
  return BRIBE_TIER_SPLITS[idx >= 0 ? idx : 0];
}

export function computePartnerAreaStatsFromLines(
  lines: { teamUsd: number; dailyNewUsd: number }[],
): PartnerAreaStats {
  if (!lines.length) {
    return { smallAreaUsd: 0, smallAreaNewUsd: 0, largeAreaUsd: 0, largeAreaNewUsd: 0 };
  }
  const sorted = [...lines].sort((a, b) => b.teamUsd - a.teamUsd);
  return {
    largeAreaUsd: sorted[0]?.teamUsd ?? 0,
    largeAreaNewUsd: sorted[0]?.dailyNewUsd ?? 0,
    smallAreaUsd: sorted.slice(1).reduce((s, c) => s + c.teamUsd, 0),
    smallAreaNewUsd: sorted.slice(1).reduce((s, c) => s + c.dailyNewUsd, 0),
  };
}

export function calcDailySd3Gross(
  smallAreaPerformanceUsd: number,
  smallAreaNewPerformanceUsd: number,
  isPartner: boolean,
): { grossSd3: number; tierRatePct: number; directSharePct: number; uplineSharePct: number } {
  if (!isPartner || smallAreaNewPerformanceUsd <= 0) {
    return { grossSd3: 0, tierRatePct: 0, directSharePct: 0, uplineSharePct: 0 };
  }
  const tier = getBribeTier(smallAreaPerformanceUsd);
  if (!tier) return { grossSd3: 0, tierRatePct: 0, directSharePct: 0, uplineSharePct: 0 };
  const split = getBribeTierSplit(tier);
  const grossSd3 = Math.round(usdtToDt(smallAreaNewPerformanceUsd) * tier.rate * 100) / 100;
  return {
    grossSd3,
    tierRatePct: tier.ratePct,
    directSharePct: Math.round(split.directShare * 100),
    uplineSharePct: Math.round(split.uplineShare * 100),
  };
}

/** Estimated sD3 credited to the direct (first) partner on small-area new volume. */
export function calcDailySd3DirectShare(
  smallAreaPerformanceUsd: number,
  smallAreaNewPerformanceUsd: number,
  isPartner: boolean,
): number {
  const { grossSd3, tierRatePct } = calcDailySd3Gross(
    smallAreaPerformanceUsd,
    smallAreaNewPerformanceUsd,
    isPartner,
  );
  if (grossSd3 <= 0 || tierRatePct <= 0) return 0;
  const tier = getBribeTier(smallAreaPerformanceUsd);
  if (!tier) return 0;
  const split = getBribeTierSplit(tier);
  return Math.round(grossSd3 * split.directShare * 100) / 100;
}

export function splitEventSd3(
  amountUsd: number,
  smallAreaPerformanceUsd: number,
): { grossSd3: number; directSd3: number; uplineSd3: number; tierRatePct: number } {
  const tier = getBribeTier(smallAreaPerformanceUsd);
  if (!tier || amountUsd <= 0) {
    return { grossSd3: 0, directSd3: 0, uplineSd3: 0, tierRatePct: 0 };
  }
  const split = getBribeTierSplit(tier);
  const grossSd3 = Math.round(usdtToDt(amountUsd) * tier.rate * 100) / 100;
  return {
    grossSd3,
    directSd3: Math.round(grossSd3 * split.directShare * 100) / 100,
    uplineSd3: Math.round(grossSd3 * split.uplineShare * 100) / 100,
    tierRatePct: tier.ratePct,
  };
}
