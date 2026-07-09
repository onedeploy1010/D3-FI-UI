// ─── RUNE Protocol pure client-side calculators ──────────────────────────────
// Ported from the reference page's backend hooks (useCalculateRuneReturns) and
// the inline AMM / burn-stake simulation math.

import type { RuneNode } from "./runeData";

// ── Simulation constants ──────────────────────────────────────────────────────
export const TARGET_TLP_WAN = 3500;
export const LAUNCH_TLP_WAN = 280;
export const LAUNCH_LP_RUNE = 1e8;
export const DAILY_PROTOCOL_BURN = 0.002;
export const TOTAL_NODE_WEIGHT = 2880;
export const SIM_HORIZON_DAYS = 540;

// Sub-token price piecewise model (calibrated to doc PART V).
const SUB_LAUNCH_PRICE = 0.038;
const SUB_LAUNCH_TLP_USDT = 500 * 10_000;
const SUB_REGIME2_TLP_USDT = 1000 * 10_000;

export function subPriceAtTlp(tlpUsdt: number): number {
  if (tlpUsdt < SUB_LAUNCH_TLP_USDT) return 0;
  if (tlpUsdt < SUB_REGIME2_TLP_USDT) {
    const t = (tlpUsdt - SUB_LAUNCH_TLP_USDT) / (SUB_REGIME2_TLP_USDT - SUB_LAUNCH_TLP_USDT);
    return SUB_LAUNCH_PRICE + (2 - SUB_LAUNCH_PRICE) * t;
  }
  const tlpWan = tlpUsdt / 10_000;
  return 2 * Math.pow(tlpWan / 1000, 2);
}

export interface SimPoint {
  day: number;
  tlpUsdt: number;
  lpRune: number;
}

// Day-stepped constant-product AMM simulation.
export function buildFullSimulation(monthlyActiveUsers: number, avgPackageUsdt: number): SimPoint[] {
  const dailyInflowUsdt = (monthlyActiveUsers * avgPackageUsdt) / 30;
  const TARGET_TLP_USDT = TARGET_TLP_WAN * 10000;
  let tlpUsdt = LAUNCH_TLP_WAN * 10000;
  let lpRune = LAUNCH_LP_RUNE;
  const out: SimPoint[] = [];
  for (let d = 0; d <= SIM_HORIZON_DAYS; d++) {
    out.push({ day: d, tlpUsdt, lpRune });
    const remainingCap = Math.max(0, TARGET_TLP_USDT - tlpUsdt);
    const actualInflow = Math.min(dailyInflowUsdt, remainingCap);
    const swapOut = actualInflow > 0 && tlpUsdt > 0
      ? (actualInflow * lpRune) / (tlpUsdt + actualInflow)
      : 0;
    const burnOut = lpRune * DAILY_PROTOCOL_BURN;
    tlpUsdt += actualInflow;
    lpRune = Math.max(1, lpRune - swapOut - burnOut);
  }
  return out;
}

// ── Node ROI calculator (replaces backend useCalculateRuneReturns) ────────────
export interface RuneReturns {
  motherTokens: number;
  airdropTokens: number;
  motherTokenValue: number;
  airdropTokenValue: number;
  dailyUsdt: number;
  durationDays: number;
  totalUsdtIncome: number;
  subTokenAccumulated: number;
  subTokenValue: number;
  investment: number;
  totalAssets: number;
  totalAssetsLow: number;
  totalAssetsHigh: number;
  roi: number;
  roiMultiplier: number;
}

export function calcNodeReturns(
  node: RuneNode,
  durationDays: number,
  motherPrice: number,
  subPrice: number,
  seats = 1,
  subLaunchPrice = SUB_LAUNCH_PRICE,
): RuneReturns {
  const motherTokens = node.motherTokensPerSeat * seats;
  const airdropTokens = node.airdropPerSeat * seats;
  const motherTokenValue = motherTokens * motherPrice;
  const airdropTokenValue = airdropTokens * motherPrice;
  const dailyUsdt = node.dailyUsdt * seats;
  const totalUsdtIncome = dailyUsdt * durationDays; // 65% static portion
  // 35% dynamic portion auto-buys sub-token at launch price
  const dynamicPortion = (totalUsdtIncome / 0.65) * 0.35;
  const subTokenAccumulated = subLaunchPrice > 0 ? dynamicPortion / subLaunchPrice : 0;
  const subTokenValue = subTokenAccumulated * subPrice;
  const investment = node.investment * seats;
  const totalAssets = motherTokenValue + airdropTokenValue + totalUsdtIncome + subTokenValue;
  const months = durationDays / 30;
  const totalAssetsLow = investment * 0.15 * months;
  const totalAssetsHigh = investment * 0.35 * months;
  const roi = investment > 0 ? (totalAssets / investment) * 100 : 0;
  const roiMultiplier = investment > 0 ? totalAssets / investment : 0;
  return {
    motherTokens, airdropTokens, motherTokenValue, airdropTokenValue,
    dailyUsdt, durationDays, totalUsdtIncome, subTokenAccumulated, subTokenValue,
    investment, totalAssets, totalAssetsLow, totalAssetsHigh, roi, roiMultiplier,
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────────
export function fmt(n: number, d = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtPrice(p: number): string {
  return p < 0.01 ? p.toFixed(4) : p < 1 ? p.toFixed(3) : p.toFixed(2);
}
