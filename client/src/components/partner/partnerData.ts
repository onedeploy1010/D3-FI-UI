/** 合伙人计划 — 演示数据与业务常量 */

import type {
  PartnerAccountRow,
  PartnerUd3SettlementRow,
  PartnerUd3TransferRow,
  PartnerStakePositionRow,
  PartnerYieldSettlementRow,
} from '@/lib/d3fiTypes';
import type { PartnerTeamNode } from '@/components/partner/partnerTeamData';
import { partnerTeamNodes } from '@/components/partner/partnerTeamData';
import {
  buildDemoUd3SettlementHistory,
  getDemoPendingDepositTotalUsd,
  sumDemoUd3History,
  DEMO_UD3_LAST_SETTLED,
} from '@/components/partner/ud3DemoSettle';
import {
  computeMarketSubsidyQuotaFromTree,
  computePartnerSubsidyQuotaFromTree,
  type SubsidyQuotaView,
} from '@/components/partner/partnerSubsidyQuota';

const DEMO_UD3_HISTORY = buildDemoUd3SettlementHistory(partnerTeamNodes);
const DEMO_UD3_LIFETIME = sumDemoUd3History(DEMO_UD3_HISTORY);
const DEMO_PENDING_NEW_USD = getDemoPendingDepositTotalUsd();

/** Fixed USDT amount to become a partner (single partner_join stake). */
export const PARTNER_ENTRY_USDT = 5000;
/** @deprecated Use PARTNER_ENTRY_USDT */
export const PARTNER_JOIN_USDT = PARTNER_ENTRY_USDT;
export const MIN_CROWDFUND_STAKE_USDT = 0.01;
export const DEFAULT_HOME_STAKE_USDT = PARTNER_ENTRY_USDT;
export const REGULAR_STAKE_STEP_USDT = 100;
export const REGULAR_STAKE_MIN_USDT = 100;
/** UD3 stake amounts must be whole multiples of 100. */
export const UD3_STAKE_STEP = 100;
export const UD3_STAKE_MIN = 100;
/** USDT / crowdfund / partner-join 540d orders exit at 6× principal accrued yield. */
export const STAKE_EXIT_MULTIPLIER_DEFAULT = 6;
/** UD3 stake orders exit at 2× principal accrued yield (no bribe/UD3 re-generation). */
export const STAKE_EXIT_MULTIPLIER_SD3 = 2;

export function isValidRegularStakeAmount(amount: number): boolean {
  return (
    Number.isFinite(amount) &&
    amount >= REGULAR_STAKE_MIN_USDT &&
    amount % REGULAR_STAKE_STEP_USDT === 0
  );
}

export function isValidUd3StakeAmount(amount: number, availableUd3: number): boolean {
  return (
    Number.isFinite(amount) &&
    amount >= UD3_STAKE_MIN &&
    amount % UD3_STAKE_STEP === 0 &&
    amount <= availableUd3 + 1e-9
  );
}
/** Minimum USDT yield flash-withdraw (1 USDT @ 0.4%/day = 0.004). */
export const MIN_YIELD_WITHDRAW_USDT = 0.001;
/** Flash-swap (yield withdraw) protocol fee. */
export const FLASH_SWAP_FEE_PCT = 3;

export function calcFlashSwapAmounts(grossUsdt: number): {
  grossUsdt: number;
  feeUsdt: number;
  netUsdt: number;
  feePct: number;
} {
  const gross = Number.isFinite(grossUsdt) && grossUsdt > 0 ? Math.round(grossUsdt * 1e6) / 1e6 : 0;
  const feeUsdt = Math.round(gross * (FLASH_SWAP_FEE_PCT / 100) * 1e6) / 1e6;
  const netUsdt = Math.round((gross - feeUsdt) * 1e6) / 1e6;
  return { grossUsdt: gross, feeUsdt, netUsdt, feePct: FLASH_SWAP_FEE_PCT };
}

export const DAILY_YIELD_PCT = 0.4;
export const DAILY_YIELD_RATE = DAILY_YIELD_PCT / 100;
export const STAKE_LOCK_DAYS = 540;
export const CROWDFUND_TARGET_USDT = 20_000_000;
export const CROWDFUND_TOKEN_SUPPLY = 1_050_000;
/** Current D3 crowdfund unit price (USDT per D3). */
export const CROWDFUND_UNIT_PRICE_USDT = 5;

/** Convert stake USDT into D3 quantity at the crowdfund unit price. */
export function usdtToD3(amountUsdt: number, priceUsdt = CROWDFUND_UNIT_PRICE_USDT): number {
  if (!Number.isFinite(amountUsdt) || amountUsdt <= 0 || priceUsdt <= 0) return 0;
  return Math.round((amountUsdt / priceUsdt) * 1e6) / 1e6;
}

/** @deprecated Use usdtToD3 */
export const usdtToDt = usdtToD3;

