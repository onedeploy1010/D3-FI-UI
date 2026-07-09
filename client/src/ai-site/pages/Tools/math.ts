import { useMutation } from "@tanstack/react-query";

// ─── General DeFi ─────────────────────────────────────────────────────────────

export type ApyCalculatorInputCompoundFrequency = "daily" | "weekly" | "monthly" | "yearly";

const PERIODS_PER_YEAR: Record<ApyCalculatorInputCompoundFrequency, number> = {
  daily: 365,
  weekly: 52,
  monthly: 12,
  yearly: 1,
};

export interface ApyInput {
  principal: number;
  apy: number;
  durationDays: number;
  compoundFrequency: ApyCalculatorInputCompoundFrequency;
}

export interface ApyResult {
  principal: number;
  finalAmount: number;
  totalReturn: number;
  returnPercent: number;
  dailyBreakdown: { day: number; amount: number }[];
}

export function calculateApy({ principal, apy, durationDays, compoundFrequency }: ApyInput): ApyResult {
  const ppy = PERIODS_PER_YEAR[compoundFrequency];
  const ratePerPeriod = apy / 100 / ppy;
  const amountAtDay = (day: number) => principal * Math.pow(1 + ratePerPeriod, ppy * (day / 365));

  const step = Math.max(1, Math.ceil(durationDays / 120));
  const dailyBreakdown: { day: number; amount: number }[] = [];
  for (let d = 0; d <= durationDays; d += step) {
    dailyBreakdown.push({ day: d, amount: amountAtDay(d) });
  }
  if (dailyBreakdown[dailyBreakdown.length - 1]?.day !== durationDays) {
    dailyBreakdown.push({ day: durationDays, amount: amountAtDay(durationDays) });
  }

  const finalAmount = amountAtDay(durationDays);
  const totalReturn = finalAmount - principal;
  const returnPercent = principal > 0 ? (totalReturn / principal) * 100 : 0;
  return { principal, finalAmount, totalReturn, returnPercent, dailyBreakdown };
}

export interface InvestmentInput {
  initialInvestment: number;
  monthlyContribution: number;
  expectedApy: number;
  years: number;
}

export interface InvestmentResult {
  finalValue: number;
  totalContributed: number;
  totalReturn: number;
  returnPercent: number;
  yearlyBreakdown: { year: number; value: number; contributed: number }[];
}

export function simulateInvestment({ initialInvestment, monthlyContribution, expectedApy, years }: InvestmentInput): InvestmentResult {
  const monthlyRate = expectedApy / 100 / 12;
  let value = initialInvestment;
  const yearlyBreakdown: { year: number; value: number; contributed: number }[] = [
    { year: 0, value: initialInvestment, contributed: initialInvestment },
  ];
  for (let m = 1; m <= years * 12; m++) {
    value = value * (1 + monthlyRate) + monthlyContribution;
    if (m % 12 === 0) {
      yearlyBreakdown.push({
        year: m / 12,
        value,
        contributed: initialInvestment + monthlyContribution * m,
      });
    }
  }
  const totalContributed = initialInvestment + monthlyContribution * years * 12;
  const finalValue = value;
  const totalReturn = finalValue - totalContributed;
  const returnPercent = totalContributed > 0 ? (totalReturn / totalContributed) * 100 : 0;
  return { finalValue, totalContributed, totalReturn, returnPercent, yearlyBreakdown };
}

export interface IlInput {
  initialPrice: number;
  currentPrice: number;
  liquidityValue: number;
}

export interface IlResult {
  ilPercent: number;
  ilUsd: number;
  hodlValue: number;
  lpValue: number;
}

export function calculateImpermanentLoss({ initialPrice, currentPrice, liquidityValue }: IlInput): IlResult {
  const ratio = initialPrice > 0 ? currentPrice / initialPrice : 1;
  const hodlValue = liquidityValue * (1 + ratio) / 2;
  const lpValue = liquidityValue * Math.sqrt(ratio);
  const ilFraction = hodlValue > 0 ? lpValue / hodlValue - 1 : 0;
  const ilPercent = Math.abs(ilFraction) * 100;
  const ilUsd = hodlValue - lpValue;
  return { ilPercent, ilUsd, hodlValue, lpValue };
}

// ─── Staking Suite ────────────────────────────────────────────────────────────

export type StakingReleaseMode = "gold_standard" | "coin_standard";

