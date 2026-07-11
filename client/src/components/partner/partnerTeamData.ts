import type { DirectReferral, PartnerTeamStats, UnionProfileBundle } from '@/lib/d3fiTypes';
import { shortWallet } from '@/lib/wallet';

export type PartnerTeamNode = {
  id: string;
  address: string;
  short: string;
  label: string;
  parentId: string | null;
  childrenIds: string[];
  teamUsd: number;
  dailyNewUsd: number;
  personalUsd: number;
  directCount: number;
  teamCount: number;
  isDirect: boolean;
  isPartner: boolean;
  /** Shown only during transfer guide when user has no real downline. */
  isGuideMock?: boolean;
};

export const GUIDE_MOCK_DOWNLINE_ID = 'guide-mock-d1';

/** Inject a mock direct downline for transfer guide when the tree has no children. */
export function mergeGuideMockDownline(
  nodes: Record<string, PartnerTeamNode>,
  mockLabel: string,
): Record<string, PartnerTeamNode> {
  const me = nodes.me;
  if (!me || me.childrenIds.length > 0) return nodes;
  const mock: PartnerTeamNode = {
    id: GUIDE_MOCK_DOWNLINE_ID,
    address: '0x0000000000000000000000000000000000000001',
    short: '0x0000…0001',
    label: mockLabel,
    parentId: 'me',
    childrenIds: [],
    teamUsd: 1200,
    dailyNewUsd: 300,
    personalUsd: 500,
    directCount: 0,
    teamCount: 1,
    isDirect: true,
    isPartner: false,
    isGuideMock: true,
  };
  return {
    ...nodes,
    me: { ...me, childrenIds: [GUIDE_MOCK_DOWNLINE_ID] },
    [GUIDE_MOCK_DOWNLINE_ID]: mock,
  };
}

/** First direct downline id for guide spotlight (prefers real nodes over mock). */
export function pickGuideTransferTargetId(nodes: Record<string, PartnerTeamNode>): string | null {
  const me = nodes.me;
  if (!me) return null;
  const child = me.childrenIds.map((id) => nodes[id]).find(Boolean);
  return child?.id ?? null;
}

function num(v: unknown): number {
  return Number(v ?? 0) || 0;
}

/** @deprecated Demo-only seed tree; use buildPartnerTeamNodes for connected wallets. */
export const partnerTeamNodes: Record<string, PartnerTeamNode> = {
  me: {
    id: 'me',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    short: '0x1234…5678',
    label: '我',
    parentId: null,
    childrenIds: ['d1', 'd2', 'd3'],
    teamUsd: 86_400,
    dailyNewUsd: 3000,
    personalUsd: 6500,
    directCount: 3,
    teamCount: 12,
    isDirect: false,
    isPartner: true,
  },
  d1: {
    id: 'd1',
    address: '0x1111222233334444555566667777888899990000',
    short: '0x1111…0000',
    label: 'Direct A3',
    parentId: 'me',
    childrenIds: ['d1a'],
    teamUsd: 41_400,
    dailyNewUsd: 1200,
    personalUsd: 2100,
    directCount: 1,
    teamCount: 5,
    isDirect: true,
    isPartner: true,
  },
  d2: {
    id: 'd2',
    address: '0xaaaabbbbccccddddeeeeffff0011223344556677',
    short: '0xAAaa…6677',
    label: 'Downline B1',
    parentId: 'me',
    childrenIds: [],
    teamUsd: 28_000,
    dailyNewUsd: 900,
    personalUsd: 1500,
    directCount: 0,
    teamCount: 4,
    isDirect: true,
    isPartner: true,
  },
  d3: {
    id: 'd3',
    address: '0xbb11223344556677889900aabbccddeeff001122',
    short: '0xBb11…1122',
    label: 'Downline B2',
    parentId: 'me',
    childrenIds: ['d3a', 'd3b'],
    teamUsd: 17_000,
    dailyNewUsd: 900,
    personalUsd: 800,
    directCount: 2,
    teamCount: 3,
    isDirect: true,
    isPartner: false,
  },
  d1a: {
    id: 'd1a',
    address: '0xabcdef1234567890abcdef1234567890abcdef01',
    short: '0xAbCd…Ef01',
    label: 'A3-1',
    parentId: 'd1',
    childrenIds: [],
    teamUsd: 12_000,
    dailyNewUsd: 400,
    personalUsd: 500,
    directCount: 0,
    teamCount: 2,
    isDirect: false,
    isPartner: false,
  },
  d3a: {
    id: 'd3a',
    address: '0x9876543210fedcba9876543210fedcba98765432',
    short: '0x9876…5432',
    label: 'B2-1',
    parentId: 'd3',
    childrenIds: [],
    teamUsd: 8000,
    dailyNewUsd: 300,
    personalUsd: 400,
    directCount: 0,
    teamCount: 1,
    isDirect: false,
    isPartner: true,
  },
  d3b: {
    id: 'd3b',
    address: '0xcc223344556677889900aabbccddeeff00112233',
    short: '0xCc22…2233',
    label: 'B2-2',
    parentId: 'd3',
    childrenIds: [],
    teamUsd: 8200,
    dailyNewUsd: 350,
    personalUsd: 350,
    directCount: 0,
    teamCount: 1,
    isDirect: false,
    isPartner: true,
  },
};

