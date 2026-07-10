/** 合伙人计划 — 演示数据与业务常量 */

import type {
  PartnerAccountRow,
  PartnerSd3SettlementRow,
  PartnerSd3TransferRow,
  PartnerStakePositionRow,
} from '@/lib/d3fiTypes';

export const PARTNER_JOIN_USDT = 1;
export const MIN_CROWDFUND_STAKE_USDT = 0.01;
export const DAILY_YIELD_PCT = 0.4;
export const DAILY_YIELD_RATE = DAILY_YIELD_PCT / 100;
export const STAKE_LOCK_DAYS = 540;
export const CROWDFUND_TARGET_USDT = 20_000_000;
export const CROWDFUND_TOKEN_SUPPLY = 1_050_000;
export const CROWDFUND_UNIT_PRICE_USDT = 5;
export const PARTNER_SUBSIDY_RATE = 0.1;
export const MARKET_SUBSIDY_RATE = 0.05;

export type SubsidyStatus = 'pending' | 'approved' | 'rejected' | 'paid';
export type MarketLeaderStatus = 'none' | 'pending' | 'approved' | 'rejected';

export type SubsidyApplication = {
  id: string;
  amountUsd: number;
  purpose: string;
  appliedAt: string;
  status: SubsidyStatus;
  reviewedAt?: string;
  paidAt?: string;
  note?: string;
};

export type BribeTier = {
  min: number;
  max: number;
  rate: number;
  ratePct: number;
  labelZh: string;
  labelEn: string;
};

export const BRIBE_TIER_MIN_USD = 1;

export const BRIBE_TIERS: BribeTier[] = [
  { min: 1, max: 100_000, rate: 1, ratePct: 100, labelZh: '职业受贿人', labelEn: 'Pro Bribe Officer' },
  { min: 100_000, max: 200_000, rate: 0.8, ratePct: 80, labelZh: '大受贿人', labelEn: 'Senior Bribe Officer' },
  { min: 200_000, max: 500_000, rate: 0.6, ratePct: 60, labelZh: '受贿总监', labelEn: 'Bribe Director' },
  { min: 500_000, max: 1_000_000, rate: 0.5, ratePct: 50, labelZh: '首席', labelEn: 'Chief' },
];

/** 伞下业绩达到对应区间时返回受贿金等级；不足 1U 无等级。 */
export function getBribeTier(teamPerformanceUsd: number): BribeTier | null {
  if (teamPerformanceUsd < BRIBE_TIER_MIN_USD) return null;
  for (const tier of BRIBE_TIERS) {
    if (teamPerformanceUsd >= tier.min && teamPerformanceUsd < tier.max) return tier;
  }
  if (teamPerformanceUsd >= 1_000_000) return BRIBE_TIERS[BRIBE_TIERS.length - 1];
  return null;
}

/** 推荐树节点展示的合伙人等级文案键。 */
export function partnerTreeLevelKey(
  isPartner: boolean,
  teamPerformanceUsd: number,
): 'tree.memberRegular' | 'tree.memberPartner' | 'tier.proBribe' | 'tier.seniorBribe' | 'tier.director' | 'tier.chief' {
  if (!isPartner) return 'tree.memberRegular';
  const tier = getBribeTier(teamPerformanceUsd);
  if (!tier) return 'tree.memberPartner';
  const idx = BRIBE_TIERS.indexOf(tier);
  const keys = ['tier.proBribe', 'tier.seniorBribe', 'tier.director', 'tier.chief'] as const;
  return keys[idx >= 0 ? idx : 0];
}

/** 受贿金（sD3）仅合伙人上线获得：当日伞下新增业绩 × 等级比例。 */
export function calcDailySd3(
  teamPerformanceUsd: number,
  dailyNewPerformanceUsd: number,
  isPartner: boolean,
): number {
  if (!isPartner || dailyNewPerformanceUsd <= 0) return 0;
  const tier = getBribeTier(teamPerformanceUsd);
  if (!tier) return 0;
  return Math.round(dailyNewPerformanceUsd * tier.rate * 100) / 100;
}