/** Convert D3 quantity to USDT value at current crowdfund price. */
export function d3ToUsdt(amountD3: number, priceUsdt = CROWDFUND_UNIT_PRICE_USDT): number {
  if (!Number.isFinite(amountD3) || amountD3 <= 0 || priceUsdt <= 0) return 0;
  return Math.round(amountD3 * priceUsdt * 1e6) / 1e6;
}

/** Daily USDT interest on gold-standard principal (0.4%/day). */
export function calcDailyUsdtYield(stakedUsdt: number): number {
  return stakedUsdt * DAILY_YIELD_RATE;
}

/**
 * Daily D3 release: (principal × 0.4% USDT interest) / D3 price.
 * Example: 1000 USDT → 4 USDT / 5 = 0.8 D3 per day.
 */
export function calcDailyD3Release(
  stakedUsdt: number,
  priceUsdt = CROWDFUND_UNIT_PRICE_USDT,
): number {
  return usdtToD3(calcDailyUsdtYield(stakedUsdt), priceUsdt);
}

export function formatD3Amount(amount: number, digits = 4): string {
  if (!Number.isFinite(amount) || amount < 0) return (0).toFixed(digits);
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}
export const PARTNER_SUBSIDY_RATE = 0.1;
export const MARKET_SUBSIDY_RATE = 0.05;

export type SubsidyStatus = 'pending' | 'approved' | 'rejected' | 'paid';
export type MarketLeaderStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type SubsidyApplicationType = 'reserve' | 'reimbursement';

export type SubsidyApplication = {
  id: string;
  amountUsd: number;
  purpose: string;
  appliedAt: string;
  status: SubsidyStatus;
  applicationType?: SubsidyApplicationType;
  receiptPaths?: string[];
  reviewedAt?: string;
  paidAt?: string;
  note?: string;
};

export type PartnerProgramSettings = {
  partnerSubsidyRatePct: number;
  marketSubsidyRatePct: number;
};

export type BribeTier = {
  min: number;
  max: number;
  rate: number;
  ratePct: number;
  labelZh: string;
  labelEn: string;
};

export const BRIBE_TIER_MIN_USD = 100;

export const BRIBE_TIERS: BribeTier[] = [
  { min: 100, max: 100_000, rate: 1, ratePct: 100, labelZh: '职业受贿人', labelEn: 'Pro Bribe Officer' },
  { min: 100_000, max: 200_000, rate: 0.8, ratePct: 80, labelZh: '大受贿人', labelEn: 'Senior Bribe Officer' },
  { min: 200_000, max: 500_000, rate: 0.6, ratePct: 60, labelZh: '受贿总监', labelEn: 'Bribe Director' },
  { min: 500_000, max: 1_000_000, rate: 0.5, ratePct: 50, labelZh: '首席', labelEn: 'Chief' },
];

/** Direct / upline split by bribe tier (tier 1 = 100–100k USD small area). */
export const BRIBE_TIER_SPLITS = [
  { directShare: 0.5, uplineShare: 0.5 },
  { directShare: 0.4, uplineShare: 0.6 },
  { directShare: 0.3, uplineShare: 0.7 },
  { directShare: 0.2, uplineShare: 0.8 },
] as const;

/** 小区业绩达到对应区间时返回受贿金等级；不足 100U 无等级。 */
export function getBribeTier(smallAreaPerformanceUsd: number): BribeTier | null {
  if (smallAreaPerformanceUsd < BRIBE_TIER_MIN_USD) return null;
  for (const tier of BRIBE_TIERS) {
    if (smallAreaPerformanceUsd >= tier.min && smallAreaPerformanceUsd < tier.max) return tier;
  }
  if (smallAreaPerformanceUsd >= 1_000_000) return BRIBE_TIERS[BRIBE_TIERS.length - 1];
  return null;
}

export function getBribeTierSplit(tier: BribeTier) {
  const idx = BRIBE_TIERS.indexOf(tier);
  return BRIBE_TIER_SPLITS[idx >= 0 ? idx : 0];
}

/** 推荐树节点展示的合伙人等级文案键（按伞下业绩展示等级）。 */
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

/** 小区新增业绩(USDT)÷D3众筹价 → D3数量 × 等级受贿比例 × 直推分成。 */
export function calcDailyUd3(
  smallAreaPerformanceUsd: number,
  smallAreaNewPerformanceUsd: number,
  isPartner: boolean,
): number {
  if (!isPartner || smallAreaNewPerformanceUsd <= 0) return 0;
  const tier = getBribeTier(smallAreaPerformanceUsd);
  if (!tier) return 0;
  const split = getBribeTierSplit(tier);
  const d3Amount = usdtToD3(smallAreaNewPerformanceUsd);
  const gross = d3Amount * tier.rate;
  return Math.round(gross * split.directShare * 100) / 100;
}