/** Client-side demo fallback when Supabase profile/seed is unavailable. */
export function buildDemoPartnerTeamFallback(wallet: string): {
  nodes: Record<string, PartnerTeamNode>;
  stats: PartnerTeamStats;
  downlineWallets: string[];
} {
  const nodes: Record<string, PartnerTeamNode> = {};
  for (const [id, node] of Object.entries(partnerTeamNodes)) {
    nodes[id] =
      id === 'me'
        ? { ...node, address: wallet, short: shortWallet(wallet) }
        : { ...node };
  }
  const me = nodes.me!;
  const areas = computePartnerAreaStats(nodes);
  const stats: PartnerTeamStats = {
    personalPerformanceUsd: me.personalUsd,
    teamPerformanceUsd: me.teamUsd,
    dailyNewPerformanceUsd: me.dailyNewUsd,
    smallAreaPerformanceUsd: areas.smallAreaUsd,
    smallAreaNewPerformanceUsd: areas.smallAreaNewUsd,
    largeAreaPerformanceUsd: areas.largeAreaUsd,
    largeAreaNewPerformanceUsd: areas.largeAreaNewUsd,
  };
  const downlineWallets = Object.values(nodes)
    .filter((n) => n.id !== 'me')
    .map((n) => n.address);
  return { nodes, stats, downlineWallets };
}

export function isEmptyPartnerTeamData(
  nodes: Record<string, PartnerTeamNode>,
  stats: PartnerTeamStats,
): boolean {
  const me = nodes.me;
  const noDownline = !me || me.childrenIds.length === 0;
  const noPerf =
    (stats.teamPerformanceUsd ?? 0) === 0 &&
    (stats.largeAreaPerformanceUsd ?? 0) === 0 &&
    (stats.smallAreaPerformanceUsd ?? 0) === 0;
  return noDownline && noPerf;
}

export function partnerTeamDepth(nodes: Record<string, PartnerTeamNode>, nodeId: string): number {
  let depth = 0;
  let id = nodeId;
  while (id !== 'me') {
    const node = nodes[id];
    if (!node?.parentId) return depth;
    depth += 1;
    id = node.parentId;
  }
  return depth;
}

export type PartnerAreaStats = {
  smallAreaUsd: number;
  smallAreaNewUsd: number;
  largeAreaUsd: number;
  largeAreaNewUsd: number;
};

