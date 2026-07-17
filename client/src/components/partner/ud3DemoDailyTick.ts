/**
 * Demo partner daily tick — settle yesterday pending, grow downline, mint today's new deposits.
 * Deterministic RNG from date so client + cron stay consistent for the same seed.
 */
import type { Ud3SettlementRecord } from '@/components/partner/partnerData';
import {
  computePartnerAreaStats,
  partnerTeamNodes,
  recomputePartnerTeamVolumes,
  type PartnerTeamNode,
} from '@/components/partner/partnerTeamData';
import { shortWallet } from '@/lib/wallet';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import {
  creditRowsForDeposits,
  type DemoDeposit,
  DEMO_UD3_TODAY,
  DEMO_PENDING_DEPOSITS_SEED,
  DEMO_SETTLED_DEPOSITS_SEED,
  applyPendingDepositsToDailyNew,
  buildDemoUd3PendingRows,
  estimatePendingUd3ForMe,
  sumDemoUd3History,
} from '@/components/partner/ud3DemoSettle';

export const DEMO_SIM_STORAGE_KEY = 'd3_partner_demo_sim_v1';
export const DEMO_SIM_VERSION = 1 as const;

export type PartnerDemoSimState = {
  version: typeof DEMO_SIM_VERSION;
  /** Last SGT day for which tick completed (pending of that day is current 未结算). */
  lastTickDate: string;
  simToday: string;
  nodes: Record<string, PartnerTeamNode>;
  settledHistory: Ud3SettlementRecord[];
  pendingDeposits: DemoDeposit[];
  nextMemberSeq: number;
  lifetimeUd3: number;
};