export function calcDailyUd3Gross(
  smallAreaPerformanceUsd: number,
  smallAreaNewPerformanceUsd: number,
  isPartner: boolean,
): { grossUd3: number; tierRatePct: number; directSharePct: number; uplineSharePct: number } {
  if (!isPartner || smallAreaNewPerformanceUsd <= 0) {
    return { grossUd3: 0, tierRatePct: 0, directSharePct: 0, uplineSharePct: 0 };
  }
  const tier = getBribeTier(smallAreaPerformanceUsd);
  if (!tier) return { grossUd3: 0, tierRatePct: 0, directSharePct: 0, uplineSharePct: 0 };
  const split = getBribeTierSplit(tier);
  const grossUd3 = Math.round(usdtToD3(smallAreaNewPerformanceUsd) * tier.rate * 100) / 100;
  return {
    grossUd3,
    tierRatePct: tier.ratePct,
    directSharePct: Math.round(split.directShare * 100),
    uplineSharePct: Math.round(split.uplineShare * 100),
  };
}

/** 展示用：日返息固定 4 位小数。 */
export function formatDailyYieldUsdt(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '0.0000';
  return amount.toFixed(4);
}

export type YieldReleaseRecord = {
  id: string;
  date: string;
  yieldUsdt: number;
  source: 'settled' | 'accrued';
};

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

export function getStakeExitMultiplier(kind: StakeOrderKind | string): number {
  return normalizeStakeOrderKind(kind) === 'sd3'
    ? STAKE_EXIT_MULTIPLIER_SD3
    : STAKE_EXIT_MULTIPLIER_DEFAULT;
}

/** Max accrued yield before order exits (principal × exit multiple). */
export function getStakeExitYieldCap(order: { kind: StakeOrderKind | string; principalUsdt: number }): number {
  return Math.round(order.principalUsdt * getStakeExitMultiplier(order.kind) * 100) / 100;
}

/** Date portion of a timestamp in SGT (UTC+8) — the settlement timezone — so stake
 *  dates line up with the daily SGT-midnight settlement (a 21:53 UTC stake is the
 *  next SGT day, not the UTC day). Pure date strings pass through unchanged. */
