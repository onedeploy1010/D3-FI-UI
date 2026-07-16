/**
 * D³ UD3 (反向金) reward engine.
 *
 * Same S1–S6 ladder, two roles:
 * ① As 引路人 — 档位 rate (S1 100% → S6 150%) generates bribe from deposit.
 * ② As 上线 — cumulative gap share of the 40% pool (S1 20% → S6 100%).
 *
 * Flow per credited deposit:
 *   generated = amountUsdt × tierRate(引路人)
 *   引路人 gets 60%; remaining 40% walks UP by 级差:
 *     gap% = max(ownShare − max(引路人 share, shares already claimed below), 0)
 *   Same level as someone already on the path → gap 0 (no reward); remainder waits for higher S.
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
 * Cumulative share of the 40% network pool by S id (same id as 档位).
 * S1 20% · S2 40% · S3 55% · S4 70% · S5 85% · S6 100%.
 * `metric` / `minPerfUsdt` kept for admin display; qualification uses 档位 brackets
 * after clearing the S1 entry floor (1000 USDT total).
 */
export const UD3_S_LEVELS: Ud3SLevel[] = [
  { id: 1, label: 'S1', sharePct: 20, metric: 'total', minPerfUsdt: 1_000 },
  { id: 2, label: 'S2', sharePct: 40, metric: 'total', minPerfUsdt: 100_000 },
  { id: 3, label: 'S3', sharePct: 55, metric: 'total', minPerfUsdt: 200_000 },
  { id: 4, label: 'S4', sharePct: 70, metric: 'total', minPerfUsdt: 300_000 },
  { id: 5, label: 'S5', sharePct: 85, metric: 'total', minPerfUsdt: 500_000 },
  { id: 6, label: 'S6', sharePct: 100, metric: 'total', minPerfUsdt: 800_000 },
];

/** @deprecated Use UD3_S_LEVELS */
export const UD3_V_LEVELS = UD3_S_LEVELS;

export type Ud3PerfSnapshot = {
  /** 伞下总业绩（含直推线合计，不含本人入金时可自定） */
  totalPerfUsdt: number;
  /** 小区业绩（展示用；级差级别与档位共用总业绩区间） */
  smallAreaPerfUsdt: number;
};

/**
 * Gap level = same S1–S6 as 档位 (总业绩区间).
 * Demo 7600 → S1 → 20% of network pool. Below 1000 total → no level.
 */
export function resolveUd3SLevel(perf: Ud3PerfSnapshot): Ud3SLevel | null {
  const total = perf.totalPerfUsdt;
  if (!Number.isFinite(total) || total < UD3_S_LEVELS[0].minPerfUsdt) return null;
  const tier = getUd3Tier(total);
  if (!tier) return null;
  return UD3_S_LEVELS[tier.id - 1] ?? null;
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
 * then split 60% 引路人 / 40% 网体级差池.
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

// ─── Network differential (级差) ─────────────────────────────────────────────

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
 * `floorSharePct`: 引路人已占用的累计份额（同级以上不可再拿：S1 后遇到 S1 → 20−20=0）.
 * gap = max(ownShare − maxEmitted, 0); remainder stays for higher S further up.
 */
export function allocateNetworkDifferential(
  networkPoolUd3: number,
  chainBottomToTop: Ud3UplineNode[],
  floorSharePct = 0,
): Ud3DifferentialResult {
  let maxEmitted = Math.max(0, Math.min(100, Number(floorSharePct) || 0));

  if (networkPoolUd3 <= 0) {
    return {
      payouts: [],
      allocatedPct: maxEmitted,
      allocatedUd3: 0,
      remainingPct: Math.max(0, 100 - maxEmitted),
      remainingUd3: 0,
    };
  }

  if (chainBottomToTop.length === 0) {
    // No uplines: entire 40% pool is unpaid (floor only blocks same-level claims later).
    return {
      payouts: [],
      allocatedPct: maxEmitted,
      allocatedUd3: 0,
      remainingPct: 100,
      remainingUd3: round6(networkPoolUd3),
    };
  }

  const payouts: Ud3DifferentialPayout[] = [];

  for (const node of chainBottomToTop) {
    const own = Math.max(0, Math.min(100, Number(node.vSharePct) || 0));
    const gapPct = Math.max(own - maxEmitted, 0);
    const ud3Amount = gapPct > 0 ? round6((networkPoolUd3 * gapPct) / 100) : 0;
    payouts.push({
      wallet: node.wallet,
      vSharePct: own,
      vLabel: node.vLabel,
      gapPct,
      ud3Amount,
    });
    if (gapPct > 0) maxEmitted = own;
  }

  const allocatedUd3 = round6(payouts.reduce((s, p) => s + p.ud3Amount, 0));
  const remainingUd3 = round6(Math.max(0, networkPoolUd3 - allocatedUd3));
  /** Peak cumulative share reached on the path (incl. 引路人 floor). */
  const allocatedPct = maxEmitted;
  /**
   * Unpaid slice of the 40% pool. Includes the 引路人 floor share of the pool
   * (already compensated via the separate 60% direct) plus any gap above the
   * highest S on the chain. Derive % from UD3 so it stays consistent when floor>0.
   */
  const remainingPct =
    networkPoolUd3 > 0 ? round6((remainingUd3 / networkPoolUd3) * 100) : Math.max(0, 100 - allocatedPct);
  return {
    payouts,
    allocatedPct,
    allocatedUd3,
    remainingPct,
    remainingUd3,
  };
}

/** Full event: generate from deposit + pay direct + allocate network differential. */
export function settleUd3DepositEvent(input: {
  depositUsdt: number;
  referrerWallet: string;
  referrerTotalPerfUsdt: number;
  /** Override 引路人 gap floor; default = resolve from referrerTotalPerfUsdt. */
  referrerNetworkSharePct?: number;
  /** Upline ABOVE referrer, bottom→top. */
  networkChainAboveReferrer: Ud3UplineNode[];
}) {
  const gen = generateUd3FromDeposit(input.depositUsdt, input.referrerTotalPerfUsdt);
  const floorSharePct =
    input.referrerNetworkSharePct ??
    (resolveUd3SLevel({
      totalPerfUsdt: input.referrerTotalPerfUsdt,
      smallAreaPerfUsdt: 0,
    })?.sharePct ?? 0);
  const network = allocateNetworkDifferential(
    gen.networkPoolUd3,
    input.networkChainAboveReferrer,
    floorSharePct,
  );
  return {
    ...gen,
    referrerWallet: input.referrerWallet,
    referrerNetworkSharePct: floorSharePct,
    network,
  };
}
