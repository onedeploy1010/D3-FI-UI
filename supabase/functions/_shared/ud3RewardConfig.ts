/**
 * Versioned UD3 (反向金) reward configuration — V3 model.
 *
 * Precision-critical: every ratio is a `Decimal`, never a JS `Number`. All money
 * math downstream (ud3Reward.ts) consumes these Decimals directly. Nothing about
 * the reward economics is hardcoded elsewhere — callers resolve tiers then read
 * their rates from here so a single versioned object is the source of truth.
 *
 * Model (V3, 2026-07) — "tier-coefficient × cumulative-difference":
 *   The 网体 (network) reward is split across SIX tier slots S1..S6. Each slot is
 *   an independent per-tier reward:
 *
 *     tierReward[Sk] = principal × networkRate × coefficient[Sk] × incremental[Sk]
 *
 *   `incremental[Sk]` is the級差 (difference) of the cumulative ladder, derived at
 *   runtime from `cumulativeRates` (S1 prev = 0). We STORE the cumulative ladder
 *   only and derive the incremental slice, so the two are never out of sync.
 *
 *   Each S-slot is paid to the nearest UP-chain ancestor whose own tier rank is
 *   >= the slot rank AND who is reward-eligible. Slots are matched INDEPENDENTLY:
 *   a single ancestor can absorb several slots, and no slot skips a nearer
 *   qualified ancestor for a farther higher-tier one.
 *
 *   GUIDE (引路人) ladder is INDEPENDENT of the network ladder:
 *     guideReward = principal × guideBaseShare × coefficient[guideTier]
 *
 * The two ladders (`tierCoefficients` and `cumulativeRates`) are independent —
 * never conflate them. `bribeRate` is retained for callers that still compute a
 * total/burn, which is OUT OF SCOPE of this calculator (no forced total here).
 */
import Decimal from 'npm:decimal.js@10';

export type Ud3TierCode = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

/** Algorithm identifier persisted alongside every reward row for auditability. */
export const UD3_ALGO_VERSION_V3 = 'V3_TIER_COEFFICIENT_CUMULATIVE_DIFFERENCE';

export interface Ud3TierDef {
  /** 'S1'..'S6'. */
  code: Ud3TierCode;
  /** Ordinal rank, S1=1 … S6=6. Contiguous and unique. */
  rank: number;
  /** 档位系数 — tier coefficient applied to both guide and network rewards. */
  coefficient: Decimal;
  /** 累计权益 — cumulative rate at this tier (non-decreasing up the ladder). */
  cumulativeRate: Decimal;
}

export interface Ud3RewardConfig {
  /** Stable identifier persisted alongside every reward row for auditability. */
  version: string;
  /** Algorithm identifier ('V3_TIER_COEFFICIENT_CUMULATIVE_DIFFERENCE'). */
  algorithmVersion: string;
  /** 网体基础比例 — network base share of principal (0.40). */
  networkRate: Decimal;
  /** 引路人基础池 share of principal (0.60). */
  guideBaseShare: Decimal;
  /** 总贿赂 multiplier on principal — retained for total/burn callers (OUT OF SCOPE here). */
  bribeRate: Decimal;
  /** Tier ladder S1..S6, ascending rank. */
  tiers: readonly Ud3TierDef[];
  /** Token precision for rounding every payout (ROUND_DOWN). */
  udDecimals: number;
}

/**
 * V3 (2026-07). Two INDEPENDENT ladders:
 *   tierCoefficients : S1..S6 → 1.00 / 1.10 / 1.20 / 1.30 / 1.40 / 1.50
 *   cumulativeRates  : S1..S6 → 0.20 / 0.40 / 0.55 / 0.70 / 0.85 / 1.00
 * incremental (derived) → 0.20 / 0.20 / 0.15 / 0.15 / 0.15 / 0.15
 */
