/**
 * Demo UD3 settlement — 已结算 vs 未结算（当日下线新增入金）.
 * Engine: 档位产出 → 直推 60% → 网体 40% 自下而上级差。
 */
import type { Ud3SettlementRecord } from '@/components/partner/partnerData';
import {
  computePartnerAreaStats,
  partnerTeamDepth,
  type PartnerTeamNode,
} from '@/components/partner/partnerTeamData';
import {
  getUd3Tier,
  resolveUd3SLevel,
  settleUd3DepositEvent,
  type Ud3UplineNode,
} from '@/components/partner/ud3Rules';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Seed calendar anchors (before daily tick catch-up). */
export const DEMO_UD3_TODAY = '2026-07-09';
export const DEMO_UD3_LAST_SETTLED = '2026-07-08';

function nodeUpline(nodes: Record<string, PartnerTeamNode>, nodeId: string): Ud3UplineNode {
  const node = nodes[nodeId]!;
  const areas = computePartnerAreaStats(nodes, nodeId);
  const s = resolveUd3SLevel({
    totalPerfUsdt: node.teamUsd,
    smallAreaPerfUsdt: areas.smallAreaUsd,
  });
  return {
    wallet: node.address,
    vSharePct: s?.sharePct ?? 0,
    vLabel: s?.label,
  };
}

function networkChainAboveReferrerToMe(
  nodes: Record<string, PartnerTeamNode>,
  referrerId: string,
): Ud3UplineNode[] {
  if (referrerId === 'me') return [];
  const chain: Ud3UplineNode[] = [];
  let id = referrerId;
  const seen = new Set<string>();
  while (id && id !== 'me') {
    if (seen.has(id)) break;
    seen.add(id);
    const node = nodes[id];
    if (!node?.parentId) break;
    const parentId = node.parentId;
    chain.push(nodeUpline(nodes, parentId));
    if (parentId === 'me') break;
    id = parentId;
  }
  return chain;
}

export type DemoDeposit = {
  id: string;
  settledAt: string;
  sourceId: string;
  amountUsdt: number;
};

export const DEMO_SETTLED_DEPOSITS_SEED: DemoDeposit[] = [
  { id: 'demo-ud3-1', settledAt: '2026-07-08', sourceId: 'd2', amountUsdt: 900 },
  { id: 'demo-ud3-2', settledAt: '2026-07-08', sourceId: 'd1a', amountUsdt: 400 },
  { id: 'demo-ud3-3', settledAt: '2026-07-07', sourceId: 'd1', amountUsdt: 600 },
  { id: 'demo-ud3-4', settledAt: '2026-07-07', sourceId: 'd3a', amountUsdt: 300 },
  { id: 'demo-ud3-5', settledAt: '2026-07-06', sourceId: 'd3', amountUsdt: 400 },
  { id: 'demo-ud3-6', settledAt: '2026-07-06', sourceId: 'd3b', amountUsdt: 300 },
  { id: 'demo-ud3-7', settledAt: '2026-07-05', sourceId: 'd2', amountUsdt: 500 },
  { id: 'demo-ud3-8', settledAt: '2026-07-04', sourceId: 'd1a', amountUsdt: 200 },
];

export const DEMO_PENDING_DEPOSITS_SEED: DemoDeposit[] = [
  { id: 'demo-ud3-p1', settledAt: DEMO_UD3_TODAY, sourceId: 'd2', amountUsdt: 800 },
  { id: 'demo-ud3-p2', settledAt: DEMO_UD3_TODAY, sourceId: 'd1a', amountUsdt: 300 },
  { id: 'demo-ud3-p3', settledAt: DEMO_UD3_TODAY, sourceId: 'd3b', amountUsdt: 200 },
];

