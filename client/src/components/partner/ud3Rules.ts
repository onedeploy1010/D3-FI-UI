/**
 * D³ UD3 (反向金) reward engine.
 *
 * TWO SEPARATE SYSTEMS (never mix):
 * ① 档位 S1~S6 — how many UD3 a deposit generates (based on 引路人 total performance).
 *    Rate: S1 100% → S2 110% → … → S6 150% (+10% each).
 * ② S-level (S1~S6) — how the 40% network pool is shared by differential (极差).
 *
 * Flow per credited deposit:
 *   generated = amountUsdt × tierRate(引路人)
 *   引路人 gets 60%; network pool gets 40% (allocated by S differential up the chain).
 */

export const UD3_DIRECT_SHARE = 0.6;
export const UD3_NETWORK_SHARE = 0.4;
/** Personal stake threshold to join the UD3 plan (not partner-only). */
export const UD3_PLAN_MIN_STAKE_USDT = 100;

// ─── ① Tier S1~S6 (档位) — generation only ───────────────────────────────────

export type Ud3Tier = {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  label: `S${1 | 2 | 3 | 4 | 5 | 6}`;
  /** Inclusive min of 引路人 total (team) performance USDT */
  minTotalPerfUsdt: number;
  /** Exclusive max; Infinity for top tier */
  maxTotalPerfUsdt: number;
  rate: number;
  ratePct: number;
  labelZh: string;
  labelEn: string;
};

/** S1 100% · S2 110% · S3 120% · S4 130% · S5 140% · S6 150% */
export const UD3_TIERS: Ud3Tier[] = [
  { id: 1, label: 'S1', minTotalPerfUsdt: 0, maxTotalPerfUsdt: 100_000, rate: 1.0, ratePct: 100, labelZh: 'S1', labelEn: 'S1' },
  { id: 2, label: 'S2', minTotalPerfUsdt: 100_000, maxTotalPerfUsdt: 200_000, rate: 1.1, ratePct: 110, labelZh: 'S2', labelEn: 'S2' },
  { id: 3, label: 'S3', minTotalPerfUsdt: 200_000, maxTotalPerfUsdt: 300_000, rate: 1.2, ratePct: 120, labelZh: 'S3', labelEn: 'S3' },
  { id: 4, label: 'S4', minTotalPerfUsdt: 300_000, maxTotalPerfUsdt: 500_000, rate: 1.3, ratePct: 130, labelZh: 'S4', labelEn: 'S4' },
  { id: 5, label: 'S5', minTotalPerfUsdt: 500_000, maxTotalPerfUsdt: 800_000, rate: 1.4, ratePct: 140, labelZh: 'S5', labelEn: 'S5' },
  { id: 6, label: 'S6', minTotalPerfUsdt: 800_000, maxTotalPerfUsdt: Number.POSITIVE_INFINITY, rate: 1.5, ratePct: 150, labelZh: 'S6', labelEn: 'S6' },
];

/**
 * Resolve 档位 by performance ceilings:
 * ≤10万 S1 · ≤20万 S2 · ≤30万 S3 · ≤50万 S4 · ≤80万 S5 · >80万 S6
 */
export function getUd3Tier(referrerTotalPerfUsdt: number): Ud3Tier | null {
  if (!Number.isFinite(referrerTotalPerfUsdt) || referrerTotalPerfUsdt < 0) return null;
  if (referrerTotalPerfUsdt <= 100_000) return UD3_TIERS[0];
  if (referrerTotalPerfUsdt <= 200_000) return UD3_TIERS[1];
  if (referrerTotalPerfUsdt <= 300_000) return UD3_TIERS[2];
  if (referrerTotalPerfUsdt <= 500_000) return UD3_TIERS[3];
  if (referrerTotalPerfUsdt <= 800_000) return UD3_TIERS[4];
  return UD3_TIERS[5];
}

// ─── ② S-level (网体级别) — distribution only ────────────────────────────────

export type Ud3SLevel = {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  label: `S${1 | 2 | 3 | 4 | 5 | 6}`;
  /** Cumulative share of the 40% network pool (percent points 0–100). */
  sharePct: number;
  /** What performance metric qualifies this level. */
  metric: 'total' | 'small';
  minPerfUsdt: number;
};

/** @deprecated Use Ud3SLevel */
export type Ud3VLevel = Ud3SLevel;

/**
 * S1~S2: 总业绩; S3~S6: 小区业绩.
 * Thresholds are admin-configurable defaults.
 */
export const UD3_S_LEVELS: Ud3SLevel[] = [
  { id: 1, label: 'S1', sharePct: 20, metric: 'total', minPerfUsdt: 1_000 },
  { id: 2, label: 'S2', sharePct: 40, metric: 'total', minPerfUsdt: 5_000 },
  { id: 3, label: 'S3', sharePct: 55, metric: 'small', minPerfUsdt: 10_000 },
  { id: 4, label: 'S4', sharePct: 70, metric: 'small', minPerfUsdt: 50_000 },
  { id: 5, label: 'S5', sharePct: 85, metric: 'small', minPerfUsdt: 100_000 },
  { id: 6, label: 'S6', sharePct: 100, metric: 'small', minPerfUsdt: 300_000 },
];

/** @deprecated Use UD3_S_LEVELS */
export const UD3_V_LEVELS = UD3_S_LEVELS;

export type Ud3PerfSnapshot = {
  /** 伞下总业绩（含直推线合计，不含本人入金时可自定） */
  totalPerfUsdt: number;
  /** 小区业绩（直推线中除最大线以外合计） */
  smallAreaPerfUsdt: number;
};