export interface StakingReleaseResult {
  releaseSchedule: { day: number; cumulativeMs: number }[];
  dailyMs: number;
  totalMs: number;
  totalUsdcValue: number;
}

export function projectStakingRelease(
  investment: number,
  tokenPrice: number,
  multiplier: number,
  days: number,
  mode: StakingReleaseMode,
): StakingReleaseResult {
  const safePrice = tokenPrice > 0 ? tokenPrice : 0.0001;
  let totalMs: number;
  let totalUsdcValue: number;
  if (mode === "gold_standard") {
    totalUsdcValue = investment * multiplier;
    totalMs = totalUsdcValue / safePrice;
  } else {
    const bought = investment / safePrice;
    totalMs = bought * multiplier;
    totalUsdcValue = totalMs * safePrice;
  }
  const dailyMs = days > 0 ? totalMs / days : 0;
  const releaseSchedule = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    cumulativeMs: dailyMs * (i + 1),
  }));
  return { releaseSchedule, dailyMs, totalMs, totalUsdcValue };
}

// ─── AAM Pool Simulator ───────────────────────────────────────────────────────

export interface AAMPoolPoint {
  day: number;
  price: number;
  tvl: number;
  cumulativeBuyback: number;
}

export function simulateAAMPoolStandalone(
  initUsdc: number,
  initMs: number,
  days: number,
  dailyDeposit: number,
  lpRatio: number,
  buybackRatio: number,
  sellPressure: number,
): AAMPoolPoint[] {
  let ru = initUsdc;
  let rt = initMs > 0 ? initMs : 1;
  let cumulativeBuyback = 0;
  const out: AAMPoolPoint[] = [];
  const totalDays = Math.max(1, Math.round(days));
  for (let d = 1; d <= totalDays; d++) {
    // Add liquidity at current price (keeps price constant)
    const lpUsdc = dailyDeposit * (lpRatio / 100);
    if (lpUsdc > 0) {
      const price0 = ru / rt;
      ru += lpUsdc;
      rt += lpUsdc / price0;
    }
    // Buyback: swap USDC into the pool for tokens (pushes price up)
    const bb = dailyDeposit * (buybackRatio / 100);
    if (bb > 0) {
      const k = ru * rt;
      ru += bb;
      rt = k / ru;
      cumulativeBuyback += bb;
    }
    // Sell pressure: swap tokens into the pool for USDC (pushes price down)
    if (sellPressure > 0) {
      const k = ru * rt;
      rt += sellPressure;
      ru = k / rt;
    }
    const price = ru / rt;
    const tvl = ru * 2;
    out.push({ day: d, price, tvl, cumulativeBuyback });
  }
  return out;
}

// ─── CLMM Analyzer ────────────────────────────────────────────────────────────

export interface CLMMResult {
  capitalEfficiency: number;
  feesEarned30d: number;
  feesEarned90d: number;
  breakEvenDays: number;
  ilAtLower: number;
  ilAtUpper: number;
  priceTrajectory: { day: number; price: number; cumulativeFees: number }[];
}

function ilPercentForRatio(ratio: number): number {
  const lp = Math.sqrt(ratio);
  const hodl = (1 + ratio) / 2;
  return Math.abs(lp / hodl - 1) * 100;
}

