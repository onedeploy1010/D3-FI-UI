import type { PartnerTeamNode } from '@/components/partner/partnerTeamData';
import type { PartnerState, SubsidyApplication } from '@/components/partner/partnerData';

export type SubsidyQuotaView = {
  ratePct: number;
  calculablePerformanceUsd: number;
  applicableCapUsd: number;
  appliedUsd: number;
  applicableRemainingUsd: number;
  dedupPerformanceUsd: number;
  marketDeductionUsd?: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function branchVolume(node: PartnerTeamNode): number {
  return round2(node.personalUsd + node.teamUsd);
}

/** 伞下合伙人业绩去重：每条直推合伙人线只计分支总量一次。 */
export function computeDedupPartnerPerformanceFromTree(
  nodes: Record<string, PartnerTeamNode>,
  rootId = 'me',
): number {
  const root = nodes[rootId];
  if (!root) return 0;
  return round2(
    root.childrenIds.reduce((sum, id) => {
      const child = nodes[id];
      if (!child?.isPartner) return sum;
      return sum + branchVolume(child);
    }, 0),
  );
}

function collectSubtreeIds(
  nodes: Record<string, PartnerTeamNode>,
  rootId: string,
): Set<string> {
  const out = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id)) continue;
    out.add(id);
    const node = nodes[id];
    if (!node) continue;
    for (const cid of node.childrenIds) queue.push(cid);
  }
  return out;
}

function isTopmostLeaderInTree(
  nodes: Record<string, PartnerTeamNode>,
  rootId: string,
  leaderId: string,
  leaderIds: Set<string>,
): boolean {
  let id: string | null = leaderId;
  while (id && id !== rootId) {
    const node = nodes[id];
    if (!node?.parentId) break;
    if (node.parentId !== rootId && leaderIds.has(node.parentId)) return false;
    id = node.parentId;
  }
  return true;
}

/** 伞下市场领导人业绩去重（客户端演示/离线估算）。 */
export function computeDedupMarketLeaderPerformanceFromTree(
  nodes: Record<string, PartnerTeamNode>,
  rootId = 'me',
  isMarketLeader: (nodeId: string) => boolean,
): number {
  const root = nodes[rootId];
  if (!root) return 0;
  const subtree = collectSubtreeIds(nodes, rootId);
  subtree.delete(rootId);

  const leaderIds = new Set<string>();
  for (const id of subtree) {
    if (isMarketLeader(id)) leaderIds.add(id);
  }
  if (!leaderIds.size) return 0;

  let total = 0;
  for (const leaderId of leaderIds) {
    if (!isTopmostLeaderInTree(nodes, rootId, leaderId, leaderIds)) continue;
    const node = nodes[leaderId];
    if (node) total += branchVolume(node);
  }
  return round2(total);
}

function sumApplications(applications: SubsidyApplication[]): number {
  return round2(
    applications.filter((a) => a.status !== 'rejected').reduce((s, a) => s + a.amountUsd, 0),
  );
}

function sumDownlineMarketPerformanceDeduction(
  marketApplications: SubsidyApplication[],
  marketRatePct: number,
): number {
  const rate = marketRatePct / 100;
  if (rate <= 0) return 0;
  const totalAmount = sumApplications(marketApplications);
  return round2(totalAmount / rate);
}

export function buildPartnerSubsidyQuotaView(
  ratePct: number,
  dedupPartnerPerf: number,
  marketDeductionPerf: number,
  partnerApplications: SubsidyApplication[],
): SubsidyQuotaView {
  const calculable = Math.max(0, round2(dedupPartnerPerf - marketDeductionPerf));
  const rate = ratePct / 100;
  const cap = round2(calculable * rate);
  const applied = sumApplications(partnerApplications);
  const remaining = Math.max(0, round2(cap - applied));
  return {
    ratePct,
    calculablePerformanceUsd: calculable,
    applicableCapUsd: cap,
    appliedUsd: applied,
    applicableRemainingUsd: remaining,
    dedupPerformanceUsd: dedupPartnerPerf,
    marketDeductionUsd: marketDeductionPerf,
  };
}

export function buildMarketSubsidyQuotaView(
  ratePct: number,
  dedupLeaderPerf: number,
  marketApplications: SubsidyApplication[],
): SubsidyQuotaView {
  const rate = ratePct / 100;
  const cap = round2(dedupLeaderPerf * rate);
  const applied = sumApplications(marketApplications);
  const remaining = Math.max(0, round2(cap - applied));
  return {
    ratePct,
    calculablePerformanceUsd: dedupLeaderPerf,
    applicableCapUsd: cap,
    appliedUsd: applied,
    applicableRemainingUsd: remaining,
    dedupPerformanceUsd: dedupLeaderPerf,
  };
}

export function computePartnerSubsidyQuotaFromTree(
  state: PartnerState,
  ratePct: number,
  nodes: Record<string, PartnerTeamNode>,
  isMarketLeader: (nodeId: string) => boolean = () => false,
): SubsidyQuotaView {
  const dedupPartner = computeDedupPartnerPerformanceFromTree(nodes);
  const marketDeduction = round2(
    sumDownlineMarketPerformanceDeduction(state.marketSubsidyApplications, ratePct) +
      state.marketSubsidyPerformanceUsed,
  );
  return buildPartnerSubsidyQuotaView(
    ratePct,
    dedupPartner,
    marketDeduction,
    state.partnerSubsidyApplications,
  );
}

export function computeMarketSubsidyQuotaFromTree(
  state: PartnerState,
  ratePct: number,
  nodes: Record<string, PartnerTeamNode>,
  isMarketLeader: (nodeId: string) => boolean = () => false,
): SubsidyQuotaView {
  const dedupLeader = computeDedupMarketLeaderPerformanceFromTree(nodes, 'me', isMarketLeader);
  return buildMarketSubsidyQuotaView(ratePct, dedupLeader, state.marketSubsidyApplications);
}