/** Highest S the member currently qualifies for (null if below S1). */
export function resolveUd3SLevel(perf: Ud3PerfSnapshot): Ud3SLevel | null {
  let best: Ud3SLevel | null = null;
  for (const level of UD3_S_LEVELS) {
    const value = level.metric === 'total' ? perf.totalPerfUsdt : perf.smallAreaPerfUsdt;
    if (value >= level.minPerfUsdt) best = level;
  }
  return best;
}

/** @deprecated Use resolveUd3SLevel */
export const resolveUd3VLevel = resolveUd3SLevel;

export function isUd3PlanEligible(personalStakeUsdt: number): boolean {
  return Number.isFinite(personalStakeUsdt) && personalStakeUsdt >= UD3_PLAN_MIN_STAKE_USDT;
}

// ─── Generation + split ──────────────────────────────────────────────────────

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export type Ud3GenerationResult = {
  depositUsdt: number;
  tier: Ud3Tier | null;
  tierRatePct: number;
  generatedUd3: number;
  directUd3: number;
  networkPoolUd3: number;
};

/**
 * Generate UD3 from downline deposit using 引路人档位:
 *   generated = depositUsdt × S-tier rate
 * then split 60% 引路人 / 40% 网体极差池.
 */
export function generateUd3FromDeposit(
  depositUsdt: number,
  referrerTotalPerfUsdt: number,
): Ud3GenerationResult {
  if (!Number.isFinite(depositUsdt) || depositUsdt <= 0) {
    return {
      depositUsdt: 0,
      tier: null,
      tierRatePct: 0,
      generatedUd3: 0,
      directUd3: 0,
      networkPoolUd3: 0,
    };
  }
  const tier = getUd3Tier(referrerTotalPerfUsdt);
  const rate = tier?.rate ?? 0;
  const generatedUd3 = round6(depositUsdt * rate);
  const directUd3 = round6(generatedUd3 * UD3_DIRECT_SHARE);
  const networkPoolUd3 = round6(generatedUd3 * UD3_NETWORK_SHARE);
  return {
    depositUsdt,
    tier,
    tierRatePct: tier?.ratePct ?? 0,
    generatedUd3,
    directUd3,
    networkPoolUd3,
  };
}

// ─── Network differential (极差) ─────────────────────────────────────────────

export type Ud3UplineNode = {
  wallet: string;
  /** Cumulative S share pct of network pool (20/40/55/70/85/100). 0 = no S. */
  vSharePct: number;
  vLabel?: string;
};

export type Ud3DifferentialPayout = {
  wallet: string;
  vSharePct: number;
  vLabel?: string;
  /** Gap percent applied this layer. */
  gapPct: number;
  ud3Amount: number;
};

export type Ud3DifferentialResult = {
  payouts: Ud3DifferentialPayout[];
  allocatedPct: number;
  allocatedUd3: number;
  /** Unallocated share of the pool (waiting for higher S above). */
  remainingPct: number;
  remainingUd3: number;
};

/**
 * Allocate network pool by differential.
 * `chainBottomToTop`: closest upline first (excluding direct 引路人 who already got 60%),
 * then parents up to root.
 *
 * gap = max(ownSShare − maxEmittedBelow, 0)
 */
export function allocateNetworkDifferential(
  networkPoolUd3: number,
  chainBottomToTop: Ud3UplineNode[],
): Ud3DifferentialResult {
  if (networkPoolUd3 <= 0 || chainBottomToTop.length === 0) {
    return {
      payouts: [],
      allocatedPct: 0,
      allocatedUd3: 0,
      remainingPct: 100,
      remainingUd3: round6(Math.max(0, networkPoolUd3)),
    };
  }

  let maxEmitted = 0;
  const payouts: Ud3DifferentialPayout[] = [];

  for (const node of chainBottomToTop) {
    const own = Math.max(0, Math.min(100, Number(node.vSharePct) || 0));
    const gapPct = Math.max(own - maxEmitted, 0);
    const ud3Amount = gapPct > 0 ? round6((networkPoolUd3 * gapPct) / 100) : 0;
    if (gapPct > 0) {
      payouts.push({
        wallet: node.wallet,
        vSharePct: own,
        vLabel: node.vLabel,
        gapPct,
        ud3Amount,
      });
      maxEmitted = own;
    } else {
      payouts.push({
        wallet: node.wallet,
        vSharePct: own,
        vLabel: node.vLabel,
        gapPct: 0,
        ud3Amount: 0,
      });
    }
  }

  const allocatedUd3 = round6(payouts.reduce((s, p) => s + p.ud3Amount, 0));
  const allocatedPct = maxEmitted;
  return {
    payouts,
    allocatedPct,
    allocatedUd3,
    remainingPct: Math.max(0, 100 - allocatedPct),
    remainingUd3: round6(Math.max(0, networkPoolUd3 - allocatedUd3)),
  };
}

/** Full event: generate from deposit + pay direct + allocate network differential. */
export function settleUd3DepositEvent(input: {
  depositUsdt: number;
  referrerWallet: string;
  referrerTotalPerfUsdt: number;
  /** Upline ABOVE referrer, bottom→top. */
  networkChainAboveReferrer: Ud3UplineNode[];
}) {
  const gen = generateUd3FromDeposit(input.depositUsdt, input.referrerTotalPerfUsdt);
  const network = allocateNetworkDifferential(gen.networkPoolUd3, input.networkChainAboveReferrer);
  return {
    ...gen,
    referrerWallet: input.referrerWallet,
    network,
  };
}