export const UD3_REWARD_CONFIG_V3: Ud3RewardConfig = Object.freeze({
  version: 'ud3-v3-2026-07',
  algorithmVersion: UD3_ALGO_VERSION_V3,
  networkRate: new Decimal('0.40'),
  guideBaseShare: new Decimal('0.6'),
  bribeRate: new Decimal('1.5'),
  tiers: Object.freeze([
    Object.freeze({ code: 'S1', rank: 1, coefficient: new Decimal('1.00'), cumulativeRate: new Decimal('0.20') }),
    Object.freeze({ code: 'S2', rank: 2, coefficient: new Decimal('1.10'), cumulativeRate: new Decimal('0.40') }),
    Object.freeze({ code: 'S3', rank: 3, coefficient: new Decimal('1.20'), cumulativeRate: new Decimal('0.55') }),
    Object.freeze({ code: 'S4', rank: 4, coefficient: new Decimal('1.30'), cumulativeRate: new Decimal('0.70') }),
    Object.freeze({ code: 'S5', rank: 5, coefficient: new Decimal('1.40'), cumulativeRate: new Decimal('0.85') }),
    Object.freeze({ code: 'S6', rank: 6, coefficient: new Decimal('1.50'), cumulativeRate: new Decimal('1.00') }),
  ]) as readonly Ud3TierDef[],
  udDecimals: 6,
}) as Ud3RewardConfig;

/** All known configs, newest first. `[0]` is the latest/default. */
export const UD3_REWARD_CONFIGS: readonly Ud3RewardConfig[] = Object.freeze([
  UD3_REWARD_CONFIG_V3,
]);

/** Latest config version string (default when none supplied). */
export const UD3_REWARD_CONFIG_LATEST = UD3_REWARD_CONFIG_V3.version;

/**
 * Resolve a config by version. Defaults to the latest. Throws on an unknown
 * version so a stale/typo'd version can never silently fall back to the wrong
 * economics.
 */
export function getUd3RewardConfig(version?: string): Ud3RewardConfig {
  if (version == null) return UD3_REWARD_CONFIG_V3;
  const found = UD3_REWARD_CONFIGS.find((c) => c.version === version);
  if (!found) {
    throw new Error(`getUd3RewardConfig: unknown UD3 reward config version "${version}"`);
  }
  return found;
}

/** Tier definition for a code, or undefined for an unknown code. */
export function tierByCode(
  code: string | null | undefined,
  config: Ud3RewardConfig = UD3_REWARD_CONFIG_V3,
): Ud3TierDef | undefined {
  if (code == null) return undefined;
  return config.tiers.find((t) => t.code === code);
}

/** Ordinal rank for a tier code (S1=1 … S6=6), or 0 for null/unknown. */
export function tierRank(
  code: string | null | undefined,
  config: Ud3RewardConfig = UD3_REWARD_CONFIG_V3,
): number {
  return tierByCode(code, config)?.rank ?? 0;
}

/** 档位系数 for a tier code, or Decimal(0) for null/unknown. */
export function tierCoefficient(
  code: string | null | undefined,
  config: Ud3RewardConfig = UD3_REWARD_CONFIG_V3,
): Decimal {
  return tierByCode(code, config)?.coefficient ?? new Decimal(0);
}

/** 累计权益 for a tier code, or Decimal(0) for null/unknown. */
export function cumulativeRate(
  code: string | null | undefined,
  config: Ud3RewardConfig = UD3_REWARD_CONFIG_V3,
): Decimal {
  return tierByCode(code, config)?.cumulativeRate ?? new Decimal(0);
}

/** 累计权益 of the rank immediately below `code` (S1 → 0), or 0 for null/unknown. */
export function previousCumulativeRate(
  code: string | null | undefined,
  config: Ud3RewardConfig = UD3_REWARD_CONFIG_V3,
): Decimal {
  const tier = tierByCode(code, config);
  if (!tier) return new Decimal(0);
  const prev = config.tiers.find((t) => t.rank === tier.rank - 1);
  return prev ? prev.cumulativeRate : new Decimal(0);
}

/**
 * 级差 (incremental / difference) rate for a tier — cumulative[Sk] − cumulative[Sk-1],
 * with S1's predecessor treated as 0. Derived, never stored. Returns 0 for
 * null/unknown codes.
 */
