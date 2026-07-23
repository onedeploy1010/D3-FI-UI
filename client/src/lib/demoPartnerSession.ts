import {
  calcDailyUsdtYield,
  createStakeOrder,
  STAKE_LOCK_DAYS,
  type PartnerStakeOrder,
  type PartnerState,
  type PartnerTransfer,
  type StakeOrderKind,
} from '@/components/partner/partnerData';
import { resolveSettledUd3Base } from '@/components/partner/partnerUd3View';

const SESSION_KEY = 'd3_demo_partner_session';

export type DemoPartnerSession = {
  /** Ephemeral UD3 transfers — never persisted to backend in demo mode. */
  mockTransfers: PartnerTransfer[];
  /** Ephemeral crowdfund / partner_join orders — session-only. */
  mockStakeOrders: PartnerStakeOrder[];
  /** Set when user mock-joins as partner during this demo session. */
  mockPartnerJoined: boolean;
};

const EMPTY_SESSION: DemoPartnerSession = {
  mockTransfers: [],
  mockStakeOrders: [],
  mockPartnerJoined: false,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeSession(raw: unknown): DemoPartnerSession {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SESSION };
  const o = raw as Partial<DemoPartnerSession>;
  return {
    mockTransfers: Array.isArray(o.mockTransfers) ? o.mockTransfers : [],
    mockStakeOrders: Array.isArray(o.mockStakeOrders) ? o.mockStakeOrders : [],
    mockPartnerJoined: Boolean(o.mockPartnerJoined),
  };
}

export function loadDemoPartnerSession(): DemoPartnerSession {
  if (typeof sessionStorage === 'undefined') return { ...EMPTY_SESSION };
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { ...EMPTY_SESSION };
    return normalizeSession(JSON.parse(raw));
  } catch {
    return { ...EMPTY_SESSION };
  }
}

export function saveDemoPartnerSession(session: DemoPartnerSession): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearDemoPartnerSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(SESSION_KEY);
}

function sumMockTransferred(session: DemoPartnerSession): number {
  return round2(session.mockTransfers.reduce((s, t) => s + t.amountUd3, 0));
}

/** Settled UD3 baseline for demo — from performance/settlements, before session mock transfers. */
export function demoSettledUd3Base(state: PartnerState): number {
  return resolveSettledUd3Base(state);
}

function mergeMockStakeOrders(baseOrders: PartnerStakeOrder[], session: DemoPartnerSession): PartnerStakeOrder[] {
  if (!session.mockStakeOrders.length) return baseOrders;
  const seedIds = new Set(baseOrders.map((o) => o.id));
  const extras = session.mockStakeOrders.filter((o) => !seedIds.has(o.id));
  return [...extras, ...baseOrders];
}

/**
 * Overlay ephemeral demo session onto API-hydrated partner state.
 * Mock stake orders, transfers, and partner join never hit the backend.
 */
export function applyDemoSessionOverlay(
  base: PartnerState,
  session: DemoPartnerSession = loadDemoPartnerSession(),
): PartnerState {
  const settledBase = demoSettledUd3Base(base);
  const mockTransferred = sumMockTransferred(session);
  const mockUd3Staked = round2(
    session.mockStakeOrders
      .filter((o) => o.kind === 'sd3')
      .reduce((s, o) => s + o.principalUsdt, 0),
  );
  const staked = round2((base.ud3StakedFromRewards ?? 0) + mockUd3Staked);
  const available = Math.max(0, round2(settledBase - mockTransferred - staked));
  const today = new Date().toISOString().slice(0, 10);

  // Seeded baseline orders always show; session-mock stakes stack on top.
  const stakeOrders = mergeMockStakeOrders(base.stakeOrders, session);

  return {
    ...base,
    isPartner: session.mockPartnerJoined || base.isPartner,
    joinedAt: session.mockPartnerJoined || base.isPartner ? (base.joinedAt ?? today) : null,
    stakeOrders,
    transfers: [...session.mockTransfers],
    ud3StakedFromRewards: staked,
    ud3Balance: available,
    dtPreorderEligible:
      session.mockStakeOrders.length > 0 || session.mockPartnerJoined || base.dtPreorderEligible,
  };
}

export function addDemoMockTransfer(
  transfer: PartnerTransfer,
  session: DemoPartnerSession = loadDemoPartnerSession(),
): DemoPartnerSession {
  const next: DemoPartnerSession = {
    ...session,
    mockTransfers: [transfer, ...session.mockTransfers],
  };
  saveDemoPartnerSession(next);
  return next;
}

export function addDemoMockStakeOrder(
  order: PartnerStakeOrder,
  opts?: { partnerJoined?: boolean },
  session: DemoPartnerSession = loadDemoPartnerSession(),
): DemoPartnerSession {
  const next: DemoPartnerSession = {
    ...session,
    mockStakeOrders: [order, ...session.mockStakeOrders],
    mockPartnerJoined: session.mockPartnerJoined || Boolean(opts?.partnerJoined),
  };
  saveDemoPartnerSession(next);
  return next;
}

export function createDemoMockTransfer(
  toAddress: string,
  amountUd3: number,
  toLabel?: string,
): PartnerTransfer {
  return {
    id: `demo-mock-tr-${Date.now()}`,
    toAddress,
    toLabel,
    amountUd3,
    at: new Date().toISOString().slice(0, 10),
  };
}

export function createDemoMockStakeOrder(
  principalUsdt: number,
  kind: StakeOrderKind,
): PartnerStakeOrder {
  const order = createStakeOrder(principalUsdt, kind);
  return { ...order, id: `demo-mock-stake-${Date.now()}` };
}