export function toSgtDateLabel(iso: string): string {
  if (typeof iso !== 'string') return iso;
  // Already a bare YYYY-MM-DD (no time/zone) — keep as-is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return iso.trim();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.length >= 10 ? iso.slice(0, 10) : iso;
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function toDateLabel(iso: string): string {
  return toSgtDateLabel(iso);
}

/** Today's date (YYYY-MM-DD) in SGT. */
export function sgtTodayStr(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Add `n` days to a YYYY-MM-DD string (tz-safe via UTC anchor). */
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
  amountUd3: number;
  at: string;
};

export type PartnerYieldWithdrawal = {
  id: string;
  amountUsdt: number;
  at: string;
  status?: 'pending' | 'signing' | 'broadcasted' | 'confirmed' | 'failed';
};

export type PartnerHistoryKind = 'stake' | 'transfer' | 'withdraw';

export type PartnerHistoryRecord = {
  id: string;
  kind: PartnerHistoryKind;
  at: string;
  status?: 'pending' | 'signing' | 'broadcasted' | 'confirmed' | 'failed';
  amount: number;
  unit: 'USDT' | 'UD3';
  stakeKind?: StakeOrderKind;
  toAddress?: string;
  toLabel?: string;
  unlockAt?: string;
};

export type Ud3RewardRole = 'direct' | 'upline';

export type Ud3SettlementRecord = {
  id: string;
  settledAt: string;
  teamPerformanceUsd: number;
  /** 触发奖励的下线入金 USDT */
  dailyNewPerformanceUsd: number;
  /** 引路人（入金者直推上级）档位百分比，如 S1=100 */
  tierRatePct: number;
  ud3Amount: number;
  /** 直推 60% / 网体级差 */
  role?: Ud3RewardRole;
  /** 直推=60；级差=本次 gap% */
  rewardSharePct?: number;
  /** 网体级差实际差距（与 rewardSharePct 同值时可省略） */
  gapPct?: number;
  /** 收款人当时网体 S 级，如 S2（用于级差） */
  vLabel?: string;
  /** 入金地址相对本人的层数：1=直推，2=二层… */
  sourceDepth?: number;
  /** 入金成员 */
  sourceAddress?: string;
  sourceLabel?: string;
  /** 该笔入金的引路人（直推上级）；级差奖励来源 */
  guideAddress?: string;
  guideLabel?: string;
  /** 引路人档位标签，如 S1 */
  guideTierLabel?: string;
  /** 入金 × 引路人档位 = 总受贿金 */
  generatedUd3?: number;
  /** 总受贿金 × 40% 网体池 */
  networkPoolUd3?: number;
  /** Demo / 列表：已结算 vs 当日未结算 */
  settlementStatus?: 'settled' | 'pending';
};

export type PartnerState = {
  isPartner: boolean;
  joinedAt: string | null;
  stakeOrders: PartnerStakeOrder[];
  ud3Balance: number;
  /** Unsettled (未结算) UD3 awaiting the daily SGT-midnight settlement (043). */
  pendingUd3: number;
  ud3StakedFromRewards: number;
  teamPerformanceUsd: number;
  dailyNewPerformanceUsd: number;
  totalNewPerformanceUsd: number;
  lastSettlementDate: string;
  dailyUd3Earned: number;
  lifetimeUd3Earned: number;
  lifetimeUsdtYield: number;
  transfers: PartnerTransfer[];
  yieldWithdrawals: PartnerYieldWithdrawal[];
  dtPreorderEligible: boolean;
  marketLeaderStatus: MarketLeaderStatus;
  partnerSubsidyApplications: SubsidyApplication[];
  marketSubsidyApplications: SubsidyApplication[];
  marketSubsidyPerformanceUsed: number;
  ud3SettlementHistory: Ud3SettlementRecord[];
  /** Server-settled USDT yield available to withdraw. */
  pendingUsdtYield: number;
  /** Settled, withdrawable D3 yield (flash-swap uses this; 0 until settlement). */
  pendingD3Yield: number;
  /** Daily USDT yield release rows keyed by stake position id. */
  yieldSettlementsByPosition: Record<string, YieldReleaseRecord[]>;
};

export function buildStakeOrderYieldHistory(
  order: PartnerStakeOrder,
  settlements: PartnerYieldSettlementRow[] = [],
): YieldReleaseRecord[] {
  // Days the daily run has already settled (authoritative, source='settled').
  // settlement_date is already the SGT day it settled.
  const settledRows = settlements
    .filter((r) => r.position_id === order.id)
    .map((r) => ({
      id: r.id,
      date: r.settlement_date,
      yieldUsdt: Number(r.yield_usdt),
      source: 'settled' as const,
    }));
  const settledDates = new Set(settledRows.map((r) => r.date));

  // All dates are SGT day-strings — the settlement timezone — so a position started
  // 21:53 UTC (= next SGT day) shows the correct start day, and estimated rows never
  // predate the SGT stake day. Estimated (未结算) rows cover every SGT day from the
  // stake day through today (SGT) that the daily run has not settled yet.
  const startStr = order.startedAt; // already SGT via toSgtDateLabel
  const unlockStr = order.unlockAt;
  const todayStr = sgtTodayStr();

  const accrued: YieldReleaseRecord[] = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(startStr) && order.dailyYieldUsdt > 0) {
    const exitCap = getStakeExitYieldCap(order);
    let cursor = startStr;
    let running = settledRows.reduce((s, r) => s + r.yieldUsdt, 0);
    let guard = 0;
    while (cursor <= todayStr && cursor <= unlockStr && running < exitCap - 1e-9 && guard++ < 1000) {
      const date = cursor;
      cursor = addDaysStr(cursor, 1);
      if (settledDates.has(date)) continue; // real settlement already covers this day
      const dayYield = Math.min(order.dailyYieldUsdt, Math.round((exitCap - running) * 100) / 100);
      if (dayYield <= 0) break;
      accrued.push({
        id: `accrued-${order.id}-${date}`,
        date,
        yieldUsdt: dayYield,
        source: 'accrued',
      });
      running = Math.round((running + dayYield) * 100) / 100;
    }
  }

  return [...settledRows, ...accrued].sort((a, b) => b.date.localeCompare(a.date));
}

export function mapYieldSettlementsByPosition(
  settlements: PartnerYieldSettlementRow[],
): Record<string, YieldReleaseRecord[]> {
  const map: Record<string, YieldReleaseRecord[]> = {};
  for (const r of settlements) {
    const positionId = r.position_id;
    if (!map[positionId]) map[positionId] = [];
    map[positionId].push({
      id: r.id,
      date: r.settlement_date,
      yieldUsdt: Number(r.yield_usdt),
      source: 'settled',
    });
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => b.date.localeCompare(a.date));
  }
  return map;
}

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
  const uncapped = Math.round(days * order.dailyYieldUsdt * 100) / 100;
  const exitCap = getStakeExitYieldCap(order);
  const accrued = Math.min(uncapped, exitCap);
  const claimable = Math.max(0, Math.round((accrued - order.claimedYieldUsdt) * 100) / 100);
  return { accrued, claimable, exitCap, exited: uncapped >= exitCap };
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