export function incrementalRate(
  code: string | null | undefined,
  config: Ud3RewardConfig = UD3_REWARD_CONFIG_V3,
): Decimal {
  const tier = tierByCode(code, config);
  if (!tier) return new Decimal(0);
  return tier.cumulativeRate.minus(previousCumulativeRate(code, config));
}

function isDecimal(v: unknown): v is Decimal {
  return v instanceof Decimal;
}

/**
 * Validate a UD3 reward config's internal consistency. Throws on any violation so
 * a mis-authored ladder can never reach the money math:
 *   - tier ranks unique + contiguous starting at 1
 *   - no duplicate tier codes
 *   - every coefficient > 0
 *   - cumulative rates non-decreasing along ascending rank (rejects e.g. 0.20/0.40/0.35)
 *   - S1 cumulative >= 0; every derived incremental >= 0
 *   - every rate is a Decimal (never a JS Number)
 */
export function validateUd3Config(config: Ud3RewardConfig): void {
  if (!isDecimal(config.networkRate)) {
    throw new Error('validateUd3Config: networkRate must be a Decimal');
  }
  if (!isDecimal(config.guideBaseShare)) {
    throw new Error('validateUd3Config: guideBaseShare must be a Decimal');
  }
  if (!isDecimal(config.bribeRate)) {
    throw new Error('validateUd3Config: bribeRate must be a Decimal');
  }
  const tiers = config.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error('validateUd3Config: tiers must be a non-empty array');
  }

  const codes = new Set<string>();
  const ranks = new Set<number>();
  for (const t of tiers) {
    if (codes.has(t.code)) {
      throw new Error(`validateUd3Config: duplicate tier code "${t.code}"`);
    }
    codes.add(t.code);

    if (!Number.isInteger(t.rank)) {
      throw new Error(`validateUd3Config: tier "${t.code}" rank must be an integer`);
    }
    if (ranks.has(t.rank)) {
      throw new Error(`validateUd3Config: duplicate tier rank ${t.rank}`);
    }
    ranks.add(t.rank);

    if (!isDecimal(t.coefficient)) {
      throw new Error(`validateUd3Config: tier "${t.code}" coefficient must be a Decimal`);
    }
    if (t.coefficient.lte(0)) {
      throw new Error(`validateUd3Config: tier "${t.code}" coefficient must be > 0`);
    }
    if (!isDecimal(t.cumulativeRate)) {
      throw new Error(`validateUd3Config: tier "${t.code}" cumulativeRate must be a Decimal`);
    }
  }

  // Ranks must be contiguous 1..N.
  for (let rank = 1; rank <= tiers.length; rank++) {
    if (!ranks.has(rank)) {
      throw new Error(`validateUd3Config: tier ranks must be contiguous starting at 1 (missing ${rank})`);
    }
  }

  // Walk ascending rank: cumulative non-decreasing, incremental >= 0, S1 cumulative >= 0.
  const byRank = [...tiers].sort((a, b) => a.rank - b.rank);
  let prevCumulative = new Decimal(0);
  for (const t of byRank) {
    if (t.rank === 1 && t.cumulativeRate.lt(0)) {
      throw new Error(`validateUd3Config: S1 cumulativeRate must be >= 0`);
    }
    if (t.cumulativeRate.lt(prevCumulative)) {
      throw new Error(
        `validateUd3Config: cumulativeRate must be non-decreasing (tier "${t.code}" ` +
          `${t.cumulativeRate.toString()} < previous ${prevCumulative.toString()})`,
      );
    }
    const incremental = t.cumulativeRate.minus(prevCumulative);
    if (incremental.lt(0)) {
      throw new Error(`validateUd3Config: tier "${t.code}" incremental rate must be >= 0`);
    }
    prevCumulative = t.cumulativeRate;
  }
}

// Fail fast at module load if the shipped config is ever mis-authored.
validateUd3Config(UD3_REWARD_CONFIG_V3);