export function calcDailyUsdtYield(stakedUsdt: number): number {
  return stakedUsdt * DAILY_YIELD_RATE;
}

/** 展示用：小额日息保留更多小数位。 */
export function formatDailyYieldUsdt(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0.00';
  if (amount < 0.01) return amount.toFixed(4);
  return amount.toFixed(2);
}

export type StakeOrderKind = 'crowdfund' | 'partner_join' | 'sd3';

/** Map API / DB stake position kind to UI order kind. */
export function normalizeStakeOrderKind(kind: string): StakeOrderKind {
  if (kind === 'partner_join') return 'partner_join';
  if (kind === 'crowdfund_stake' || kind === 'crowdfund') return 'crowdfund';
  if (kind === 'sd3') return 'sd3';
  return 'crowdfund';
}

export function isPrincipalStakeKind(kind: StakeOrderKind | string): boolean {
  const k = normalizeStakeOrderKind(kind);
  return k === 'crowdfund' || k === 'partner_join';
}

function toDateLabel(iso: string): string {
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

export function mapStakePositionToOrder(p: PartnerStakePositionRow): PartnerStakeOrder {
  return {
    id: p.id,
    kind: normalizeStakeOrderKind(p.kind),
    principalUsdt: Number(p.principal_usdt),
    startedAt: toDateLabel(p.started_at),
    unlockAt: toDateLabel(p.unlock_at),
    dailyYieldUsdt: Number(p.daily_yield_usdt),
    claimedYieldUsdt: Number(p.claimed_yield_usdt),
  };
}

export type PartnerStakeOrder = {
  id: string;
  kind: StakeOrderKind;
  principalUsdt: number;
  startedAt: string;
  unlockAt: string;
  dailyYieldUsdt: number;
  claimedYieldUsdt: number;
};

export type PartnerTransfer = {
  id: string;
  toAddress: string;
  toLabel?: string;
  amountSd3: number;
  at: string;
};

export type PartnerYieldWithdrawal = {
  id: string;
  amountUsdt: number;
  at: string;
};

export type PartnerHistoryKind = 'stake' | 'transfer' | 'withdraw';

export type PartnerHistoryRecord = {
  id: string;
  kind: PartnerHistoryKind;
  at: string;
  amount: number;
  unit: 'USDT' | 'sD3';
  stakeKind?: StakeOrderKind;
  toAddress?: string;
  toLabel?: string;
  unlockAt?: string;
};

export type Sd3SettlementRecord = {
  id: string;
  settledAt: string;
  teamPerformanceUsd: number;
  dailyNewPerformanceUsd: number;
  tierRatePct: number;
  sd3Amount: number;
};

export type PartnerState = {
  isPartner: boolean;
  joinedAt: string | null;
  stakeOrders: PartnerStakeOrder[];
  sd3Balance: number;
  sd3StakedFromRewards: number;
  teamPerformanceUsd: number;
  dailyNewPerformanceUsd: number;
  totalNewPerformanceUsd: number;
  lastSettlementDate: string;
  dailySd3Earned: number;
  lifetimeSd3Earned: number;
  lifetimeUsdtYield: number;
  transfers: PartnerTransfer[];
  yieldWithdrawals: PartnerYieldWithdrawal[];
  dtPreorderEligible: boolean;
  marketLeaderStatus: MarketLeaderStatus;
  partnerSubsidyApplications: SubsidyApplication[];
  marketSubsidyApplications: SubsidyApplication[];
  marketSubsidyPerformanceUsed: number;
  sd3SettlementHistory: Sd3SettlementRecord[];
  /** Server-settled USDT yield available to withdraw. */
  pendingUsdtYield: number;
};

export function stakeOrderDaysLeft(order: PartnerStakeOrder, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(order.unlockAt).getTime() - now) / 86400000));
}

export function stakeOrderProgress(order: PartnerStakeOrder, now = Date.now()): number {
  const start = new Date(order.startedAt).getTime();
  const end = new Date(order.unlockAt).getTime();
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
}