export function creditRowsForDeposits(
  nodes: Record<string, PartnerTeamNode>,
  deposits: DemoDeposit[],
  status: 'settled' | 'pending',
): Ud3SettlementRecord[] {
  const me = nodes.me;
  if (!me) return [];

  const rows: Ud3SettlementRecord[] = [];
  const meMeta = nodeUpline(nodes, 'me');

  for (const dep of deposits) {
    const source = nodes[dep.sourceId];
    if (!source?.parentId) continue;

    const referrerId = source.parentId;
    const referrer = nodes[referrerId];
    if (!referrer) continue;

    const event = settleUd3DepositEvent({
      depositUsdt: dep.amountUsdt,
      referrerWallet: referrer.address,
      referrerTotalPerfUsdt: referrer.teamUsd,
      referrerSmallAreaPerfUsdt: computePartnerAreaStats(nodes, referrerId).smallAreaUsd,
      networkChainAboveReferrer: networkChainAboveReferrerToMe(nodes, referrerId),
    });

    const depth = partnerTeamDepth(nodes, dep.sourceId);
    const guideTier = getUd3Tier(referrer.teamUsd);
    const base = {
      settledAt: dep.settledAt,
      teamPerformanceUsd: me.teamUsd,
      dailyNewPerformanceUsd: dep.amountUsdt,
      sourceAddress: source.address,
      sourceLabel: source.label,
      sourceDepth: depth,
      guideAddress: referrer.address,
      guideLabel: referrer.label,
      guideTierLabel: guideTier?.label ?? event.tier?.label,
      generatedUd3: round2(event.generatedUd3),
      networkPoolUd3: round2(event.networkPoolUd3),
      settlementStatus: status,
    } as const;

    if (referrerId === 'me') {
      rows.push({
        id: dep.id,
        ...base,
        tierRatePct: event.tierRatePct,
        ud3Amount: round2(event.directUd3),
        role: 'direct',
        rewardSharePct: 60,
        vLabel: meMeta.vLabel,
      });
      continue;
    }

    const myPay = event.network.payouts.find(
      (p) => p.wallet.toLowerCase() === me.address.toLowerCase(),
    );
    if (!myPay || myPay.ud3Amount <= 0) continue;

    rows.push({
      id: dep.id,
      ...base,
      tierRatePct: event.tierRatePct,
      ud3Amount: round2(myPay.ud3Amount),
      role: 'upline',
      rewardSharePct: myPay.gapPct,
      gapPct: myPay.gapPct,
      vLabel: myPay.vLabel ?? meMeta.vLabel,
    });
  }

  return rows;
}

export function buildDemoUd3SettlementHistory(
  nodes: Record<string, PartnerTeamNode>,
): Ud3SettlementRecord[] {
  return creditRowsForDeposits(nodes, DEMO_SETTLED_DEPOSITS_SEED, 'settled').sort(
    (a, b) => b.settledAt.localeCompare(a.settledAt) || b.id.localeCompare(a.id),
  );
}

export function buildDemoUd3PendingRows(
  nodes: Record<string, PartnerTeamNode>,
  pending: DemoDeposit[] = DEMO_PENDING_DEPOSITS_SEED,
): Ud3SettlementRecord[] {
  return creditRowsForDeposits(nodes, pending, 'pending').sort((a, b) => b.id.localeCompare(a.id));
}

export function sumDemoUd3History(rows: Ud3SettlementRecord[]): number {
  return round2(rows.reduce((s, r) => s + r.ud3Amount, 0));
}

export function applyPendingDepositsToDailyNew(
  nodes: Record<string, PartnerTeamNode>,
  pending: DemoDeposit[],
): Record<string, PartnerTeamNode> {
  const next: Record<string, PartnerTeamNode> = {};
  for (const [id, node] of Object.entries(nodes)) {
    next[id] = { ...node, dailyNewUsd: 0, childrenIds: [...node.childrenIds] };
  }

  for (const dep of pending) {
    const source = next[dep.sourceId];
    if (!source) continue;
    next[dep.sourceId] = {
      ...source,
      dailyNewUsd: source.dailyNewUsd + dep.amountUsdt,
    };
    let id = source.parentId;
    while (id) {
      const ancestor = next[id];
      if (!ancestor) break;
      next[id] = { ...ancestor, dailyNewUsd: ancestor.dailyNewUsd + dep.amountUsdt };
      id = ancestor.parentId;
    }
  }

  return next;
}

/** @deprecated use applyPendingDepositsToDailyNew */
export function applyDemoPendingDailyNew(
  nodes: Record<string, PartnerTeamNode>,
): Record<string, PartnerTeamNode> {
  return applyPendingDepositsToDailyNew(nodes, DEMO_PENDING_DEPOSITS_SEED);
}

export function estimatePendingUd3ForMe(
  nodes: Record<string, PartnerTeamNode>,
  pending: DemoDeposit[] = DEMO_PENDING_DEPOSITS_SEED,
): number {
  return sumDemoUd3History(buildDemoUd3PendingRows(nodes, pending));
}

export function getDemoPendingDepositTotalUsd(
  pending: DemoDeposit[] = DEMO_PENDING_DEPOSITS_SEED,
): number {
  return pending.reduce((s, d) => s + d.amountUsdt, 0);
}
