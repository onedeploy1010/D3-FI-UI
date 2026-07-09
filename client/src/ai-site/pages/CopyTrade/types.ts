export interface TraderPosition {
  market: string;
  outcome: string;
  pricePerShare: number;
  cashPnl: number;
  currentValue: number;
  slug: string;
}

export interface Trader {
  rank: number | null;
  address: string;
  name: string;
  pseudonym?: string;
  profileImage?: string | null;
  badges: string[];
  tags: string[];
  followScore: number;
  edge: number;
  copyability: number;
  confidence: number;
  lagTolerance: number;
  openPnl: number;
  openPnlPct: number;
  currentValue: number;
  activePositions: number;
  profitFactor: number;
  drawdown: number;
  activity: number;
  activitySample: string;
  marketFit: number;
  concentration: number;
  type: string;
  recentTrades?: RecentTrade[];
  riskCategory?: "conservative" | "stable" | "aggressive";
  aiReason?: string;
  aiAnalysis?: string;
  topPositions?: TraderPosition[];
  polymarketUrl?: string;
}

export interface RecentTrade {
  id: number;
  market: string;
  side: string;
  size: number;
  price: number;
  pnl: number;
  closedAt: string;
}

export interface AIAgent {
  id: string;
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  winRate: number;
  avgRoi: number;
  maxDrawdown: number;
  signals: number;
  style: string;
  features: string[];
}

export interface Signal {
  id: number;
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence: number;
  source: string;
  reason: string;
  timestamp: string;
  status: "active" | "filled" | "expired";
  pnl: number | null;
}

// ── Smart Copy types ──────────────────────────────────────────────────────────

export interface WatchlistEntry {
  trader: Trader;
  addedAt: string;
  paused: boolean;
  allocation: number;
  riskCategory: "conservative" | "stable" | "aggressive";
}

export interface CopyStrategy {
  id: string;
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  tokenCost: number;
  category: string;
  owned: boolean;
  features: string[];
  expectedRoi: string;
  winRate: number;
}

// ── Quant Bot types ───────────────────────────────────────────────────────────

export type TrainingStatus = "idle" | "training" | "complete";

export interface TrainedAgent {
  id: string;
  name: string;
  strategy: string;
  model: string;
  score: number;
  winRate: number;
  backtestPnl: number;
  backtestPnlPct: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: number;
  riskLevel: "low" | "medium" | "high";
  isCandidate: boolean;
  trainedAt: string;
  deployedAt?: string;
  simStatus?: "running" | "done";
  simStartedAt?: string;
  simPnlPct?: number;
  simWinRate?: number;
}

export interface LiveBot {
  id: string;
  agentId: string;
  agentName: string;
  strategy: string;
  exchange: string;
  allocation: number;
  maxDrawdown: number;
  autoConfig: boolean;
  status: "running" | "paused" | "stopped";
  pnl: number;
  pnlPct: number;
  trades: number;
  startedAt: string;
}