/** 大区 = 最大直推线业绩；小区 = 其余直推线合计（sD3 按小区业绩计算）。 */
export function computePartnerAreaStats(
  nodes: Record<string, PartnerTeamNode>,
  rootId = 'me',
): PartnerAreaStats {
  const root = nodes[rootId];
  if (!root) {
    return { smallAreaUsd: 0, smallAreaNewUsd: 0, largeAreaUsd: 0, largeAreaNewUsd: 0 };
  }
  const children = root.childrenIds.map((id) => nodes[id]).filter(Boolean);
  if (children.length === 0) {
    return { smallAreaUsd: 0, smallAreaNewUsd: 0, largeAreaUsd: 0, largeAreaNewUsd: 0 };
  }
  const sorted = [...children].sort((a, b) => b.teamUsd - a.teamUsd);
  const largeAreaUsd = sorted[0]?.teamUsd ?? 0;
  const largeAreaNewUsd = sorted[0]?.dailyNewUsd ?? 0;
  const smallAreaUsd = sorted.slice(1).reduce((s, c) => s + c.teamUsd, 0);
  const smallAreaNewUsd = sorted.slice(1).reduce((s, c) => s + c.dailyNewUsd, 0);
  return { smallAreaUsd, smallAreaNewUsd, largeAreaUsd, largeAreaNewUsd };
}

export function emptyPartnerTeamNodes(
  wallet: string,
  meLabel?: string,
): Record<string, PartnerTeamNode> {
  return {
    me: {
      id: 'me',
      address: wallet,
      short: shortWallet(wallet),
      label: meLabel ?? shortWallet(wallet),
      parentId: null,
      childrenIds: [],
      teamUsd: 0,
      dailyNewUsd: 0,
      personalUsd: 0,
      directCount: 0,
      teamCount: 0,
      isDirect: false,
      isPartner: false,
    },
  };
}

export function findPartnerTeamNodeLabel(
  nodes: Record<string, PartnerTeamNode>,
  address: string,
): string | undefined {
  const hit = Object.values(nodes).find(
    (n) => n.address.toLowerCase() === address.toLowerCase(),
  );
  return hit?.label;
}

/** True when `address` is in the sponsor's partner downline (tree nodes or server wallet list). */
export function isPartnerDownlineMember(
  address: string,
  downlineWallets: string[],
  nodes?: Record<string, PartnerTeamNode>,
): boolean {
  const needle = address.trim().toLowerCase();
  if (!needle) return false;
  if (downlineWallets.some((w) => w.toLowerCase() === needle)) return true;
  if (!nodes) return false;
  return Object.values(nodes).some(
    (n) => n.id !== 'me' && n.address.toLowerCase() === needle,
  );
}

