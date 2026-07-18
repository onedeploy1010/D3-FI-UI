/**
 * Pure, exact-decimal UD3 (反向金) reward calculator — V3 model.
 *
 * NO side effects, NO DB, NO network, NO JS `Number` money math — every value is
 * a `Decimal`. The caller resolves tiers/ranks/eligibility (from ud3RewardConfig.ts
 * and the on-chain/DB context) then hands this function a fully-materialised input;
 * this function only computes the split. Determinism + purity make it safe to
 * replay for reconciliation and to unit-test against exact spec vectors.
 *
 * Model — "tier-coefficient × cumulative-difference":
 *   For EACH tier slot S1..S6:
 *     rewardAmount[Sk] = principal × networkRate × coefficient[Sk] × incremental[Sk]
 *   where incremental[Sk] is the級差 derived from the cumulative ladder.
 *
 *   Each slot is matched INDEPENDENTLY to the NEAREST up-chain ancestor whose own
 *   tier rank is >= the slot rank AND who is reward-eligible. A single ancestor may
 *   absorb multiple slots. A slot never skips a nearer qualified ancestor for a
 *   farther higher-tier one. A slot with no such ancestor is UNALLOCATED.
 *
 *   GUIDE (引路人) reward is an INDEPENDENT ladder:
 *     guideReward = principal × guideBaseShare × coefficient[guideTier]
 *
 * Conservation (asserted): networkAllocated + networkUnallocated == networkTotalCalculated
 * exactly, with no negative amounts. Total/burn are OUT OF SCOPE (no forced total).
 */
import Decimal from 'npm:decimal.js@10';
import {
  getUd3RewardConfig,
  incrementalRate,
  previousCumulativeRate,
  UD3_REWARD_CONFIG_LATEST,
  UD3_ALGO_VERSION_V3,
  type Ud3RewardConfig,
} from './ud3RewardConfig.ts';

export interface Ud3NetworkAncestor {
  userId: string;
  /** 1 = direct referrer, increasing up the chain. */
  relationDepth: number;
  /** Ancestor's own 档位 'S1'..'S6'. */
  tierCode: string;
  /** Ancestor's own tier rank (S1=1 … S6=6). */
  tierRank: number;
  /** Whether this ancestor may currently receive a reward. */
  isRewardEligible: boolean;
}

export interface CalculateUd3TierDifferenceRewardsInput {
  orderId: string;
  principalAmount: Decimal;
  guideUserId: string | null;
  /** 引路人档位 'S1'..'S6' or null. */
  guideTierCode: string | null;
  /** 网体 ancestors, nearest first (any order accepted — sorted internally by depth). */
  networkAncestors: Ud3NetworkAncestor[];
  configVersion?: string;
}

export type Ud3TierRewardStatus = 'CALCULATED' | 'UNALLOCATED';
export type Ud3UnallocatedReason =
  | 'NO_QUALIFIED_ANCESTOR'
  | 'EMPTY_REFERRAL_CHAIN'
  | 'ALL_MATCHED_USERS_INELIGIBLE';

export interface Ud3TierReward {
  rewardTierCode: string;
  rewardTierRank: number;
  tierCoefficient: Decimal;
  cumulativeRate: Decimal;
  previousCumulativeRate: Decimal;
  incrementalRate: Decimal;
  /** principal × networkRate × coefficient × incrementalRate (ROUND_DOWN 6dp). */
  rewardAmount: Decimal;
  status: Ud3TierRewardStatus;
  receiverUserId: string | null;
  receiverTierCode: string | null;
  receiverTierRank: number | null;
  receiverRelationDepth: number | null;
  unallocatedReason: Ud3UnallocatedReason | null;
}

export interface Ud3GuideReward {
  userId: string | null;
  tierCode: string | null;
  coefficient: Decimal;
  rewardAmount: Decimal;
}

export interface CalculateUd3TierDifferenceRewardsResult {
  orderId: string;
  guideReward: Ud3GuideReward;
  networkRate: Decimal;
  tierRewards: Ud3TierReward[];
  networkTotalCalculated: Decimal;
  networkAllocated: Decimal;
  networkUnallocated: Decimal;
  algorithmVersion: string;
  configVersion: string;
}

/** Round a Decimal down to the token precision. Never rounds up money. */
function roundDown(value: Decimal, decimals: number): Decimal {
  return value.toDecimalPlaces(decimals, Decimal.ROUND_DOWN);
}

/**
 * Compute the full UD3 tier-difference reward distribution for one order.
 * Pure: identical input → identical output.
 */
