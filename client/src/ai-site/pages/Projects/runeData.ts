// ─── RUNE Protocol static overview data ──────────────────────────────────────
// Embedded editorial constants (node tiers, price stages, token info, fundraising)
// ported from the reference page's backend `useGetRuneOverview` payload.

export type RuneNodeLevel = "initial" | "mid" | "advanced" | "super" | "founder";

export interface RuneNode {
  level: RuneNodeLevel;
  nameCn: string;
  nameEn: string;
  investment: number;
  privatePrice: number;
  motherTokensPerSeat: number;
  airdropPerSeat: number;
  dailyUsdt: number;
  seats: number;
  /** per-seat weight (total weight across all seats = 2880) */
  weight: number;
}

export interface RunePriceStage {
  labelCn: string;
  motherPrice: number;
  subPrice: number;
  multiplier: number;
  trigger: string;
}

export interface RuneTokenInfo {
  symbol: string;
  launchPrice: number;
  totalSupply: number;
  dailyBurnRate: number;
  targetPriceLow: number;
  targetPriceHigh: number;
}

export interface RuneFundraising {
  tlpPool: number;
  operations: number;
  treasury: number;
  subTokenLP: number;
}

export interface RuneOverview {
  motherToken: RuneTokenInfo;
  subToken: RuneTokenInfo;
  nodes: RuneNode[];
  priceStages: RunePriceStage[];
  fundraising: RuneFundraising;
}

// Fallback English labels for the 6 RUNE price stages.
export const STAGE_EN_LABELS = [
  "① Launch",
  "② Batch 2",
  "③ Batch 3",
  "④ Batch 4",
  "⑤ Target (Low)",
  "⑥ Target (High)",
];

export const RUNE_OVERVIEW: RuneOverview = {
  motherToken: {
    symbol: "RUNE",
    launchPrice: 0.028,
    totalSupply: 1e8,
    dailyBurnRate: 0.002,
    targetPriceLow: 3.5,
    targetPriceHigh: 4.56,
  },
  subToken: {
    symbol: "FIRE",
    launchPrice: 0.038,
    totalSupply: 13_100_000,
    dailyBurnRate: 0.001,
    targetPriceLow: 50,
    targetPriceHigh: 200,
  },
  nodes: [
    { level: "initial",  nameCn: "初级节点", nameEn: "Initial",  investment: 1000,  privatePrice: 0.020, motherTokensPerSeat: 50_000,    airdropPerSeat: 12_500,  dailyUsdt: 6,   seats: 1000, weight: 0.4 },
    { level: "mid",      nameCn: "中级节点", nameEn: "Mid",      investment: 3600,  privatePrice: 0.022, motherTokensPerSeat: 163_636,   airdropPerSeat: 40_000,  dailyUsdt: 22,  seats: 600,  weight: 0.8 },
    { level: "advanced", nameCn: "高级节点", nameEn: "Advanced", investment: 10000, privatePrice: 0.024, motherTokensPerSeat: 416_666,   airdropPerSeat: 104_000, dailyUsdt: 62,  seats: 500,  weight: 1.2 },
    { level: "super",    nameCn: "超级节点", nameEn: "Super",    investment: 30000, privatePrice: 0.026, motherTokensPerSeat: 1_153_846, airdropPerSeat: 300_000, dailyUsdt: 190, seats: 220,  weight: 3.0 },
    { level: "founder",  nameCn: "创世节点", nameEn: "Founder",  investment: 50000, privatePrice: 0.028, motherTokensPerSeat: 1_785_714, airdropPerSeat: 480_000, dailyUsdt: 320, seats: 100,  weight: 7.4 },
  ],
  priceStages: [
    { labelCn: "① 启动上线", motherPrice: 0.028, subPrice: 0.038, multiplier: 1,   trigger: "TVL 800万 · 启动上线" },
    { labelCn: "② TLP 700万", motherPrice: 0.28,  subPrice: 0.5,   multiplier: 10,  trigger: "TLP 700万 触发" },
    { labelCn: "③ TLP 1750万", motherPrice: 1.12,  subPrice: 2,     multiplier: 40,  trigger: "TLP 1750万 触发" },
    { labelCn: "④ TLP 3500万", motherPrice: 2.24,  subPrice: 18,    multiplier: 80,  trigger: "TLP 3500万 触发（上限）" },
    { labelCn: "⑤ 24月目标(低)", motherPrice: 3.5,   subPrice: 50,    multiplier: 125, trigger: "24 个月目标（保守）" },
    { labelCn: "⑥ 24月目标(高)", motherPrice: 4.56,  subPrice: 200,   multiplier: 163, trigger: "24 个月目标（乐观）" },
  ],
  fundraising: {
    tlpPool: 2_800_000,
    operations: 1_500_000,
    treasury: 2_200_000,
    subTokenLP: 1_500_000,
  },
};

// ─── Color palette (light-theme adapted) ──────────────────────────────────────
export const C = {
  pioneer:  "hsl(217,80%,52%)",
  builder:  "hsl(150,60%,38%)",
  guardian: "hsl(38,85%,45%)",
  strategic:"hsl(280,55%,52%)",
  mother:   "hsl(217,75%,52%)",
  sub:      "hsl(28,85%,52%)",
  usdt:     "hsl(150,55%,40%)",
  grid:     "hsl(330,18%,86%)",
  muted:    "hsl(321,10%,48%)",
};

// per-node accent colors keyed by level
export const NODE_COLORS: Record<RuneNodeLevel, string> = {
  initial:  "hsl(217,80%,52%)",
  mid:      "hsl(150,60%,38%)",
  advanced: "hsl(38,85%,45%)",
  super:    "hsl(280,55%,52%)",
  founder:  "hsl(334,60%,45%)",
};

export const PIE_COLORS = [
  "hsl(217,75%,52%)",
  "hsl(150,55%,40%)",
  "hsl(38,85%,48%)",
  "hsl(280,55%,52%)",
];