export function aggregateStakeOrders(orders: PartnerStakeOrder[]) {
  const principalUsdt = orders.reduce((s, o) => s + o.principalUsdt, 0);
  const dailyUsdtYield = orders.reduce((s, o) => s + o.dailyYieldUsdt, 0);
  const claimedYieldUsdt = orders.reduce((s, o) => s + o.claimedYieldUsdt, 0);
  return { principalUsdt, dailyUsdtYield, claimedYieldUsdt, orderCount: orders.length };
}

export function computeOrderYield(order: PartnerStakeOrder, now = Date.now()) {
  const start = new Date(order.startedAt).getTime();
  const days = Math.max(0, Math.floor((now - start) / 86400000));
  const accrued = Math.round(days * order.dailyYieldUsdt * 100) / 100;
  const claimable = Math.max(0, Math.round((accrued - order.claimedYieldUsdt) * 100) / 100);
  return { accrued, claimable };
}

export function computeYieldBalances(orders: PartnerStakeOrder[], now = Date.now()) {
  let accruedTotal = 0;
  let claimable = 0;
  for (const o of orders) {
    const row = computeOrderYield(o, now);
    accruedTotal += row.accrued;
    claimable += row.claimable;
  }
  const { principalUsdt, dailyUsdtYield, claimedYieldUsdt } = aggregateStakeOrders(orders);
  return {
    principalUsdt,
    dailyUsdtYield,
    claimedYieldUsdt,
    accruedTotal: Math.round(accruedTotal * 100) / 100,
    claimable: Math.round(claimable * 100) / 100,
  };
}

