import { type PartnerState, type Sd3SettlementRecord } from '@/components/partner/partnerData';
import { computePartnerAreaStats, type PartnerTeamNode } from '@/components/partner/partnerTeamData';
import { estimatePendingUd3ForMe } from '@/components/partner/ud3DemoSettle';
import type { PartnerSd3AllocationRow, PartnerTeamStats } from '@/lib/d3fiTypes';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumSettledSd3(state: PartnerState): number {
  return round2((state.sd3SettlementHistory ?? []).reduce((s, r) => s + r.sd3Amount, 0));
}

export function sumSd3Transferred(state: PartnerState): number {
  return round2((state.transfers ?? []).reduce((s, t) => s + t.amountSd3, 0));
}

/** Settled sD3 total — history sum, then lifetime, then balance (covers demo API gaps). */
export function resolveSettledSd3Base(state: PartnerState): number {
  const fromHistory = sumSettledSd3(state);
  if (fromHistory > 0) return fromHistory;
  if (state.lifetimeSd3Earned > 0) return round2(state.lifetimeSd3Earned);
  if (state.sd3Balance > 0) return round2(state.sd3Balance);
  return 0;
}

/** Available sD3 — partners use server balance; others deduct transfers/stakes from settled base. */
export function getSd3Available(state: PartnerState): number {
  if (state.isPartner) return round2(state.sd3Balance);
  const settled = resolveSettledSd3Base(state);
  const transferred = sumSd3Transferred(state);
  const staked = state.sd3StakedFromRewards ?? 0;
  return Math.max(0, round2(settled - transferred - staked));
}

export type PartnerSd3Metrics = {
  pendingSd3: number;
  lifetimeSd3: number;
  availableSd3: number;
  areas: ReturnType<typeof computePartnerAreaStats>;
};

function areasFromTeamStats(teamStats?: PartnerTeamStats) {
  if (!teamStats?.smallAreaPerformanceUsd && !teamStats?.largeAreaPerformanceUsd) return null;
  return {
    smallAreaUsd: teamStats.smallAreaPerformanceUsd ?? 0,
    smallAreaNewUsd: teamStats.smallAreaNewPerformanceUsd ?? 0,
    largeAreaUsd: teamStats.largeAreaPerformanceUsd ?? 0,
    largeAreaNewUsd: teamStats.largeAreaNewPerformanceUsd ?? 0,
  };
}

export function mapSd3AllocationsToHistory(rows: PartnerSd3AllocationRow[] = []): Sd3SettlementRecord[] {
  return rows.map((r) => ({
    id: r.id,
    settledAt: r.settlement_date,
    teamPerformanceUsd: 0,
    dailyNewPerformanceUsd: Number(r.event_amount_usd),
    tierRatePct: Number(r.tier_rate_pct),
    rewardSharePct: Number(r.reward_share_pct),
    role: r.role,
    sourceAddress: r.source_wallet,
    sd3Amount: Number(r.sd3_amount),
  }));
}

export function resolvePartnerSd3Metrics(
  state: PartnerState,
  teamNodes: Record<string, PartnerTeamNode>,
  teamStats?: PartnerTeamStats,
  pendingFromApi?: number,
): PartnerSd3Metrics {
  const fromStats = areasFromTeamStats(teamStats);
  const areas = fromStats ?? computePartnerAreaStats(teamNodes);
  /** Pending UD3：按各节点当日新增，直推 60% + 网体级差（与结算引擎一致）。 */
  const pendingFromRules = estimatePendingUd3ForMe(teamNodes);
  const pendingSd3 =
    pendingFromApi != null && pendingFromApi > 0 ? pendingFromApi : pendingFromRules;
  const settled = sumSettledSd3(state);
  const lifetimeSd3 =
    state.lifetimeSd3Earned > 0 ? state.lifetimeSd3Earned : settled > 0 ? settled : 0;
  return {
    pendingSd3,
    lifetimeSd3,
    availableSd3: getSd3Available(state),
    areas,
  };
}
