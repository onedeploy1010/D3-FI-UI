/**
 * Versioned UD3 (反向金) reward configuration.
 *
 * Precision-critical: every ratio is a `Decimal`, never a JS `Number`. All money
 * math downstream (ud3Reward.ts) consumes these Decimals directly. Nothing about
 * the reward economics is hardcoded elsewhere — callers resolve levels then read
 * their rates from here so a single versioned object is the source of truth.
 *
 * Model (v2, 2026-07):
 *   总贿赂 (total bribe) = principal × bribeRate (150%)
 *   引路人基础池 (guide base pool)  = principal × guideBaseShare (60%)
 *   网体基础池 (network base pool)  = principal × networkBaseShare (40%)
 *
 *   引路人 payout = guideBasePool × guideLevelRate(S1..S6 = 1.0 .. 1.5)
 *   网体 payout   = networkBasePool distributed UP the chain by cumulative
 *                   级差 (difference) of `networkCumulativeRates` (S0..S6).
 *   Everything not paid out (rounding tail + unreleased guide/network slice) is
 *   burned so conservation is exact.
 */
import Decimal from 'npm:decimal.js@10';

export type Ud3GuideLevel = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
export type Ud3NetworkLevel = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

export interface Ud3RewardConfig {
  /** Stable identifier persisted alongside every reward row for auditability. */
  version: string;
  /** 总贿赂 multiplier on principal. */
  bribeRate: Decimal;
  /** 引路人基础池 share of principal. */
  guideBaseShare: Decimal;
  /** 网体基础池 share of principal. */
  networkBaseShare: Decimal;
  /** 引路人档位权益: S1..S6 → multiplier applied to the guide base pool. */
  guideLevelRates: Readonly<Record<Ud3GuideLevel, Decimal>>;
  /** 网体累计权益: S0..S6 → cumulative multiple of the network base pool. */
  networkCumulativeRates: Readonly<Record<Ud3NetworkLevel, Decimal>>;
  /** Token precision for rounding every payout (ROUND_DOWN). */
  udDecimals: number;
}

/**
 * v2 (2026-07). Guide ladder S1 100% → S6 150%. Network cumulative ladder
 * S0 0 → S6 150% of the 40% base pool (so the whole 网体基础池 × 1.5 can be
 * released across a full S1→S6 chain).
 */
export const UD3_REWARD_CONFIG_V2: Ud3RewardConfig = Object.freeze({
  version: 'ud3-v2-2026-07',
  bribeRate: new Decimal('1.5'),
  guideBaseShare: new Decimal('0.6'),
  networkBaseShare: new Decimal('0.4'),
  guideLevelRates: Object.freeze({
    S1: new Decimal('1.0'),
    S2: new Decimal('1.1'),
    S3: new Decimal('1.2'),
    S4: new Decimal('1.3'),
    S5: new Decimal('1.4'),
    S6: new Decimal('1.5'),
  }),
  networkCumulativeRates: Object.freeze({
    S0: new Decimal('0'),
    S1: new Decimal('0.20'),
    S2: new Decimal('0.44'),
    S3: new Decimal('0.66'),
    S4: new Decimal('0.91'),
    S5: new Decimal('1.19'),
    S6: new Decimal('1.50'),
  }),
  udDecimals: 6,
});

/** All known configs, newest first. `[0]` is the latest/default. */
export const UD3_REWARD_CONFIGS: readonly Ud3RewardConfig[] = Object.freeze([
  UD3_REWARD_CONFIG_V2,
]);

/** Latest config version string (default when none supplied). */
export const UD3_REWARD_CONFIG_LATEST = UD3_REWARD_CONFIG_V2.version;

/**
 * Resolve a config by version. Defaults to the latest. Throws on an unknown
 * version so a stale/typo'd version can never silently fall back to the wrong
 * economics.
 */
export function getUd3RewardConfig(version?: string): Ud3RewardConfig {
  if (version == null) return UD3_REWARD_CONFIG_V2;
  const found = UD3_REWARD_CONFIGS.find((c) => c.version === version);
  if (!found) {
    throw new Error(`getUd3RewardConfig: unknown UD3 reward config version "${version}"`);
  }
  return found;
}

/**
 * 引路人档位权益 rate for a level. Returns Decimal(0) for null/unknown level so
 * a missing guide contributes nothing (and burn absorbs the slice).
 */
export function guideLevelRateFor(
  level: string | null | undefined,
  config: Ud3RewardConfig = UD3_REWARD_CONFIG_V2,
): Decimal {
  if (level == null) return new Decimal(0);
  const rate = (config.guideLevelRates as Record<string, Decimal | undefined>)[level];
  return rate ?? new Decimal(0);
}

/**
 * 网体累计权益 rate for a level. Returns Decimal(0) for null/unknown level
 * (treated as S0 — no cumulative share).
 */
export function networkCumulativeRateFor(
  level: string | null | undefined,
  config: Ud3RewardConfig = UD3_REWARD_CONFIG_V2,
): Decimal {
  if (level == null) return new Decimal(0);
  const rate = (config.networkCumulativeRates as Record<string, Decimal | undefined>)[level];
  return rate ?? new Decimal(0);
}

/** Highest cumulative network rate in the config (S6). Used as the clamp ceiling. */
export function maxNetworkCumulativeRate(config: Ud3RewardConfig = UD3_REWARD_CONFIG_V2): Decimal {
  return Object.values(config.networkCumulativeRates).reduce(
    (max, r) => (r.gt(max) ? r : max),
    new Decimal(0),
  );
}
