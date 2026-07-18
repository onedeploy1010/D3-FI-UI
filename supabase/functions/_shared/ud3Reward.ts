/**
 * Pure, exact-decimal UD3 (反向金) reward calculator.
 *
 * NO side effects, NO DB, NO network, NO JS `Number` money math — every value is
 * a `Decimal`. The caller resolves levels/rates (from ud3RewardConfig.ts) and the
 * on-chain/DB context, then hands this function a fully-materialised input; this
 * function only computes the split. Determinism + purity make it safe to replay
 * for reconciliation and to unit-test against exact spec vectors.
 *
 * Conservation invariant (asserted): for every result,
 *   guideReward + networkRewardTotal + burnAmount === totalBribeAmount
 * with no negative amounts and networkRewardTotal ≤ networkBasePool × maxCumulative.
 */
import Decimal from 'npm:decimal.js@10';
import {
  getUd3RewardConfig,
  maxNetworkCumulativeRate,
  UD3_REWARD_CONFIG_LATEST,
  type Ud3RewardConfig,
} from './ud3RewardConfig.ts';

export interface CalculateUd3RewardInput {
  orderId: string;
  principalAmount: Decimal;
  bribeRate: Decimal;
  guideUserId: string | null;
  /** 'S1'..'S6' or null. */
  guideLevel: string | null;
  /** Caller-resolved 引路人档位 rate, e.g. Decimal(1.0) for S1. */
  guideLevelRate: Decimal;
  /** 网体 ancestors with caller-resolved cumulative rates (decimals like 0.20). */
  networkAncestors: Array<{
    userId: string;
    relationDepth: number;
    level: string;
    cumulativeRate: Decimal;
  }>;
  levelConfigVersion: string;
}

export interface Ud3NetworkRewardRow {
  userId: string;
  relationDepth: number;
  level: string;
  cumulativeRate: Decimal;
  previousReleasedRate: Decimal;
  differenceRate: Decimal;
  rewardAmount: Decimal;
  rewardStatus: 'REWARDED' | 'NO_DIFFERENCE';
}

export interface CalculateUd3RewardResult {
  orderId: string;
  principalAmount: Decimal;
  bribeRate: Decimal;
  totalBribeAmount: Decimal;
  guideReward: {
    userId: string | null;
    level: string | null;
    levelRate: Decimal;
    rewardAmount: Decimal;
  };
  networkBasePool: Decimal;
  networkRewardTotal: Decimal;
  networkRewards: Ud3NetworkRewardRow[];
  burnAmount: Decimal;
  configVersion: string;
}

/** Round a Decimal down to the token precision. Never rounds up money. */
function roundDown(value: Decimal, decimals: number): Decimal {
  return value.toDecimalPlaces(decimals, Decimal.ROUND_DOWN);
}

/**
 * Compute the full UD3 reward distribution for a single credited deposit/order.
 * Pure: identical input → identical output.
 */
