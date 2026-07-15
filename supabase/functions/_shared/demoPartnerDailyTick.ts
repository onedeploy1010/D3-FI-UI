/**
 * Demo partner daily tick (Deno) — settle pending UD3, add downline + deposits.
 * Mirrors client `ud3DemoDailyTick.ts` for cron / catch-up persistence.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { DEMO_WALLET_ADDRESS } from './demo.ts';
import { toSgtDateString, addSgtDays } from './partnerTimezone.ts';
import {
  settleUd3DepositEvent,
  resolveUd3SLevel,
  type Ud3UplineNode,
} from './partnerUd3Rules.ts';

type Sb = SupabaseClient;

type DemoNode = {
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
};

type DemoDeposit = { id: string; settledAt: string; sourceId: string; amountUsdt: number };

type HistoryRow = {
  id: string;
  settledAt: string;
  teamPerformanceUsd: number;
  dailyNewPerformanceUsd: number;
  tierRatePct: number;
  sd3Amount: number;
  role?: 'direct' | 'upline';
  rewardSharePct?: number;
  gapPct?: number;
  vLabel?: string;
  sourceDepth?: number;
  sourceAddress?: string;
  sourceLabel?: string;
  settlementStatus?: 'settled' | 'pending';
};

export type PartnerDemoSimState = {
  version: 1;
  lastTickDate: string;
  simToday: string;
  nodes: Record<string, DemoNode>;
  settledHistory: HistoryRow[];
  pendingDeposits: DemoDeposit[];
  nextMemberSeq: number;
  lifetimeUd3: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function snap100(n: number): number {
  return Math.max(100, Math.round(n / 100) * 100);
}

function shortWallet(a: string): string {
  if (a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function cloneNodes(nodes: Record<string, DemoNode>): Record<string, DemoNode> {
  const out: Record<string, DemoNode> = {};
  for (const [id, n] of Object.entries(nodes)) {
    out[id] = { ...n, childrenIds: [...n.childrenIds] };
  }
  return out;
}

function sumDownline(nodes: Record<string, DemoNode>, rootId: string): number {
  const root = nodes[rootId];
  if (!root) return 0;
  let sum = 0;
  for (const cid of root.childrenIds) {
    const child = nodes[cid];
    if (!child) continue;
    sum += child.personalUsd + sumDownline(nodes, cid);
  }
  return sum;
}

function recomputeVolumes(nodes: Record<string, DemoNode>): Record<string, DemoNode> {
  const next = cloneNodes(nodes);
  for (const id of Object.keys(next)) {
    next[id] = { ...next[id]!, teamUsd: sumDownline(next, id) };
  }
  return next;
}

function depthOf(nodes: Record<string, DemoNode>, nodeId: string): number {
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

function linePerf(n: DemoNode): number {
  return n.personalUsd + n.teamUsd;
}

function areasOf(nodes: Record<string, DemoNode>, rootId: string) {
  const root = nodes[rootId];
  if (!root) return { small: 0 };
  const children = root.childrenIds.map((id) => nodes[id]).filter(Boolean) as DemoNode[];
  if (children.length === 0) return { small: 0 };
  const sorted = [...children].sort((a, b) => linePerf(b) - linePerf(a));
  return { small: sorted.slice(1).reduce((s, c) => s + linePerf(c), 0) };
}

function nodeUpline(nodes: Record<string, DemoNode>, nodeId: string): Ud3UplineNode {
  const node = nodes[nodeId]!;
  const areas = areasOf(nodes, nodeId);
  const s = resolveUd3SLevel({ totalPerfUsdt: node.teamUsd, smallAreaPerfUsdt: areas.small });
  return {
    wallet: node.address,
    vSharePct: s?.sharePct ?? 0,
    vLabel: s?.label,
  };
}

function chainAbove(nodes: Record<string, DemoNode>, referrerId: string): Ud3UplineNode[] {
  if (referrerId === 'me') return [];
  const chain: Ud3UplineNode[] = [];
  let id = referrerId;
  const seen = new Set<string>();
  while (id && id !== 'me') {
    if (seen.has(id)) break;
    seen.add(id);
    const node = nodes[id];
    if (!node?.parentId) break;
    chain.push(nodeUpline(nodes, node.parentId));
    if (node.parentId === 'me') break;
    id = node.parentId;
  }
  return chain;
}

function creditRows(
  nodes: Record<string, DemoNode>,
  deposits: DemoDeposit[],
  status: 'settled' | 'pending',
): HistoryRow[] {
  const me = nodes.me;
  if (!me) return [];
  const rows: HistoryRow[] = [];
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
      networkChainAboveReferrer: chainAbove(nodes, referrerId),
    });
    const depth = depthOf(nodes, dep.sourceId);
    if (referrerId === 'me') {
      rows.push({
        id: dep.id,
        settledAt: dep.settledAt,
        teamPerformanceUsd: me.teamUsd,
        dailyNewPerformanceUsd: dep.amountUsdt,
        tierRatePct: event.tierRatePct,
        sd3Amount: round2(event.directUd3),
        role: 'direct',
        rewardSharePct: 60,
        sourceDepth: depth,
        sourceAddress: source.address,
        sourceLabel: source.label,
        settlementStatus: status,
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
      settledAt: dep.settledAt,
      teamPerformanceUsd: me.teamUsd,
      dailyNewPerformanceUsd: dep.amountUsdt,
      tierRatePct: event.tierRatePct,
      sd3Amount: round2(myPay.ud3Amount),
      role: 'upline',
      rewardSharePct: myPay.gapPct,
      gapPct: myPay.gapPct,
      vLabel: myPay.vLabel ?? meMeta.vLabel,
      sourceDepth: depth,
      sourceAddress: source.address,
      sourceLabel: source.label,
      settlementStatus: status,
    });
  }
  return rows;
}

function applyDailyNew(nodes: Record<string, DemoNode>, pending: DemoDeposit[]): Record<string, DemoNode> {
  const next = cloneNodes(nodes);
  for (const id of Object.keys(next)) next[id] = { ...next[id]!, dailyNewUsd: 0 };
  for (const dep of pending) {
    const source = next[dep.sourceId];
    if (!source) continue;
    next[dep.sourceId] = { ...source, dailyNewUsd: source.dailyNewUsd + dep.amountUsdt };
    let id = source.parentId;
    while (id) {
      const a = next[id];
      if (!a) break;
      next[id] = { ...a, dailyNewUsd: a.dailyNewUsd + dep.amountUsdt };
      id = a.parentId;
    }
  }
  return next;
}

const BOOT_TODAY = '2026-07-09';

function bootstrapNodes(): Record<string, DemoNode> {
  const seed: Record<string, DemoNode> = {
    me: {
      id: 'me',
      address: DEMO_WALLET_ADDRESS,
      short: shortWallet(DEMO_WALLET_ADDRESS),
      label: '我',
      parentId: null,
      childrenIds: ['d1', 'd2', 'd3'],
      teamUsd: 0,
      dailyNewUsd: 0,
      personalUsd: 6500,
      directCount: 3,
      teamCount: 6,
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
      teamUsd: 0,
      dailyNewUsd: 0,
      personalUsd: 2100,
      directCount: 1,
      teamCount: 1,
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
      teamUsd: 0,
      dailyNewUsd: 0,
      personalUsd: 1500,
      directCount: 0,
      teamCount: 0,
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
      teamUsd: 0,
      dailyNewUsd: 0,
      personalUsd: 800,
      directCount: 2,
      teamCount: 2,
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
      teamUsd: 0,
      dailyNewUsd: 0,
      personalUsd: 500,
      directCount: 0,
      teamCount: 0,
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
      teamUsd: 0,
      dailyNewUsd: 0,
      personalUsd: 400,
      directCount: 0,
      teamCount: 0,
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
      teamUsd: 0,
      dailyNewUsd: 0,
      personalUsd: 400,
      directCount: 0,
      teamCount: 0,
      isDirect: false,
      isPartner: true,
    },
  };
  return recomputeVolumes(seed);
}

function createBootstrap(): PartnerDemoSimState {
  const pending: DemoDeposit[] = [
    { id: 'demo-ud3-p1', settledAt: BOOT_TODAY, sourceId: 'd2', amountUsdt: 800 },
    { id: 'demo-ud3-p2', settledAt: BOOT_TODAY, sourceId: 'd1a', amountUsdt: 300 },
    { id: 'demo-ud3-p3', settledAt: BOOT_TODAY, sourceId: 'd3b', amountUsdt: 200 },
  ];
  const settledSeed: DemoDeposit[] = [
    { id: 'demo-ud3-1', settledAt: '2026-07-08', sourceId: 'd2', amountUsdt: 900 },
    { id: 'demo-ud3-2', settledAt: '2026-07-08', sourceId: 'd1a', amountUsdt: 400 },
    { id: 'demo-ud3-3', settledAt: '2026-07-07', sourceId: 'd1', amountUsdt: 600 },
    { id: 'demo-ud3-4', settledAt: '2026-07-07', sourceId: 'd3a', amountUsdt: 300 },
    { id: 'demo-ud3-5', settledAt: '2026-07-06', sourceId: 'd3', amountUsdt: 400 },
    { id: 'demo-ud3-6', settledAt: '2026-07-06', sourceId: 'd3b', amountUsdt: 300 },
    { id: 'demo-ud3-7', settledAt: '2026-07-05', sourceId: 'd2', amountUsdt: 500 },
    { id: 'demo-ud3-8', settledAt: '2026-07-04', sourceId: 'd1a', amountUsdt: 200 },
  ];
  let nodes = applyDailyNew(bootstrapNodes(), pending);
  nodes = recomputeVolumes(nodes);
  const settledHistory = creditRows(nodes, settledSeed, 'settled');
  return {
    version: 1,
    lastTickDate: BOOT_TODAY,
    simToday: BOOT_TODAY,
    nodes,
    settledHistory,
    pendingDeposits: pending,
    nextMemberSeq: 1,
    lifetimeUd3: round2(settledHistory.reduce((s, r) => s + r.sd3Amount, 0)),
  };
}

function tickOneDay(state: PartnerDemoSimState, day: string): PartnerDemoSimState {
  const rng = mulberry32(hashSeed(`d3-demo-tick-${day}-${state.nextMemberSeq}`));
  const settledFromPending = creditRows(
    state.nodes,
    state.pendingDeposits.map((d) => ({ ...d, settledAt: state.simToday })),
    'settled',
  );
  const settledHistory = [...settledFromPending, ...state.settledHistory];
  const lifetimeUd3 = round2(settledHistory.reduce((s, r) => s + r.sd3Amount, 0));

  let nodes = cloneNodes(state.nodes);
  for (const id of Object.keys(nodes)) nodes[id] = { ...nodes[id]!, dailyNewUsd: 0 };

  const hostIds = Object.keys(nodes).filter((id) => id !== 'me');
  const hostId = hostIds[Math.floor(rng() * hostIds.length)] ?? 'me';
  const host = nodes[hostId]!;
  const newId = `n${state.nextMemberSeq}`;
  const personalUsd = snap100(100 + Math.floor(rng() * 5) * 100);
  const hex = (hashSeed(`${day}-${state.nextMemberSeq}-${hostId}`) >>> 0).toString(16).padStart(8, '0');
  const address = `0xdemo${hex}${'0'.repeat(32)}`.slice(0, 42);
  nodes[newId] = {
    id: newId,
    address,
    short: shortWallet(address),
    label: `New ${day.slice(5)}-${state.nextMemberSeq}`,
    parentId: hostId,
    childrenIds: [],
    teamUsd: 0,
    dailyNewUsd: 0,
    personalUsd,
    directCount: 0,
    teamCount: 0,
    isDirect: hostId === 'me',
    isPartner: rng() > 0.55,
  };
  nodes[hostId] = {
    ...host,
    childrenIds: [...host.childrenIds, newId],
    directCount: host.directCount + 1,
    teamCount: host.teamCount + 1,
  };
  if (nodes.me && hostId !== 'me') {
    nodes.me = { ...nodes.me, teamCount: nodes.me.teamCount + 1 };
  }
  nodes = recomputeVolumes(nodes);

  const downline = Object.keys(nodes).filter((id) => id !== 'me');
  const count = 2 + Math.floor(rng() * 2);
  const pending: DemoDeposit[] = [];
  for (let i = 0; i < count; i++) {
    const sourceId = downline[Math.floor(rng() * downline.length)]!;
    pending.push({
      id: `demo-ud3-${day}-${state.nextMemberSeq * 10 + i}`,
      settledAt: day,
      sourceId,
      amountUsdt: snap100(200 + Math.floor(rng() * 8) * 100),
    });
  }
  pending.push({
    id: `demo-ud3-join-${day}-${state.nextMemberSeq}`,
    settledAt: day,
    sourceId: newId,
    amountUsdt: personalUsd,
  });

  nodes = applyDailyNew(nodes, pending);
  nodes = recomputeVolumes(nodes);

  return {
    ...state,
    lastTickDate: day,
    simToday: day,
    nodes,
    settledHistory,
    pendingDeposits: pending,
    nextMemberSeq: state.nextMemberSeq + 1,
    lifetimeUd3,
  };
}

function catchUp(state: PartnerDemoSimState, today: string): PartnerDemoSimState {
  let cur = state;
  let guard = 0;
  while (cur.lastTickDate < today && guard < 370) {
    cur = tickOneDay(cur, addSgtDays(cur.lastTickDate, 1));
    guard += 1;
  }
  return cur;
}

export async function runDemoPartnerDailyTick(
  sb: Sb,
  todaySgt = toSgtDateString(),
): Promise<{
  ok: boolean;
  skipped: boolean;
  today: string;
  lastTickDate: string;
  lifetimeUd3: number;
  pendingCount: number;
  memberCount: number;
}> {
  const { data: row } = await sb
    .from('partner_demo_sim_state')
    .select('state_json, last_tick_date')
    .eq('id', 'default')
    .maybeSingle();

  let state = (row?.state_json as PartnerDemoSimState | null) ?? null;
  if (!state?.nodes?.me || state.version !== 1) {
    state = createBootstrap();
  }

  if (state.lastTickDate >= todaySgt) {
    return {
      ok: true,
      skipped: true,
      today: todaySgt,
      lastTickDate: state.lastTickDate,
      lifetimeUd3: state.lifetimeUd3,
      pendingCount: state.pendingDeposits.length,
      memberCount: Object.keys(state.nodes).length - 1,
    };
  }

  const next = catchUp(state, todaySgt);

  await sb.from('partner_demo_sim_state').upsert(
    {
      id: 'default',
      state_json: next,
      last_tick_date: next.lastTickDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  await sb.from('partner_accounts').upsert(
    {
      wallet_address: DEMO_WALLET_ADDRESS,
      sd3_balance: next.lifetimeUd3,
      lifetime_sd3_earned: next.lifetimeUd3,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address' },
  );

  return {
    ok: true,
    skipped: false,
    today: todaySgt,
    lastTickDate: next.lastTickDate,
    lifetimeUd3: next.lifetimeUd3,
    pendingCount: next.pendingDeposits.length,
    memberCount: Object.keys(next.nodes).length - 1,
  };
}

export async function resetDemoPartnerSimState(sb: Sb): Promise<void> {
  const fresh = createBootstrap();
  await sb.from('partner_demo_sim_state').upsert(
    {
      id: 'default',
      state_json: fresh,
      last_tick_date: fresh.lastTickDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
}