/** Flash-withdraw balances: USDT interest is source of truth; D3 is displayed via price conversion. */
export function resolveFlashYieldBalances(
  state: PartnerState,
  now = Date.now(),
  d3PriceUsdt = CROWDFUND_UNIT_PRICE_USDT,
) {
  const computed = computeYieldBalances(state.stakeOrders, now);
  // Authoritative withdrawable amount = the server's SETTLED pending_d3_yield. It is
  // credited only by the daily SGT-midnight settlement, so it is 0 for a freshly
  // staked position. The client-side accrued estimate (computed.claimable) must NOT
  // drive the withdrawable figure — the backend only lets you flash-swap the settled
  // D3, so showing the estimate made the button offer an amount the backend rejects.
  const claimableD3 = Math.max(0, Number(state.pendingD3Yield ?? 0));
  const claimableUsdt = d3ToUsdt(claimableD3, d3PriceUsdt);
  const accruedUsdt = Math.max(computed.accruedTotal, Number(state.lifetimeUsdtYield ?? 0));
  const claimedUsdt = computed.claimedYieldUsdt;
  const dailyUsdtYield = computed.dailyUsdtYield;
  const minWithdrawD3 = usdtToD3(MIN_YIELD_WITHDRAW_USDT, d3PriceUsdt);
  return {
    ...computed,
    claimable: claimableUsdt,
    claimableUsdt,
    accruedTotal: accruedUsdt,
    d3PriceUsdt,
    claimableD3,
    accruedD3: usdtToD3(accruedUsdt, d3PriceUsdt),
    claimedD3: usdtToD3(claimedUsdt, d3PriceUsdt),
    dailyD3: usdtToD3(dailyUsdtYield, d3PriceUsdt),
    minWithdrawUsdt: MIN_YIELD_WITHDRAW_USDT,
    minWithdrawD3,
    canWithdraw: claimableD3 >= minWithdrawD3,
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
    unit: o.kind === 'sd3' ? 'UD3' : 'USDT',
    stakeKind: o.kind,
    unlockAt: o.unlockAt,
  }));
  const transfers: PartnerHistoryRecord[] = state.transfers.map((tr) => ({
    id: tr.id,
    kind: 'transfer',
    at: tr.at,
    amount: tr.amountUd3,
    unit: 'UD3',
    toAddress: tr.toAddress,
    toLabel: tr.toLabel,
  }));
  const withdrawals: PartnerHistoryRecord[] = (state.yieldWithdrawals ?? []).map((w) => ({
    id: w.id,
    kind: 'withdraw',
    at: w.at,
    amount: w.amountUsdt,
    unit: 'USDT',
    status: w.status,
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
    stakeOrders: [createStakeOrder(PARTNER_ENTRY_USDT, 'partner_join'), ...prev.stakeOrders],
    dtPreorderEligible: true,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ud3AvailableForState(state: PartnerState): number {
  const settled = round2((state.ud3SettlementHistory ?? []).reduce((s, r) => s + r.ud3Amount, 0));
  const transferred = round2((state.transfers ?? []).reduce((s, t) => s + t.amountUd3, 0));
  return Math.max(0, round2(settled - transferred - (state.ud3StakedFromRewards ?? 0)));
}

export function applyUd3Stake(prev: PartnerState, amount: number): PartnerState {
  const available = prev.isPartner
    ? round2(prev.ud3Balance)
    : ud3AvailableForState(prev);
  if (!prev.isPartner || !isValidUd3StakeAmount(amount, available)) return prev;
  const nextStaked = round2((prev.ud3StakedFromRewards ?? 0) + amount);
  return {
    ...prev,
    ud3StakedFromRewards: nextStaked,
    ud3Balance: Math.max(0, round2(prev.ud3Balance - amount)),
    stakeOrders: [createStakeOrder(amount, 'sd3'), ...prev.stakeOrders],
    dtPreorderEligible: true,
  };
}

export function applyUd3Transfer(
  prev: PartnerState,
  toAddress: string,
  amount: number,
  toLabel?: string,
): PartnerState {
  if (!prev.isPartner || amount <= 0 || amount > ud3AvailableForState(prev)) return prev;
  const transfers = [
    { id: `t-${Date.now()}`, toAddress, toLabel, amountUd3: amount, at: new Date().toISOString().slice(0, 10) },
    ...prev.transfers,
  ];
  const next = { ...prev, transfers };
  return {
    ...next,
    ud3Balance: ud3AvailableForState(next),
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
  ud3Balance: DEMO_UD3_LIFETIME,
  pendingUd3: 0,
  ud3StakedFromRewards: 0,
  /** Demo 总业绩 = 伞下个人质押合计（见 partnerTeamNodes）。 */
  teamPerformanceUsd: 5700,
  dailyNewPerformanceUsd: DEMO_PENDING_NEW_USD,
  totalNewPerformanceUsd: 18_600,
  lastSettlementDate: DEMO_UD3_LAST_SETTLED,
  dailyUd3Earned: 0,
  lifetimeUd3Earned: DEMO_UD3_LIFETIME,
  lifetimeUsdtYield: 296,
  transfers: [],
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
  /** Demo UD3：直推 60% + 下层网体级差（由 settleUd3DepositEvent 生成）。 */
  ud3SettlementHistory: DEMO_UD3_HISTORY,
  pendingUsdtYield: 0,
  pendingD3Yield: 0,
  yieldSettlementsByPosition: {},
};

/** Demo login baseline — performance/settlements only; partner/stake/transfer come from session mocks. */
export const DEMO_PARTNER_BASELINE: PartnerState = {
  ...DEMO_PARTNER_STATE,
  isPartner: false,
  joinedAt: null,
  stakeOrders: [],
  transfers: [],
  yieldWithdrawals: [],
  dtPreorderEligible: false,
  ud3Balance: DEMO_UD3_LIFETIME,
  pendingUd3: 0,
  ud3StakedFromRewards: 0,
  lifetimeUsdtYield: 0,
  pendingUsdtYield: 0,
  pendingD3Yield: 0,
};

export const GUEST_PARTNER_STATE: PartnerState = {
  isPartner: false,
  joinedAt: null,
  stakeOrders: [],
  ud3Balance: 0,
  pendingUd3: 0,
  ud3StakedFromRewards: 0,
  teamPerformanceUsd: 0,
  dailyNewPerformanceUsd: 0,
  totalNewPerformanceUsd: 0,
  lastSettlementDate: '—',
  dailyUd3Earned: 0,
  lifetimeUd3Earned: 0,
  lifetimeUsdtYield: 0,
  transfers: [],
  yieldWithdrawals: [],
  dtPreorderEligible: false,
  marketLeaderStatus: 'none',
  partnerSubsidyApplications: [],
  marketSubsidyApplications: [],
  marketSubsidyPerformanceUsed: 0,
  ud3SettlementHistory: [],
  pendingUsdtYield: 0,
  pendingD3Yield: 0,
  yieldSettlementsByPosition: {},
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
      ud3SettlementHistory: s.ud3SettlementHistory ?? [],
      yieldWithdrawals: s.yieldWithdrawals ?? [],
      pendingUsdtYield: s.pendingUsdtYield ?? 0,
      pendingD3Yield: s.pendingD3Yield ?? 0,
      yieldSettlementsByPosition: s.yieldSettlementsByPosition ?? {},
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
    partnerUd3Settlements?: PartnerUd3SettlementRow[];
    partnerUd3Allocations?: import('@/lib/d3fiTypes').PartnerUd3AllocationRow[];
    partnerUd3Transfers?: PartnerUd3TransferRow[];
    partnerYieldSettlements?: PartnerYieldSettlementRow[];
    pendingUd3Earned?: number;
  },
): PartnerState {
  const account = api.partnerAccount;
  const positions = api.partnerStakePositions ?? [];
  const hasServer = Boolean(
    account ||
      positions.length > 0 ||
      (api.partnerUd3Settlements?.length ?? 0) > 0 ||
      (api.partnerUd3Allocations?.length ?? 0) > 0,
  );
  if (!hasServer) return local;

  const stakeOrders: PartnerStakeOrder[] = positions.map(mapStakePositionToOrder);

  // Server positions are authoritative for a real account. We deliberately do NOT
  // merge local optimistic orders back in: they carry client-generated ids that
  // never match the server position id, so an optimistic order placed at stake
  // time was never reconciled and lingered as a duplicate "ghost" (one real
  // 1000U stake rendering as two). Trust the server list once it has any row.
  const mergedStakeOrders = stakeOrders.length > 0 ? stakeOrders : local.stakeOrders;

  const allocationHistory =
    (api.partnerUd3Allocations?.length ?? 0) > 0
      ? api.partnerUd3Allocations!.map((r) => ({
          id: r.id,
          settledAt: r.settlement_date,
          teamPerformanceUsd: 0,
          dailyNewPerformanceUsd: Number(r.event_amount_usd),
          tierRatePct: Number(r.tier_rate_pct),
          rewardSharePct: Number(r.reward_share_pct),
          role: r.role,
          sourceAddress: r.source_wallet,
          ud3Amount: Number(r.sd3_amount),
          // Two-phase (043): unsettled until the daily SGT-midnight run flips it.
          settlementStatus: ((r as { settled?: boolean }).settled === false
            ? 'pending'
            : 'settled') as 'settled' | 'pending',
        }))
      : null;

  const ud3SettlementHistory: Ud3SettlementRecord[] =
    allocationHistory ??
    (api.partnerUd3Settlements ?? []).map((r) => ({
      id: r.id,
      settledAt: r.settlement_date,
      teamPerformanceUsd: Number(r.team_performance_usd),
      dailyNewPerformanceUsd: Number(r.daily_new_performance_usd),
      tierRatePct: Number(r.tier_rate_pct),
      ud3Amount: Number(r.sd3_amount),
    }));

  const latestUd3 = ud3SettlementHistory[0];

  // Settled-only sum (未结算 rows excluded) — used only as a fallback for demo /
  // no-account state. Pending rewards must NOT inflate the settled (已结算) figure.
  const settledSum = round2(
    ud3SettlementHistory
      .filter((r) => r.settlementStatus !== 'pending')
      .reduce((s, r) => s + r.ud3Amount, 0),
  );
  const accountLifetime = account ? Number(account.lifetime_ud3_earned ?? account.lifetime_sd3_earned ?? 0) : 0;
  const accountBalance = account ? Number(account.ud3_balance ?? account.sd3_balance ?? 0) : 0;
  // A real account's settled lifetime is authoritative (including 0 before the first
  // SGT-midnight settlement). Only fall back to the settled-only history sum / local
  // value when there is no server account at all.
  const lifetimeUd3Earned = account
    ? accountLifetime
    : settledSum > 0
      ? settledSum
      : local.lifetimeUd3Earned;
  // When a real account exists its UD3 balance is authoritative — including 0 after
  // the holder has staked/transferred it all. Only fall back to lifetime/local when
  // there is no server account at all (avoids showing a phantom balance you can't spend).
  const ud3Balance = account
    ? accountBalance
    : lifetimeUd3Earned > 0
      ? lifetimeUd3Earned
      : local.ud3Balance;
  // Unsettled UD3 (未结算) — authoritative from the account; 0 when no server account.
  const pendingUd3 = account ? Number(account.pending_ud3 ?? 0) : local.pendingUd3;

  const serverTransfers: PartnerTransfer[] = (api.partnerUd3Transfers ?? []).map((r) => {
    // Column was renamed amount_sd3 -> amount_ud3; read the new name first. Reading
    // the stale name yielded Number(undefined) = NaN ("已转账 NaN UD3").
    const amt = Number(
      (r as { amount_ud3?: number | string }).amount_ud3 ?? r.amount_sd3 ?? 0,
    );
    return {
      id: r.id,
      toAddress: r.to_wallet,
      amountUd3: Number.isFinite(amt) ? amt : 0,
      at: r.created_at.slice(0, 10),
    };
  });

  const yieldSettlementsByPosition = mapYieldSettlementsByPosition(api.partnerYieldSettlements ?? []);

  return {
    ...local,
    isPartner: account?.is_partner ?? local.isPartner,
    joinedAt: account?.joined_at ?? local.joinedAt,
    ud3Balance,
    pendingUd3,
    lifetimeUd3Earned,
    lifetimeUsdtYield: account ? Number(account.lifetime_usdt_yield) : local.lifetimeUsdtYield,
    pendingUsdtYield: account ? Number(account.pending_usdt_yield) : local.pendingUsdtYield,
    pendingD3Yield: account ? Number(account.pending_d3_yield ?? 0) : local.pendingD3Yield,
    stakeOrders: mergedStakeOrders,
    transfers: serverTransfers.length > 0 ? serverTransfers : local.transfers,
    yieldWithdrawals: (api.partnerYieldWithdrawals ?? []).map((w) => ({
      id: w.id,
      amountUsdt: Number(w.amount_usdt ?? 0),
      at: (w.created_at ?? '').slice(0, 10),
      status: w.status,
    })),
    yieldSettlementsByPosition,
    ud3SettlementHistory,
    lastSettlementDate: latestUd3?.settledAt ?? local.lastSettlementDate,
    dailyUd3Earned: api.pendingUd3Earned ?? latestUd3?.ud3Amount ?? local.dailyUd3Earned,
    marketLeaderStatus:
      (account as { market_leader_status?: string } | null | undefined)?.market_leader_status as
        | MarketLeaderStatus
        | undefined ?? local.marketLeaderStatus,
  };
}

export function mapSubsidyTicketsToApplications(
  tickets: Array<{
    id: string;
    kind: string;
    amount_usd: number | null;
    purpose: string;
    status: string;
    application_type?: string | null;
    receipt_paths?: string[] | null;
    applied_at: string;
    reviewed_at?: string | null;
    paid_at?: string | null;
  }>,
): {
  partnerSubsidyApplications: SubsidyApplication[];
  marketSubsidyApplications: SubsidyApplication[];
} {
  const toApp = (t: (typeof tickets)[0]): SubsidyApplication => {
    let status: SubsidyStatus = 'pending';
    if (t.status === 'approved') status = 'approved';
    if (t.status === 'paid') status = 'paid';
    if (t.status === 'rejected') status = 'rejected';
    const applicationType =
      t.application_type === 'reimbursement' || t.application_type === 'reserve'
        ? t.application_type
        : undefined;
    return {
      id: t.id,
      amountUsd: Number(t.amount_usd ?? 0),
      purpose: t.purpose,
      appliedAt: t.applied_at.slice(0, 10),
      status,
      applicationType,
      receiptPaths: Array.isArray(t.receipt_paths) ? t.receipt_paths : [],
      reviewedAt: t.reviewed_at?.slice(0, 10),
      paidAt: t.paid_at?.slice(0, 10),
    };
  };
  return {
    partnerSubsidyApplications: tickets.filter((t) => t.kind === 'partner_subsidy').map(toApp),
    marketSubsidyApplications: tickets.filter((t) => t.kind === 'market_subsidy').map(toApp),
  };
}

export const UD3_QUOTA_RATE_PCT = 100;

export function getUd3Quotas(state: PartnerState) {
  const available = state.isPartner ? round2(state.ud3Balance) : ud3AvailableForState(state);
  return {
    available,
    staked: state.ud3StakedFromRewards,
    quotaRatePct: UD3_QUOTA_RATE_PCT,
    stakeQuota: available,
    transferQuota: available,
  };
}

export type { SubsidyQuotaView };

export function partnerSubsidyQuota(
  state: PartnerState,
  ratePct: number = PARTNER_SUBSIDY_RATE * 100,
  nodes: Record<string, PartnerTeamNode> = {},
  isMarketLeader?: (nodeId: string) => boolean,
): SubsidyQuotaView {
  if (Object.keys(nodes).length > 0) {
    return computePartnerSubsidyQuotaFromTree(state, ratePct, nodes, isMarketLeader ?? (() => false));
  }
  const marketDeduction = state.marketSubsidyPerformanceUsed;
  const dedupPartner = Math.max(0, state.totalNewPerformanceUsd);
  const calculable = Math.max(0, dedupPartner - marketDeduction);
  const rate = ratePct / 100;
  const cap = Math.round(calculable * rate * 100) / 100;
  const applied = state.partnerSubsidyApplications
    .filter((a) => a.status !== 'rejected')
    .reduce((s, a) => s + a.amountUsd, 0);
  return {
    ratePct,
    calculablePerformanceUsd: calculable,
    applicableCapUsd: cap,
    appliedUsd: Math.round(applied * 100) / 100,
    applicableRemainingUsd: Math.max(0, Math.round((cap - applied) * 100) / 100),
    dedupPerformanceUsd: dedupPartner,
    marketDeductionUsd: marketDeduction,
  };
}

export function marketSubsidyQuota(
  state: PartnerState,
  ratePct: number = MARKET_SUBSIDY_RATE * 100,
  nodes: Record<string, PartnerTeamNode> = {},
  isMarketLeader?: (nodeId: string) => boolean,
): SubsidyQuotaView {
  if (Object.keys(nodes).length > 0) {
    return computeMarketSubsidyQuotaFromTree(state, ratePct, nodes, isMarketLeader ?? (() => false));
  }
  const dedupLeader = Math.max(0, state.totalNewPerformanceUsd - state.marketSubsidyPerformanceUsed);
  const rate = ratePct / 100;
  const cap = Math.round(dedupLeader * rate * 100) / 100;
  const applied = state.marketSubsidyApplications
    .filter((a) => a.status !== 'rejected')
    .reduce((s, a) => s + a.amountUsd, 0);
  return {
    ratePct,
    calculablePerformanceUsd: dedupLeader,
    applicableCapUsd: cap,
    appliedUsd: Math.round(applied * 100) / 100,
    applicableRemainingUsd: Math.max(0, Math.round((cap - applied) * 100) / 100),
    dedupPerformanceUsd: dedupLeader,
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
  applicationType: SubsidyApplicationType = 'reserve',
  receiptPaths: string[] = [],
): PartnerState {
  if (!prev.isPartner || amountUsd <= 0) return prev;
  const { applicableRemainingUsd } = partnerSubsidyQuota(prev);
  if (amountUsd > applicableRemainingUsd) return prev;
  const app: SubsidyApplication = {
    id: `ps-${Date.now()}`,
    amountUsd,
    purpose: purpose.trim(),
    appliedAt: new Date().toISOString().slice(0, 10),
    status: 'pending',
    applicationType,
    receiptPaths,
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
  applicationType: SubsidyApplicationType = 'reserve',
  receiptPaths: string[] = [],
): PartnerState {
  if (!prev.isPartner || prev.marketLeaderStatus !== 'approved' || amountUsd <= 0) return prev;
  const { applicableRemainingUsd } = marketSubsidyQuota(prev);
  if (amountUsd > applicableRemainingUsd) return prev;
  const perfConsumed = Math.round((amountUsd / (MARKET_SUBSIDY_RATE)) * 100) / 100;
  const app: SubsidyApplication = {
    id: `ms-${Date.now()}`,
    amountUsd,
    purpose: purpose.trim(),
    appliedAt: new Date().toISOString().slice(0, 10),
    status: 'pending',
    applicationType,
    receiptPaths,
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

export function clearDemoPartnerLocalStorage(wallet: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(storageKey(wallet));
  localStorage.removeItem(`d3-partner-team-alias:${wallet.trim().toLowerCase()}`);
}