export function createStakeOrder(principalUsdt: number, kind: StakeOrderKind, now = new Date()): PartnerStakeOrder {
  const unlock = new Date(now);
  unlock.setDate(unlock.getDate() + STAKE_LOCK_DAYS);
  return {
    id: `ord-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    principalUsdt,
    startedAt: now.toISOString().slice(0, 10),
    unlockAt: unlock.toISOString().slice(0, 10),
    dailyYieldUsdt: calcDailyUsdtYield(principalUsdt),
    claimedYieldUsdt: 0,
  };
}

export function buildHistoryRecords(state: PartnerState): PartnerHistoryRecord[] {
  const stakes: PartnerHistoryRecord[] = state.stakeOrders.map((o) => ({
    id: o.id,
    kind: 'stake',
    at: o.startedAt,
    amount: o.principalUsdt,
    unit: o.kind === 'sd3' ? 'sD3' : 'USDT',
    stakeKind: o.kind,
    unlockAt: o.unlockAt,
  }));
  const transfers: PartnerHistoryRecord[] = state.transfers.map((tr) => ({
    id: tr.id,
    kind: 'transfer',
    at: tr.at,
    amount: tr.amountSd3,
    unit: 'sD3',
    toAddress: tr.toAddress,
    toLabel: tr.toLabel,
  }));
  const withdrawals: PartnerHistoryRecord[] = (state.yieldWithdrawals ?? []).map((w) => ({
    id: w.id,
    kind: 'withdraw',
    at: w.at,
    amount: w.amountUsdt,
    unit: 'USDT',
  }));
  return [...stakes, ...transfers, ...withdrawals].sort((a, b) => b.at.localeCompare(a.at));
}

export function applyCrowdfundStake(prev: PartnerState, amountUsdt: number): PartnerState {
  if (amountUsdt < MIN_CROWDFUND_STAKE_USDT) return prev;
  return {
    ...prev,
    stakeOrders: [createStakeOrder(amountUsdt, 'crowdfund'), ...prev.stakeOrders],
    dtPreorderEligible: true,
  };
}

export function applyPartnerJoin(prev: PartnerState): PartnerState {
  return {
    ...prev,
    isPartner: true,
    joinedAt: new Date().toISOString().slice(0, 10),
    stakeOrders: [createStakeOrder(PARTNER_JOIN_USDT, 'partner_join'), ...prev.stakeOrders],
    dtPreorderEligible: true,
  };
}

export function applySd3Stake(prev: PartnerState, amount: number): PartnerState {
  if (!prev.isPartner || amount <= 0 || amount > prev.sd3Balance) return prev;
  return {
    ...prev,
    sd3Balance: prev.sd3Balance - amount,
    sd3StakedFromRewards: prev.sd3StakedFromRewards + amount,
    stakeOrders: [createStakeOrder(amount, 'sd3'), ...prev.stakeOrders],
  };
}

export function applySd3Transfer(
  prev: PartnerState,
  toAddress: string,
  amount: number,
  toLabel?: string,
): PartnerState {
  if (!prev.isPartner || amount <= 0 || amount > prev.sd3Balance) return prev;
  return {
    ...prev,
    sd3Balance: prev.sd3Balance - amount,
    transfers: [
      { id: `t-${Date.now()}`, toAddress, toLabel, amountSd3: amount, at: new Date().toISOString().slice(0, 10) },
      ...prev.transfers,
    ],
  };
}

export function applyYieldWithdraw(prev: PartnerState, amount: number): PartnerState {
  const { claimable } = computeYieldBalances(prev.stakeOrders);
  if (!prev.isPartner || amount <= 0 || amount > claimable) return prev;

  let remaining = amount;
  const stakeOrders = prev.stakeOrders.map((o) => {
    const orderClaimable = computeOrderYield(o).claimable;
    if (remaining <= 0 || orderClaimable <= 0) return o;
    const take = Math.min(remaining, orderClaimable);
    remaining = Math.round((remaining - take) * 100) / 100;
    return {
      ...o,
      claimedYieldUsdt: Math.round((o.claimedYieldUsdt + take) * 100) / 100,
    };
  });

  return {
    ...prev,
    stakeOrders,
    lifetimeUsdtYield: Math.round((prev.lifetimeUsdtYield + amount) * 100) / 100,
    yieldWithdrawals: [
      {
        id: `yw-${Date.now()}`,
        amountUsdt: amount,
        at: new Date().toISOString().slice(0, 10),
      },
      ...(prev.yieldWithdrawals ?? []),
    ],
  };
}

export const DEMO_PARTNER_STATE: PartnerState = {
  isPartner: true,
  joinedAt: '2026-07-01',
  stakeOrders: [
    {
      id: 'demo-ord-1',
      kind: 'partner_join',
      principalUsdt: 5000,
      startedAt: '2026-07-01',
      unlockAt: '2027-12-23',
      dailyYieldUsdt: 20,
      claimedYieldUsdt: 240,
    },
    {
      id: 'demo-ord-2',
      kind: 'crowdfund',
      principalUsdt: 1000,
      startedAt: '2026-06-15',
      unlockAt: '2027-11-27',
      dailyYieldUsdt: 4,
      claimedYieldUsdt: 48,
    },
    {
      id: 'demo-ord-3',
      kind: 'sd3',
      principalUsdt: 500,
      startedAt: '2026-07-05',
      unlockAt: '2027-12-27',
      dailyYieldUsdt: 2,
      claimedYieldUsdt: 8,
    },
  ],
  sd3Balance: 1500,
  sd3StakedFromRewards: 500,
  teamPerformanceUsd: 86_400,
  dailyNewPerformanceUsd: 3000,
  totalNewPerformanceUsd: 52_000,
  lastSettlementDate: '2026-07-08',
  dailySd3Earned: 3000,
  lifetimeSd3Earned: 24_600,
  lifetimeUsdtYield: 296,
  transfers: [
    {
      id: 't1',
      toAddress: '0x1111222233334444555566667777888899990000',
      toLabel: 'Direct A3',
      amountSd3: 1500,
      at: '2026-07-07',
    },
  ],
  yieldWithdrawals: [
    { id: 'yw-demo-1', amountUsdt: 120, at: '2026-07-06' },
    { id: 'yw-demo-2', amountUsdt: 80, at: '2026-07-04' },
  ],
  dtPreorderEligible: true,
  marketLeaderStatus: 'approved',
  partnerSubsidyApplications: [
    {
      id: 'ps-demo-1',
      amountUsd: 2000,
      purpose: '7月线下会议场地',
      appliedAt: '2026-07-03',
      status: 'paid',
      reviewedAt: '2026-07-04',
      paidAt: '2026-07-06',
    },
    {
      id: 'ps-demo-2',
      amountUsd: 1500,
      purpose: '团队餐补',
      appliedAt: '2026-07-08',
      status: 'pending',
    },
  ],
  marketSubsidyApplications: [
    {
      id: 'ms-demo-1',
      amountUsd: 800,
      purpose: '区域宣讲会',
      appliedAt: '2026-07-05',
      status: 'approved',
      reviewedAt: '2026-07-07',
    },
  ],
  marketSubsidyPerformanceUsed: 16_000,
  sd3SettlementHistory: [
    { id: 'sd3-1', settledAt: '2026-07-08', teamPerformanceUsd: 86_400, dailyNewPerformanceUsd: 3000, tierRatePct: 100, sd3Amount: 3000 },
    { id: 'sd3-2', settledAt: '2026-07-07', teamPerformanceUsd: 83_400, dailyNewPerformanceUsd: 2800, tierRatePct: 100, sd3Amount: 2800 },
    { id: 'sd3-3', settledAt: '2026-07-06', teamPerformanceUsd: 80_600, dailyNewPerformanceUsd: 2500, tierRatePct: 100, sd3Amount: 2500 },
    { id: 'sd3-4', settledAt: '2026-07-05', teamPerformanceUsd: 78_100, dailyNewPerformanceUsd: 2200, tierRatePct: 100, sd3Amount: 2200 },
    { id: 'sd3-5', settledAt: '2026-07-04', teamPerformanceUsd: 75_900, dailyNewPerformanceUsd: 1900, tierRatePct: 100, sd3Amount: 1900 },
    { id: 'sd3-6', settledAt: '2026-07-03', teamPerformanceUsd: 74_000, dailyNewPerformanceUsd: 1600, tierRatePct: 100, sd3Amount: 1600 },
  ],
  pendingUsdtYield: 0,
};

export const GUEST_PARTNER_STATE: PartnerState = {
  isPartner: false,
  joinedAt: null,
  stakeOrders: [],
  sd3Balance: 0,
  sd3StakedFromRewards: 0,
  teamPerformanceUsd: 0,
  dailyNewPerformanceUsd: 0,
  totalNewPerformanceUsd: 0,
  lastSettlementDate: '—',
  dailySd3Earned: 0,
  lifetimeSd3Earned: 0,
  lifetimeUsdtYield: 0,
  transfers: [],
  yieldWithdrawals: [],
  dtPreorderEligible: false,
  marketLeaderStatus: 'none',
  partnerSubsidyApplications: [],
  marketSubsidyApplications: [],
  marketSubsidyPerformanceUsed: 0,
  sd3SettlementHistory: [],
  pendingUsdtYield: 0,
};

type LegacyPartnerState = PartnerState & {
  stake?: PartnerStakeOrder & { principalUsdt: number };
  dailyUsdtYield?: number;
};

export function migratePartnerState(raw: unknown): PartnerState {
  const s = raw as LegacyPartnerState;
  const base = { ...GUEST_PARTNER_STATE, ...s };
  if (Array.isArray(s.stakeOrders)) {
    return {
      ...base,
      stakeOrders: s.stakeOrders.map((o) => ({
        ...o,
        kind: normalizeStakeOrderKind(o.kind as string),
        dailyYieldUsdt:
          o.dailyYieldUsdt > 0 ? o.dailyYieldUsdt : calcDailyUsdtYield(o.principalUsdt),
      })),
      totalNewPerformanceUsd: s.totalNewPerformanceUsd ?? s.teamPerformanceUsd ?? 0,
      marketLeaderStatus: s.marketLeaderStatus ?? 'none',
      partnerSubsidyApplications: s.partnerSubsidyApplications ?? [],
      marketSubsidyApplications: s.marketSubsidyApplications ?? [],
      marketSubsidyPerformanceUsed: s.marketSubsidyPerformanceUsed ?? 0,
      sd3SettlementHistory: s.sd3SettlementHistory ?? [],
      yieldWithdrawals: s.yieldWithdrawals ?? [],
      pendingUsdtYield: s.pendingUsdtYield ?? 0,
    } as PartnerState;
  }
  if (s.stake) {
    const { stake, dailyUsdtYield: _d, ...rest } = s;
    return migratePartnerState({
      ...rest,
      stakeOrders: [
        {
          id: 'migrated-1',
          kind: s.isPartner ? 'partner_join' : 'crowdfund',
          principalUsdt: stake.principalUsdt,
          startedAt: stake.startedAt,
          unlockAt: stake.unlockAt,
          dailyYieldUsdt: stake.dailyYieldUsdt,
          claimedYieldUsdt: stake.claimedYieldUsdt,
        },
      ],
    });
  }
  return migratePartnerState({ ...s, stakeOrders: s.stakeOrders ?? [] });
}

/** Merge server partner account + settlements into local UI state. */
export function hydratePartnerStateFromApi(
  local: PartnerState,
  api: {
    partnerAccount?: PartnerAccountRow | null;
    partnerStakePositions?: PartnerStakePositionRow[];
    partnerSd3Settlements?: PartnerSd3SettlementRow[];
    partnerSd3Transfers?: PartnerSd3TransferRow[];
  },
): PartnerState {
  const account = api.partnerAccount;
  const positions = api.partnerStakePositions ?? [];
  const hasServer = Boolean(account || positions.length > 0 || (api.partnerSd3Settlements?.length ?? 0) > 0);
  if (!hasServer) return local;

  const stakeOrders: PartnerStakeOrder[] = positions.map(mapStakePositionToOrder);

  const serverIds = new Set(stakeOrders.map((o) => o.id));
  const localExtras = local.stakeOrders.filter((o) => !serverIds.has(o.id));
  const mergedStakeOrders =
    stakeOrders.length > 0 ? [...stakeOrders, ...localExtras] : local.stakeOrders;

  const sd3SettlementHistory: Sd3SettlementRecord[] = (api.partnerSd3Settlements ?? []).map((r) => ({
    id: r.id,
    settledAt: r.settlement_date,
    teamPerformanceUsd: Number(r.team_performance_usd),
    dailyNewPerformanceUsd: Number(r.daily_new_performance_usd),
    tierRatePct: Number(r.tier_rate_pct),
    sd3Amount: Number(r.sd3_amount),
  }));

  const latestSd3 = sd3SettlementHistory[0];

  const serverTransfers: PartnerTransfer[] = (api.partnerSd3Transfers ?? []).map((r) => ({
    id: r.id,
    toAddress: r.to_wallet,
    amountSd3: Number(r.amount_sd3),
    at: r.created_at.slice(0, 10),
  }));

  return {
    ...local,
    isPartner: account?.is_partner ?? local.isPartner,
    joinedAt: account?.joined_at ?? local.joinedAt,
    sd3Balance: account ? Number(account.sd3_balance) : local.sd3Balance,
    lifetimeSd3Earned: account ? Number(account.lifetime_sd3_earned) : local.lifetimeSd3Earned,
    lifetimeUsdtYield: account ? Number(account.lifetime_usdt_yield) : local.lifetimeUsdtYield,
    pendingUsdtYield: account ? Number(account.pending_usdt_yield) : local.pendingUsdtYield,
    stakeOrders: mergedStakeOrders,
    transfers: serverTransfers.length > 0 ? serverTransfers : local.transfers,
    sd3SettlementHistory,
    lastSettlementDate: latestSd3?.settledAt ?? local.lastSettlementDate,
    dailySd3Earned: latestSd3?.sd3Amount ?? local.dailySd3Earned,
  };
}

export const SD3_QUOTA_RATE_PCT = 100;

export function getSd3Quotas(state: PartnerState) {
  const available = state.sd3Balance;
  const quota = available;
  return {
    available,
    staked: state.sd3StakedFromRewards,
    quotaRatePct: SD3_QUOTA_RATE_PCT,
    stakeQuota: quota,
    transferQuota: quota,
  };
}

export function partnerSubsidyQuota(state: PartnerState) {
  const base = state.totalNewPerformanceUsd;
  const cap = Math.round(base * PARTNER_SUBSIDY_RATE * 100) / 100;
  const reserved = state.partnerSubsidyApplications
    .filter((a) => a.status !== 'rejected')
    .reduce((s, a) => s + a.amountUsd, 0);
  return {
    basePerformance: base,
    ratePct: PARTNER_SUBSIDY_RATE * 100,
    cap,
    reserved,
    remaining: Math.max(0, Math.round((cap - reserved) * 100) / 100),
  };
}

export function marketSubsidyQuota(state: PartnerState) {
  const remainingPerf = Math.max(0, state.totalNewPerformanceUsd - state.marketSubsidyPerformanceUsed);
  const cap = Math.round(remainingPerf * MARKET_SUBSIDY_RATE * 100) / 100;
  const reserved = state.marketSubsidyApplications
    .filter((a) => a.status !== 'rejected')
    .reduce((s, a) => s + a.amountUsd, 0);
  return {
    basePerformance: remainingPerf,
    ratePct: MARKET_SUBSIDY_RATE * 100,
    cap,
    reserved,
    remaining: Math.max(0, Math.round((cap - reserved) * 100) / 100),
  };
}

export function calcOpeningPrice(crowdfundRaisedUsd: number): number {
  if (crowdfundRaisedUsd <= 0) return 0;
  return Math.round((crowdfundRaisedUsd / CROWDFUND_TOKEN_SUPPLY) * 10000) / 10000;
}

export function applyPartnerSubsidy(
  prev: PartnerState,
  amountUsd: number,
  purpose: string,
): PartnerState {
  if (!prev.isPartner || amountUsd <= 0) return prev;
  const { remaining } = partnerSubsidyQuota(prev);
  if (amountUsd > remaining) return prev;
  const app: SubsidyApplication = {
    id: `ps-${Date.now()}`,
    amountUsd,
    purpose: purpose.trim(),
    appliedAt: new Date().toISOString().slice(0, 10),
    status: 'pending',
  };
  return { ...prev, partnerSubsidyApplications: [app, ...prev.partnerSubsidyApplications] };
}

export function applyMarketLeader(prev: PartnerState): PartnerState {
  if (!prev.isPartner || prev.marketLeaderStatus === 'pending' || prev.marketLeaderStatus === 'approved') {
    return prev;
  }
  return { ...prev, marketLeaderStatus: 'pending' };
}

export function applyMarketSubsidy(
  prev: PartnerState,
  amountUsd: number,
  purpose: string,
): PartnerState {
  if (!prev.isPartner || prev.marketLeaderStatus !== 'approved' || amountUsd <= 0) return prev;
  const { remaining } = marketSubsidyQuota(prev);
  if (amountUsd > remaining) return prev;
  const perfConsumed = Math.round((amountUsd / MARKET_SUBSIDY_RATE) * 100) / 100;
  const app: SubsidyApplication = {
    id: `ms-${Date.now()}`,
    amountUsd,
    purpose: purpose.trim(),
    appliedAt: new Date().toISOString().slice(0, 10),
    status: 'pending',
  };
  return {
    ...prev,
    marketSubsidyPerformanceUsed: prev.marketSubsidyPerformanceUsed + perfConsumed,
    marketSubsidyApplications: [app, ...prev.marketSubsidyApplications],
  };
}

export function storageKey(wallet: string) {
  return `d3_partner_v2_${wallet.toLowerCase()}`;
}