/** Build per-wallet team tree from union profile (centered on the connected wallet). */
export function buildPartnerTeamNodes(
  wallet: string,
  bundle: UnionProfileBundle,
): Record<string, PartnerTeamNode> {
  const meDisplay =
    bundle.profile?.display_name?.trim() ||
    bundle.profile?.short_address ||
    shortWallet(wallet);
  const partnerStats = bundle.partnerTeamStats;
  const lineStatMap = new Map(
    (bundle.partnerDirectLineStats ?? []).map((l) => [l.wallet.toLowerCase(), l]),
  );
  const lineStat = (addr: string) => lineStatMap.get(addr.toLowerCase());

  const applyDirectLineStats = (map: Record<string, PartnerTeamNode>) => {
    const me = map.me;
    if (!me) return map;
    const next = { ...map };
    if (partnerStats) {
      next.me = {
        ...me,
        dailyNewUsd: num(partnerStats.dailyNewPerformanceUsd),
        teamUsd: num(partnerStats.teamPerformanceUsd ?? me.teamUsd),
        personalUsd: num(partnerStats.personalPerformanceUsd ?? me.personalUsd),
      };
    }
    for (const cid of me.childrenIds) {
      const child = next[cid];
      if (!child) continue;
      const ls = lineStat(child.address);
      if (ls) {
        next[cid] = { ...child, teamUsd: ls.teamUsd, dailyNewUsd: ls.dailyNewUsd };
      }
    }
    return next;
  };
  const rows = bundle.lineTeamNodes ?? [];
  const walletLower = wallet.toLowerCase();
  const partnerSet = new Set(
    (bundle.partnerMemberWallets ?? []).map((w) => w.toLowerCase()),
  );
  const isPartnerWallet = (addr: string) => partnerSet.has(addr.toLowerCase());

  if (rows.length > 0) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    let meId = rows.find((r) => r.wallet_address.toLowerCase() === walletLower)?.id ?? rows[0]?.id;
    const map: Record<string, PartnerTeamNode> = {};

    for (const row of rows) {
      const children = rows
        .filter((c) => c.parent_node_id === row.id)
        .map((c) => (c.id === meId ? 'me' : c.id));
      const nodeKey = row.id === meId ? 'me' : row.id;
      map[nodeKey] = {
        id: nodeKey,
        address: row.wallet_address,
        short: shortWallet(row.wallet_address),
        label:
          nodeKey === 'me'
            ? meDisplay
            : row.level_label || shortWallet(row.wallet_address),
        parentId: row.parent_node_id
          ? row.parent_node_id === meId
            ? 'me'
            : row.parent_node_id
          : null,
        childrenIds: children,
        teamUsd: num(row.team_usd),
        dailyNewUsd: 0,
        personalUsd: num(row.personal_usd),
        directCount: row.direct_count ?? 0,
        teamCount: row.team_count ?? 0,
        isDirect: row.is_direct ?? false,
        isPartner: isPartnerWallet(row.wallet_address),
      };
    }

    if (!map.me && meId && byId.has(meId)) {
      const row = byId.get(meId)!;
      map.me = {
        id: 'me',
        address: row.wallet_address,
        short: shortWallet(row.wallet_address),
        label: meDisplay,
        parentId: null,
        childrenIds: rows
          .filter((c) => c.parent_node_id === meId)
          .map((c) => (c.id === meId ? 'me' : c.id)),
        teamUsd: num(row.team_usd),
        dailyNewUsd: 0,
        personalUsd: num(row.personal_usd),
        directCount: row.direct_count ?? 0,
        teamCount: row.team_count ?? 0,
        isDirect: row.is_direct ?? false,
        isPartner: isPartnerWallet(row.wallet_address),
      };
    }

    if (map.me) map.me.parentId = null;
    return applyDirectLineStats(map);
  }

  const partnerRefs = bundle.directReferrals.filter(
    (r) => r.referral_type === 'partner' && r.status === 'active',
  );
  const tn = bundle.teamNode;
  const me: PartnerTeamNode = {
    id: 'me',
    address: wallet,
    short: shortWallet(wallet),
    label: meDisplay,
    parentId: null,
    childrenIds: partnerRefs.map((_, i) => `d-${i}`),
    teamUsd: num(partnerStats?.teamPerformanceUsd ?? tn?.team_usd),
    dailyNewUsd: num(partnerStats?.dailyNewPerformanceUsd),
    personalUsd: num(partnerStats?.personalPerformanceUsd ?? tn?.personal_usd),
    directCount: partnerRefs.length,
    teamCount: partnerRefs.length > 0
      ? partnerRefs.reduce((s, r) => s + num((r as DirectReferral).team_count), partnerRefs.length)
      : (tn?.team_count ?? 0),
    isDirect: false,
    isPartner: isPartnerWallet(wallet),
  };
  const map: Record<string, PartnerTeamNode> = { me };
  partnerRefs.forEach((r, i) => {
    const perf = num((r as { performance_weight?: number }).performance_weight);
    const personalUsd = num((r as DirectReferral).personal_performance_usd ?? perf);
    const downlineTeamUsd = num((r as DirectReferral).team_performance_usd);
    const teamCount = num((r as DirectReferral).team_count);
    const ls = lineStat(r.wallet_address);
    map[`d-${i}`] = {
      id: `d-${i}`,
      address: r.wallet_address,
      short: shortWallet(r.wallet_address),
      label: shortWallet(r.wallet_address),
      parentId: 'me',
      childrenIds: [],
      teamUsd: ls?.teamUsd ?? downlineTeamUsd,
      dailyNewUsd: ls?.dailyNewUsd ?? 0,
      personalUsd,
      directCount: 0,
      teamCount,
      isDirect: true,
      isPartner: isPartnerWallet(r.wallet_address),
    };
  });
  return applyDirectLineStats(map);
}