export function analyzeCLMMPosition(
  depositX: number,
  depositY: number,
  tokenPrice: number,
  rangeWidth: number,
  feeTier: number,
  dailyVolume: number,
  totalPoolLiq: number,
  days: number,
  vol: number,
  drift: number,
): CLMMResult {
  const p = rangeWidth / 100;
  const priceLower = tokenPrice * (1 - p);
  const priceUpper = tokenPrice * (1 + p);
  const depositValue = depositX * tokenPrice + depositY;

  // Capital efficiency vs a full-range (V2) position
  const boundRatio = priceUpper > 0 ? priceLower / priceUpper : 0;
  const capitalEfficiency = Math.min(50, 1 / Math.max(0.02, 1 - Math.pow(boundRatio, 0.25)));

  const effectiveLiq = depositValue * capitalEfficiency;
  const share = totalPoolLiq > 0 ? effectiveLiq / (totalPoolLiq + effectiveLiq) : 0;
  const dailyFeesInRange = dailyVolume * feeTier * share;

  // Deterministic price path (drift + oscillating volatility) — stable across renders
  const trajDays = Math.max(1, Math.round(days));
  const priceTrajectory: { day: number; price: number; cumulativeFees: number }[] = [];
  let cumulativeFees = 0;
  for (let d = 1; d <= trajDays; d++) {
    const trend = Math.pow(1 + drift / 100, d);
    const wave = 1 + (vol / 100) * Math.sin(d * 0.9);
    const price = tokenPrice * trend * wave;
    const inRange = price >= priceLower && price <= priceUpper;
    if (inRange) cumulativeFees += dailyFeesInRange;
    priceTrajectory.push({ day: d, price, cumulativeFees });
  }

  const ilAtLower = ilPercentForRatio(1 - p);
  const ilAtUpper = ilPercentForRatio(1 + p);

  const feesEarned30d = dailyFeesInRange * Math.min(30, trajDays);
  const feesEarned90d = dailyFeesInRange * Math.min(90, trajDays);

  const ilUsdAtEdge = depositValue * (ilAtUpper / 100);
  const breakEvenDays = dailyFeesInRange > 0 ? Math.ceil(ilUsdAtEdge / dailyFeesInRange) : 1000;

  return {
    capitalEfficiency,
    feesEarned30d,
    feesEarned90d,
    breakEvenDays,
    ilAtLower,
    ilAtUpper,
    priceTrajectory,
  };
}

// ─── Trading Profit ───────────────────────────────────────────────────────────

export interface TradingProfitResult {
  grossProfit: number;
  tradingFee: number;
  userProfit: number;
  platformProfit: number;
  brokerProfit: number;
  roi: number;
  lpContributionUsdc: number;
  buybackAmount: number;
  reserveAmount: number;
}

export function calculateTradingProfitBreakdown(
  capital: number,
  volumePct: number,
  profitRate: number,
  feeRate: number,
  profitShare: number,
  lpRatio: number,
  buybackRatio: number,
  reserveRatio: number,
): TradingProfitResult {
  const dailyVolume = capital * (volumePct / 100);
  const grossProfit = dailyVolume * (profitRate / 100);
  const tradingFee = grossProfit * (feeRate / 100);
  const distributable = grossProfit - tradingFee;
  const userProfit = distributable * (profitShare / 100);
  const platformPool = distributable - userProfit;
  const brokerProfit = platformPool * 0.35;
  const platformProfit = platformPool - brokerProfit;
  const roi = capital > 0 ? (userProfit / capital) * 100 : 0;

  const lpContributionUsdc = tradingFee * (lpRatio / 100);
  const buybackAmount = tradingFee * (buybackRatio / 100);
  const reserveAmount = tradingFee * (reserveRatio / 100);

  return {
    grossProfit,
    tradingFee,
    userProfit,
    platformProfit,
    brokerProfit,
    roi,
    lpContributionUsdc,
    buybackAmount,
    reserveAmount,
  };
}

// ─── Broker Earnings ──────────────────────────────────────────────────────────

export interface BrokerSystem {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  levels: string[];
  maxLayersPerLevel: Record<string, number>;
  layerRates: number[];
  dividendRates: Record<string, number>;
}

function decayRates(count: number, start: number, decay: number): number[] {
  return Array.from({ length: 20 }, (_, i) => (i < count ? Number((start * Math.pow(decay, i)).toFixed(2)) : 0));
}