export function toSgtDateString(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

export function addSgtDays(dateStr: string, delta: number): string {
  const [y, m, day] = dateStr.split('-').map(Number);
  const utc = Date.UTC(y, (m ?? 1) - 1, (day ?? 1) + delta);
  return new Date(utc).toISOString().slice(0, 10);
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

function cloneNodes(nodes: Record<string, PartnerTeamNode>): Record<string, PartnerTeamNode> {
  const out: Record<string, PartnerTeamNode> = {};
  for (const [id, n] of Object.entries(nodes)) out[id] = { ...n, childrenIds: [...n.childrenIds] };
  return out;
}

/** Bootstrap: settled ≤7/8, pending on 7/9. */
export function createBootstrapDemoSim(): PartnerDemoSimState {
  const nodes = recomputePartnerTeamVolumes(cloneNodes(partnerTeamNodes));
  const withDaily = applyPendingDepositsToDailyNew(nodes, DEMO_PENDING_DEPOSITS_SEED);
  const settledHistory = creditRowsForDeposits(withDaily, DEMO_SETTLED_DEPOSITS_SEED, 'settled');
  const lifetimeUd3 = sumDemoUd3History(settledHistory);
  return {
    version: DEMO_SIM_VERSION,
    lastTickDate: DEMO_UD3_TODAY,
    simToday: DEMO_UD3_TODAY,
    nodes: withDaily,
    settledHistory,
    pendingDeposits: [...DEMO_PENDING_DEPOSITS_SEED],
    nextMemberSeq: 1,
    lifetimeUd3,
  };
}

function pickHostId(nodes: Record<string, PartnerTeamNode>, rng: () => number): string {
  const ids = Object.keys(nodes).filter((id) => id !== 'me');
  if (ids.length === 0) return 'me';
  return ids[Math.floor(rng() * ids.length)]!;
}

function addDownlineMember(
  nodes: Record<string, PartnerTeamNode>,
  seq: number,
  day: string,
  rng: () => number,
): { nodes: Record<string, PartnerTeamNode>; newId: string; personalUsd: number } {
  const hostId = pickHostId(nodes, rng);
  const host = nodes[hostId]!;
  const newId = `n${seq}`;
  const personalUsd = snap100(100 + Math.floor(rng() * 5) * 100); // 100–500
  const hex = (hashSeed(`${day}-${seq}-${hostId}`) >>> 0).toString(16).padStart(8, '0');
  const address = `0xdemo${hex}${'0'.repeat(32)}`.slice(0, 42);
  const node: PartnerTeamNode = {
    id: newId,
    address,
    short: shortWallet(address),
    label: `New ${day.slice(5)}-${seq}`,
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
  const next = cloneNodes(nodes);
  next[newId] = node;
  next[hostId] = {
    ...host,
    childrenIds: [...host.childrenIds, newId],
    directCount: host.directCount + 1,
    teamCount: host.teamCount + 1,
  };
  if (next.me && hostId !== 'me') {
    next.me = { ...next.me, teamCount: next.me.teamCount + 1 };
  } else if (next.me && hostId === 'me') {
    next.me = {
      ...next.me,
      childrenIds: [...next.me.childrenIds, newId],
      directCount: next.me.directCount + 1,
      teamCount: next.me.teamCount + 1,
    };
  }
  return { nodes: recomputePartnerTeamVolumes(next), newId, personalUsd };
}

function mintPendingDeposits(
  nodes: Record<string, PartnerTeamNode>,
  day: string,
  seqStart: number,
  rng: () => number,
): DemoDeposit[] {
  const downline = Object.keys(nodes).filter((id) => id !== 'me');
  if (downline.length === 0) return [];
  const count = 2 + Math.floor(rng() * 2); // 2–3
  const deps: DemoDeposit[] = [];
  for (let i = 0; i < count; i++) {
    const sourceId = downline[Math.floor(rng() * downline.length)]!;
    const amountUsdt = snap100(200 + Math.floor(rng() * 8) * 100); // 200–900
    deps.push({
      id: `demo-ud3-${day}-${seqStart + i}`,
      settledAt: day,
      sourceId,
      amountUsdt,
    });
  }
  return deps;
}

/** Advance one SGT day: settle prior pending → grow tree → new pending. */
export function tickDemoSimOneDay(state: PartnerDemoSimState, day: string): PartnerDemoSimState {
  const rng = mulberry32(hashSeed(`d3-demo-tick-${day}-${state.nextMemberSeq}`));

  const settledFromPending = creditRowsForDeposits(
    state.nodes,
    state.pendingDeposits.map((d) => ({ ...d, settledAt: state.simToday })),
    'settled',
  ).map((r) => ({ ...r, settlementStatus: 'settled' as const }));

  const settledHistory = [...settledFromPending, ...state.settledHistory].sort(
    (a, b) => b.settledAt.localeCompare(a.settledAt) || b.id.localeCompare(a.id),
  );
  const lifetimeUd3 = sumDemoUd3History(settledHistory);

  let nodes = cloneNodes(state.nodes);
  // clear previous daily new before growing
  for (const id of Object.keys(nodes)) {
    nodes[id] = { ...nodes[id]!, dailyNewUsd: 0 };
  }

  const grown = addDownlineMember(nodes, state.nextMemberSeq, day, rng);
  nodes = grown.nodes;
  // count new member personal as part of day's performance under parent line via personal
  // also mint deposit events
  const pendingDeposits = mintPendingDeposits(nodes, day, state.nextMemberSeq * 10, rng);
  // optional: also treat new member personal as a deposit under them on join day
  pendingDeposits.push({
    id: `demo-ud3-join-${day}-${state.nextMemberSeq}`,
    settledAt: day,
    sourceId: grown.newId,
    amountUsdt: grown.personalUsd,
  });

  nodes = applyPendingDepositsToDailyNew(nodes, pendingDeposits);
  nodes = recomputePartnerTeamVolumes(nodes);

  return {
    ...state,
    lastTickDate: day,
    simToday: day,
    nodes,
    settledHistory,
    pendingDeposits,
    nextMemberSeq: state.nextMemberSeq + 1,
    lifetimeUd3,
  };
}

export function catchUpDemoSim(state: PartnerDemoSimState, todaySgt = toSgtDateString()): PartnerDemoSimState {
  let cur = state;
  // Cap catch-up to avoid pathological loops
  let guard = 0;
  while (cur.lastTickDate < todaySgt && guard < 370) {
    const next = addSgtDays(cur.lastTickDate, 1);
    cur = tickDemoSimOneDay(cur, next);
    guard += 1;
  }
  return cur;
}

export function readLocalDemoSim(): PartnerDemoSimState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DEMO_SIM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PartnerDemoSimState;
    if (parsed?.version !== DEMO_SIM_VERSION || !parsed.nodes?.me) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLocalDemoSim(state: PartnerDemoSimState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEMO_SIM_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function clearLocalDemoSim(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(DEMO_SIM_STORAGE_KEY);
}

/** Load bootstrap or local, catch up to today SGT, persist. */
export function ensureDemoSimCaughtUp(todaySgt = toSgtDateString()): PartnerDemoSimState {
  const base = readLocalDemoSim() ?? createBootstrapDemoSim();
  const next = catchUpDemoSim(base, todaySgt);
  writeLocalDemoSim(next);
  return next;
}

export function resetLocalDemoSim(): PartnerDemoSimState {
  const fresh = createBootstrapDemoSim();
  writeLocalDemoSim(fresh);
  return fresh;
}

export function remappedSimNodes(
  state: PartnerDemoSimState,
  wallet: string,
): Record<string, PartnerTeamNode> {
  const nodes = cloneNodes(state.nodes);
  if (nodes.me) {
    nodes.me = { ...nodes.me, address: wallet, short: shortWallet(wallet) };
  }
  return nodes;
}

/** Catch-up daily tick then build team tree/stats/history for demo wallet. */
export function buildDemoPartnerTeamFallback(wallet: string): {
  nodes: Record<string, PartnerTeamNode>;
  stats: PartnerTeamStats;
  downlineWallets: string[];
  pendingUd3: number;
  settledHistory: Ud3SettlementRecord[];
  lifetimeUd3: number;
  simToday: string;
  pendingRows: Ud3SettlementRecord[];
} {
  const sim = ensureDemoSimCaughtUp();
  const nodes = remappedSimNodes(sim, wallet);
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
  const pendingRows = buildDemoUd3PendingRows(nodes, sim.pendingDeposits);
  return {
    nodes,
    stats,
    downlineWallets,
    pendingUd3: estimatePendingUd3ForMe(nodes, sim.pendingDeposits),
    settledHistory: sim.settledHistory,
    lifetimeUd3: sim.lifetimeUd3,
    simToday: sim.simToday,
    pendingRows,
  };
}