export function calculateUd3TierDifferenceRewards(
  input: CalculateUd3TierDifferenceRewardsInput,
): CalculateUd3TierDifferenceRewardsResult {
  const config: Ud3RewardConfig = getUd3RewardConfig(input.configVersion);
  const dp = config.udDecimals;
  const principal = input.principalAmount;
  const networkRate = config.networkRate;

  // ── 引路人 (guide) — independent ladder: principal × 0.6 × coefficient(guideTier) ──
  const guideTier = input.guideTierCode != null
    ? config.tiers.find((t) => t.code === input.guideTierCode)
    : undefined;
  const hasGuide = input.guideUserId != null && guideTier != null;
  const guideCoefficient = hasGuide ? guideTier!.coefficient : new Decimal(0);
  const guideReward: Ud3GuideReward = {
    userId: hasGuide ? input.guideUserId : null,
    tierCode: hasGuide ? input.guideTierCode : null,
    coefficient: guideCoefficient,
    rewardAmount: hasGuide
      ? roundDown(principal.times(config.guideBaseShare).times(guideCoefficient), dp)
      : new Decimal(0),
  };

  // Nearest-first ancestor ordering. Stable within equal depth by original order.
  const sorted = input.networkAncestors
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (x.a.relationDepth - y.a.relationDepth) || (x.i - y.i))
    .map((x) => x.a);
  const noAncestors = sorted.length === 0;

  const tierRewards: Ud3TierReward[] = [];
  let networkTotalCalculated = new Decimal(0);
  let networkAllocated = new Decimal(0);
  let networkUnallocated = new Decimal(0);

  for (const tier of config.tiers) {
    const coefficient = tier.coefficient;
    const incremental = incrementalRate(tier.code, config);
    const prevCumulative = previousCumulativeRate(tier.code, config);
    const rewardAmount = roundDown(
      principal.times(networkRate).times(coefficient).times(incremental),
      dp,
    );
    networkTotalCalculated = networkTotalCalculated.plus(rewardAmount);

    // Match receiver: nearest ancestor with tierRank >= slot rank AND eligible.
    let receiver: Ud3NetworkAncestor | null = null;
    let anyRankQualified = false; // some ancestor had rank >= slot rank (eligible or not)
    for (const ancestor of sorted) {
      if (ancestor.tierRank >= tier.rank) {
        anyRankQualified = true;
        if (ancestor.isRewardEligible === true) {
          receiver = ancestor;
          break;
        }
      }
    }

    if (receiver) {
      networkAllocated = networkAllocated.plus(rewardAmount);
      tierRewards.push({
        rewardTierCode: tier.code,
        rewardTierRank: tier.rank,
        tierCoefficient: coefficient,
        cumulativeRate: tier.cumulativeRate,
        previousCumulativeRate: prevCumulative,
        incrementalRate: incremental,
        rewardAmount,
        status: 'CALCULATED',
        receiverUserId: receiver.userId,
        receiverTierCode: receiver.tierCode,
        receiverTierRank: receiver.tierRank,
        receiverRelationDepth: receiver.relationDepth,
        unallocatedReason: null,
      });
    } else {
      networkUnallocated = networkUnallocated.plus(rewardAmount);
      const reason: Ud3UnallocatedReason = noAncestors
        ? 'EMPTY_REFERRAL_CHAIN'
        : anyRankQualified
          ? 'ALL_MATCHED_USERS_INELIGIBLE'
          : 'NO_QUALIFIED_ANCESTOR';
      tierRewards.push({
        rewardTierCode: tier.code,
        rewardTierRank: tier.rank,
        tierCoefficient: coefficient,
        cumulativeRate: tier.cumulativeRate,
        previousCumulativeRate: prevCumulative,
        incrementalRate: incremental,
        rewardAmount,
        status: 'UNALLOCATED',
        receiverUserId: null,
        receiverTierCode: null,
        receiverTierRank: null,
        receiverRelationDepth: null,
        unallocatedReason: reason,
      });
    }
  }

  // Hard invariant — allocated + unallocated must reconcile exactly to the total.
  const reconciled = networkAllocated.plus(networkUnallocated);
  if (!reconciled.equals(networkTotalCalculated)) {
    throw new Error(
      `calculateUd3TierDifferenceRewards: conservation violated for order ${input.orderId}: ` +
        `${reconciled.toString()} != ${networkTotalCalculated.toString()}`,
    );
  }

  return {
    orderId: input.orderId,
    guideReward,
    networkRate,
    tierRewards,
    networkTotalCalculated,
    networkAllocated,
    networkUnallocated,
    algorithmVersion: config.algorithmVersion ?? UD3_ALGO_VERSION_V3,
    configVersion: config.version,
  };
}

/**
 * Deterministic idempotency key for persisting a single UD3 tier reward slot. The
 * caller uses this as a unique constraint so retries never double-credit a slot.
 */
export function ud3TierRewardIdempotencyKey(
  orderId: string,
  rewardTierCode: string,
  algoVersion: string = UD3_ALGO_VERSION_V3,
): string {
  return `UD3_TIER_REWARD:${orderId}:${rewardTierCode}:${algoVersion}`;
}