export const BROKER_SYSTEMS: BrokerSystem[] = [
  {
    id: "afx_v",
    name: "AFX V-System",
    nameZh: "AFX V 制度",
    description: "Six V-tiers with progressively deeper layer access.",
    descriptionZh: "六级 V 等级，层级访问逐级加深，分红级差递增。",
    levels: ["V1", "V2", "V3", "V4", "V5", "V6"],
    maxLayersPerLevel: { V1: 3, V2: 6, V3: 9, V4: 12, V5: 16, V6: 20 },
    layerRates: decayRates(20, 12, 0.82),
    dividendRates: { V1: 5, V2: 10, V3: 16, V4: 22, V5: 30, V6: 40 },
  },
  {
    id: "star",
    name: "Star System",
    nameZh: "星级制度",
    description: "Five star ranks balancing layer income and dividends.",
    descriptionZh: "五个星级等级，平衡层级收益与分红池分配。",
    levels: ["S1", "S2", "S3", "S4", "S5"],
    maxLayersPerLevel: { S1: 4, S2: 8, S3: 12, S4: 16, S5: 20 },
    layerRates: decayRates(20, 10, 0.85),
    dividendRates: { S1: 6, S2: 12, S3: 20, S4: 28, S5: 38 },
  },
  {
    id: "classic",
    name: "Classic Referral",
    nameZh: "经典推荐",
    description: "Simple four-level referral with shallow layers.",
    descriptionZh: "简单四级推荐制度，层级较浅，适合轻量推广。",
    levels: ["L1", "L2", "L3", "L4"],
    maxLayersPerLevel: { L1: 2, L2: 5, L3: 8, L4: 12 },
    layerRates: decayRates(12, 15, 0.78),
    dividendRates: { L1: 4, L2: 9, L3: 15, L4: 24 },
  },
  {
    id: "dual",
    name: "Dual-Track",
    nameZh: "双轨制度",
    description: "Balanced dual-leg growth with wide layer coverage.",
    descriptionZh: "双轨平衡增长，层级覆盖广，级差分红丰厚。",
    levels: ["D1", "D2", "D3", "D4", "D5"],
    maxLayersPerLevel: { D1: 5, D2: 9, D3: 13, D4: 17, D5: 20 },
    layerRates: decayRates(20, 9, 0.88),
    dividendRates: { D1: 8, D2: 14, D3: 21, D4: 29, D5: 36 },
  },
  {
    id: "matrix",
    name: "Matrix Plan",
    nameZh: "矩阵制度",
    description: "Forced-matrix structure with capped deep layers.",
    descriptionZh: "强制矩阵结构，深层封顶，收益稳定可预测。",
    levels: ["M1", "M2", "M3", "M4"],
    maxLayersPerLevel: { M1: 3, M2: 7, M3: 11, M4: 15 },
    layerRates: decayRates(15, 11, 0.83),
    dividendRates: { M1: 5, M2: 11, M3: 18, M4: 27 },
  },
];

export interface BrokerLayerBreakdown {
  layers: { layer: number; rate: number; earningsPerDay: number; accessible: boolean }[];
  totalAccessible: number;
  totalLocked: number;
}

export function calculateBrokerLayerBreakdown(
  msPerLayer: number,
  level: string,
  system: BrokerSystem,
): BrokerLayerBreakdown {
  const maxLayer = system.maxLayersPerLevel[level] ?? 0;
  const layers = Array.from({ length: 20 }, (_, i) => {
    const rate = system.layerRates[i] ?? 0;
    const earningsPerDay = msPerLayer * (rate / 100);
    return { layer: i + 1, rate, earningsPerDay, accessible: i < maxLayer };
  });
  const totalAccessible = layers.filter(l => l.accessible).reduce((s, l) => s + l.earningsPerDay, 0);
  const totalLocked = layers.filter(l => !l.accessible).reduce((s, l) => s + l.earningsPerDay, 0);
  return { layers, totalAccessible, totalLocked };
}

export interface BrokerDividendResult {
  earnings: number;
  userShare: number;
  brokerDividendPool: number;
  brokerRate: number;
  differentialRate: number;
  subRate: number;
}

export function calculateBrokerDividendEarnings(
  grossProfit: number,
  feeRate: number,
  profitShare: number,
  level: string,
  subLevel: string | null,
  system: BrokerSystem,
): BrokerDividendResult {
  const fee = grossProfit * (feeRate / 100);
  const distributable = grossProfit - fee;
  const userShare = distributable * (profitShare / 100);
  const brokerDividendPool = distributable - userShare;
  const brokerRate = system.dividendRates[level] ?? 0;
  const subRate = subLevel ? (system.dividendRates[subLevel] ?? 0) : 0;
  const differentialRate = Math.max(0, brokerRate - subRate);
  const earnings = brokerDividendPool * (differentialRate / 100);
  return { earnings, userShare, brokerDividendPool, brokerRate, differentialRate, subRate };
}

// ─── Mutation hooks (mimic the original backend-query interface) ───────────────

export function useCalculateApy() {
  return useMutation({ mutationFn: async ({ data }: { data: ApyInput }) => calculateApy(data) });
}

export function useSimulateInvestment() {
  return useMutation({ mutationFn: async ({ data }: { data: InvestmentInput }) => simulateInvestment(data) });
}

export function useCalculateImpermanentLoss() {
  return useMutation({ mutationFn: async ({ data }: { data: IlInput }) => calculateImpermanentLoss(data) });
}
