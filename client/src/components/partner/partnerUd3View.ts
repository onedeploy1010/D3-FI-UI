import { type PartnerState, type Ud3SettlementRecord } from '@/components/partner/partnerData';
import { computePartnerAreaStats, type PartnerTeamNode } from '@/components/partner/partnerTeamData';
import { estimatePendingUd3ForMe } from '@/components/partner/ud3DemoSettle';
import type { PartnerUd3AllocationRow, PartnerTeamStats } from '@/lib/d3fiTypes';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Settled (已结算) UD3 from the reward list — excludes rows still pending (未结算). */
export function sumSettledUd3(state: PartnerState): number {
  return round2(
    (state.ud3SettlementHistory ?? [])
      .filter((r) => r.settlementStatus !== 'pending')
      .reduce((s, r) => s + r.ud3Amount, 0),
  );
}

/** Unsettled (未结算) UD3 from the reward list. */
export function sumPendingUd3(state: PartnerState): number {
  return round2(
    (state.ud3SettlementHistory ?? [])
      .filter((r) => r.settlementStatus === 'pending')
      .reduce((s, r) => s + r.ud3Amount, 0),
  );
}

export function sumUd3Transferred(state: PartnerState): number {
  return round2((state.transfers ?? []).reduce((s, t) => s + t.amountUd3, 0));
}

/** Settled UD3 total — history sum, then lifetime, then balance (covers demo API gaps). */
export function resolveSettledUd3Base(state: PartnerState): number {
  const fromHistory = sumSettledUd3(state);
  if (fromHistory > 0) return fromHistory;
  if (state.lifetimeUd3Earned > 0) return round2(state.lifetimeUd3Earned);
  if (state.ud3Balance > 0) return round2(state.ud3Balance);
  return 0;
}

/** Available UD3 — partners use server balance; others deduct transfers/stakes from settled base. */
export function getUd3Available(state: PartnerState): number {
  // Spendable UD3 is the current account balance, which the server debits on every
  // stake/transfer — authoritative for partners and non-partners alike. (UD3 earned
  // from downline deposits is credited immediately, so no separate "settled" gate.)
  if (state.ud3Balance > 0 || state.isPartner) return Math.max(0, round2(state.ud3Balance));
  // Fallback for demo / not-yet-hydrated local state with no live account balance.
  const settled = resolveSettledUd3Base(state);
  const transferred = sumUd3Transferred(state);
  const staked = state.ud3StakedFromRewards ?? 0;
  return Math.max(0, round2(settled - transferred - staked));
}

export type PartnerUd3Metrics = {
  pendingUd3: number;
  lifetimeUd3: number;
  availableUd3: number;
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

export function mapUd3AllocationsToHistory(rows: PartnerUd3AllocationRow[] = []): Ud3SettlementRecord[] {
  return rows.map((r) => ({
    id: r.id,
    settledAt: r.settlement_date,
    teamPerformanceUsd: 0,
    dailyNewPerformanceUsd: Number(r.event_amount_usd),
    tierRatePct: Number(r.tier_rate_pct),
    rewardSharePct: Number(r.reward_share_pct),
    role: r.role,
    sourceAddress: r.source_wallet,
    ud3Amount: Number(r.sd3_amount),
  }));
}

export function resolvePartnerUd3Metrics(
  state: PartnerState,
  teamNodes: Record<string, PartnerTeamNode>,
  teamStats?: PartnerTeamStats,
  pendingFromApi?: number,
): PartnerUd3Metrics {
  const fromStats = areasFromTeamStats(teamStats);
  const areas = fromStats ?? computePartnerAreaStats(teamNodes);
  // 未结算 (pending) UD3: authoritative from the account's pending_ud3; fall back to
  // the reward-list pending sum, then the demo/team estimate. Kept in sync with the
  // reward list's 未结算 rows so the summary and list never disagree.
  const pendingFromRules = estimatePendingUd3ForMe(teamNodes);
  const pendingFromHistory = sumPendingUd3(state);
  const pendingUd3 =
    state.pendingUd3 > 0
      ? round2(state.pendingUd3)
      : pendingFromHistory > 0
        ? pendingFromHistory
        : pendingFromApi != null && pendingFromApi > 0
          ? pendingFromApi
          : pendingFromRules;
  // 已结算 (settled) UD3: the settled cumulative from the account; fall back to the
  // settled-only reward-list sum. Pending rewards must NOT count here.
  const settled = sumSettledUd3(state);
  const lifetimeUd3 =
    state.lifetimeUd3Earned > 0 ? state.lifetimeUd3Earned : settled;
  return {
    pendingUd3,
    lifetimeUd3,
    availableUd3: getUd3Available(state),
    areas,
  };
}