export function calculateUd3RewardDistribution(
  input: CalculateUd3RewardInput,
): CalculateUd3RewardResult {
  const config: Ud3RewardConfig = getUd3RewardConfig(input.levelConfigVersion);
  const dp = config.udDecimals;

  const principal = input.principalAmount;
  const bribeRate = input.bribeRate;

  // The 引路人档位 (guide tier rate) is the GENERATION multiplier: no valid tier →
  // no bribe generated at all (guards against an unbacked network payout / negative burn).
  const genRate = input.guideLevelRate && input.guideLevelRate.gt(0) ? input.guideLevelRate : new Decimal(0);
  if (genRate.lte(0)) {
    return {
      orderId: input.orderId,
      principalAmount: principal,
      bribeRate,
      totalBribeAmount: new Decimal(0),
      guideReward: { userId: null, level: null, levelRate: new Decimal(0), rewardAmount: new Decimal(0) },
      networkBasePool: new Decimal(0),
      networkRewardTotal: new Decimal(0),
      networkRewards: [],
      burnAmount: new Decimal(0),
      configVersion: config.version,
    };
  }

  // ── 总贿赂 = 入金 × 引路人档位 × bribeRate ──────────────────────────────────
  const totalBribeAmount = roundDown(principal.times(genRate).times(bribeRate), dp);

  // ── 引路人 (guide) — 60% base pool × 档位 rate ─────────────────────────────
  // Missing guide (no user OR no level) contributes nothing; the slice is burned.
  const hasGuide = input.guideUserId != null && input.guideLevel != null;
  const guideRewardAmount = hasGuide
    ? roundDown(principal.times(config.guideBaseShare).times(input.guideLevelRate), dp)
    : new Decimal(0);

  const guideReward = {
    userId: hasGuide ? input.guideUserId : null,
    level: hasGuide ? input.guideLevel : null,
    levelRate: hasGuide ? input.guideLevelRate : new Decimal(0),
    rewardAmount: guideRewardAmount,
  };

  // ── 网体基础池 (network base pool) — 40% of principal ──────────────────────
  const networkBasePool = roundDown(principal.times(config.networkBaseShare), dp);

  // ── 网体级差 (cumulative-difference) allocation ────────────────────────────
  // Sort closest-first; dedupe by userId (keep the closest depth). Walk up: each
  // ancestor releases only the gap above the highest cumulative rate released so
  // far. Same-or-lower level than someone already released → NO_DIFFERENCE (0),
  // and it does NOT advance the released frontier.
  const sorted = [...input.networkAncestors].sort((a, b) => a.relationDepth - b.relationDepth);
  const seen = new Set<string>();

  const networkRewards: Ud3NetworkRewardRow[] = [];
  let previousReleasedRate = new Decimal(0);
  let networkRewardTotal = new Decimal(0);
  const maxCumulative = maxNetworkCumulativeRate(config);
  const networkCeiling = roundDown(networkBasePool.times(maxCumulative), dp);

  for (const ancestor of sorted) {
    if (seen.has(ancestor.userId)) continue;
    seen.add(ancestor.userId);

    const currentRate = ancestor.cumulativeRate;

    if (currentRate.lte(previousReleasedRate)) {
      networkRewards.push({
        userId: ancestor.userId,
        relationDepth: ancestor.relationDepth,
        level: ancestor.level,
        cumulativeRate: currentRate,
        previousReleasedRate,
        differenceRate: new Decimal(0),
        rewardAmount: new Decimal(0),
        rewardStatus: 'NO_DIFFERENCE',
      });
      continue;
    }

    const differenceRate = currentRate.minus(previousReleasedRate);
    let rewardAmount = roundDown(networkBasePool.times(differenceRate), dp);

    // Defensive clamp: total network payout can never exceed the ceiling.
    const remainingCeiling = networkCeiling.minus(networkRewardTotal);
    if (rewardAmount.gt(remainingCeiling)) {
      rewardAmount = remainingCeiling.gt(0) ? remainingCeiling : new Decimal(0);
    }

    networkRewards.push({
      userId: ancestor.userId,
      relationDepth: ancestor.relationDepth,
      level: ancestor.level,
      cumulativeRate: currentRate,
      previousReleasedRate,
      differenceRate,
      rewardAmount,
      rewardStatus: 'REWARDED',
    });

    networkRewardTotal = networkRewardTotal.plus(rewardAmount);
    previousReleasedRate = currentRate;
  }

  // ── Burn absorbs the tail (rounding + unreleased guide/network slice) ──────
  let effectiveGuide = guideRewardAmount;
  let effectiveNetworkTotal = networkRewardTotal;

  // Guard against a mis-configured input producing negative burn: clamp network,
  // then guide, so burn is never negative. With the shipped config this branch is
  // never taken (max guide 90% + max network 60% == 150% == totalBribe).
  let burnAmount = totalBribeAmount.minus(effectiveGuide).minus(effectiveNetworkTotal);
  if (burnAmount.isNegative()) {
    const overshoot = burnAmount.abs();
    const networkReducible = Decimal.min(effectiveNetworkTotal, overshoot);
    effectiveNetworkTotal = effectiveNetworkTotal.minus(networkReducible);
    let remaining = overshoot.minus(networkReducible);
    if (remaining.gt(0)) {
      const guideReducible = Decimal.min(effectiveGuide, remaining);
      effectiveGuide = effectiveGuide.minus(guideReducible);
      remaining = remaining.minus(guideReducible);
    }
    guideReward.rewardAmount = effectiveGuide;
    networkRewardTotal = effectiveNetworkTotal;
    burnAmount = totalBribeAmount.minus(effectiveGuide).minus(effectiveNetworkTotal);
  }

  // Hard invariants — fail loudly rather than emit an unbalanced distribution.
  if (burnAmount.isNegative()) {
    throw new Error(`calculateUd3RewardDistribution: negative burn for order ${input.orderId}`);
  }
  const reconciled = guideReward.rewardAmount.plus(networkRewardTotal).plus(burnAmount);
  if (!reconciled.equals(totalBribeAmount)) {
    throw new Error(
      `calculateUd3RewardDistribution: conservation violated for order ${input.orderId}: ` +
        `${reconciled.toString()} != ${totalBribeAmount.toString()}`,
    );
  }

  return {
    orderId: input.orderId,
    principalAmount: principal,
    bribeRate,
    totalBribeAmount,
    guideReward,
    networkBasePool,
    networkRewardTotal,
    networkRewards,
    burnAmount,
    configVersion: config.version,
  };
}

/**
 * Deterministic idempotency key for persisting a single UD3 reward payout. The
 * caller uses this as a unique constraint so retries never double-credit.
 */
export function ud3RewardIdempotencyKey(
  orderId: string,
  beneficiaryUserId: string,
  rewardType: string,
  configVersion: string = UD3_REWARD_CONFIG_LATEST,
): string {
  return `UD3_REWARD:${orderId}:${beneficiaryUserId}:${rewardType}:${configVersion}`;
}
