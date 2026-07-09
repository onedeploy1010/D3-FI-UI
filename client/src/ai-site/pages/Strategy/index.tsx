import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useCreateStrategy, useGetStrategyCatalog, useGetUserStrategies } from "@ai/api-client-react";
import type { CreateStrategyBodyRiskLevel } from "@ai/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@ai/hooks/use-toast";
import { cn } from "@ai/lib/utils";
import {
  Search, Lock, Unlock, Coins, Brain, Flame, Shield, BarChart2,
  TrendingUp, Star, CheckCircle, Plus, Zap, Target, Users,
  BookOpen, FlaskConical, ArrowRight, Activity, Trophy,
  Sparkles, Info, ChevronDown, ChevronUp, SortDesc, ArrowUpDown,
  Bot, Cpu, LayoutGrid,
} from "lucide-react";

// ── Strategy catalog ───────────────────────────────────────────────────────────
const CATEGORIES = ["All", "Momentum", "Value", "Event", "AI", "Hedge", "Arbitrage", "Quant"] as const;
type Category = typeof CATEGORIES[number];
type SortKey = "roi" | "winRate" | "subscribers" | "drawdown";

interface StrategyDef {
  id: string;
  name: string;
  author: string;
  description: string;
  longDesc: string;
  category: Exclude<Category, "All">;
  riskLevel: "low" | "medium" | "high";
  tokenCost: number;
  winRate: number;
  roi90d: number;
  maxDrawdown: number;
  subscribers: number;
  isAI: boolean;
  tags: string[];
  features: string[];
}

const STRATEGY_CATALOG: StrategyDef[] = [
  {
    id: "poly-momentum",
    name: "Polymarket Momentum",
    author: "D3-AI",
    description: "Follows price momentum on prediction markets. Enters on breakouts, exits on reversal signals with dynamic trailing stops.",
    longDesc: "Uses a multi-timeframe momentum system to identify when prediction market prices are trending strongly. Entry signals are confirmed by volume, and exits are managed with dynamic trailing stops that adapt to market volatility.",
    category: "Momentum",
    riskLevel: "medium",
    tokenCost: 0,
    winRate: 64.2,
    roi90d: 28.5,
    maxDrawdown: 14.2,
    subscribers: 1247,
    isAI: true,
    tags: ["momentum", "polymarket", "auto-exit", "trending"],
    features: ["Multi-timeframe confirmation", "Dynamic trailing stop", "Volume filter", "Auto position sizing"],
  },
  {
    id: "deep-value",
    name: "Deep Value Arb",
    author: "D3-AI",
    description: "Identifies underpriced probabilities on Polymarket vs real-world fundamentals. Slow, high-conviction bets.",
    longDesc: "Compares current Polymarket prices against a proprietary fundamental scoring model. When a significant gap exists between the market price and the model's estimate, it initiates a position sized by conviction level.",
    category: "Value",
    riskLevel: "low",
    tokenCost: 0,
    winRate: 71.8,
    roi90d: 19.2,
    maxDrawdown: 8.1,
    subscribers: 2103,
    isAI: true,
    tags: ["value", "fundamentals", "low-risk", "high-conviction"],
    features: ["Probability gap detection", "Fundamental scoring model", "Conviction sizing", "Low frequency"],
  },
  {
    id: "event-alpha",
    name: "Event Alpha",
    author: "D3-AI",
    description: "Pre-positions around major events: elections, Fed meetings, crypto upgrades. High conviction, short duration.",
    longDesc: "Monitors an event calendar across geopolitical, economic, and crypto categories. Builds positions ahead of high-impact events where market prices are mispriced relative to historical base rates.",
    category: "Event",
    riskLevel: "high",
    tokenCost: 80,
    winRate: 57.3,
    roi90d: 62.1,
    maxDrawdown: 28.4,
    subscribers: 891,
    isAI: true,
    tags: ["events", "elections", "fed", "crypto-catalyst"],
    features: ["Event calendar integration", "Pre-event entry window", "Fast exit triggers", "Historical base rates"],
  },
  {
    id: "sentiment-ai",
    name: "Sentiment AI Pro",
    author: "D3-AI",
    description: "Uses NLP on news, social media, and on-chain data to predict market shifts. Follows traders who lead sentiment.",
    longDesc: "Real-time NLP processing of thousands of data sources per minute. When sentiment diverges strongly from current market prices, the AI identifies which Polymarket traders are already positioned correctly and amplifies their exposure.",
    category: "AI",
    riskLevel: "high",
    tokenCost: 200,
    winRate: 52.8,
    roi90d: 89.4,
    maxDrawdown: 31.2,
    subscribers: 643,
    isAI: true,
    tags: ["nlp", "sentiment", "social", "on-chain", "ai"],
    features: ["Real-time NLP", "Social sentiment scoring", "On-chain signal fusion", "Trader correlation"],
  },
  {
    id: "cross-market-hedge",
    name: "Cross-Market Hedge",
    author: "D3-AI",
    description: "Hedges prediction market positions against correlated crypto/equity moves. Reduces drawdown by 40%.",
    longDesc: "Builds a delta-neutral book by pairing Polymarket positions with hedges on correlated assets. Uses correlation matrices updated daily to maintain near-zero net exposure while capturing the pure prediction alpha.",
    category: "Hedge",
    riskLevel: "low",
    tokenCost: 120,
    winRate: 68.9,
    roi90d: 15.8,
    maxDrawdown: 6.3,
    subscribers: 412,
    isAI: true,
    tags: ["hedge", "delta-neutral", "risk-reduction", "correlation"],
    features: ["Delta-neutral positioning", "Dynamic correlation matrix", "Daily rebalancing", "Cross-asset hedging"],
  },
  {
    id: "arbitrage-classic",
    name: "Probability Arbitrage",
    author: "D3-AI",
    description: "Exploits temporary price dislocations between related Polymarket events. Pure math-driven arbitrage.",
    longDesc: "When two related markets on Polymarket have probabilities that sum to more or less than 100%, this strategy automatically takes positions to capture the arbitrage spread as prices converge.",
    category: "Arbitrage",
    riskLevel: "low",
    tokenCost: 150,
    winRate: 82.4,
    roi90d: 24.6,
    maxDrawdown: 4.2,
    subscribers: 788,
    isAI: true,
    tags: ["arbitrage", "math", "probability", "low-risk"],
    features: ["Auto dislocation detection", "Instant execution", "Probability constraint enforcement", "Market-making"],
  },
  {
    id: "quant-grid",
    name: "Quantitative Grid Bot",
    author: "D3-AI",
    description: "Places a grid of orders around current price levels. Profits from oscillation in ranging prediction markets.",
    longDesc: "Deploys a dynamic grid of limit orders on both sides of current market prices. Profits on each oscillation and automatically widens/tightens the grid based on realized volatility.",
    category: "Quant",
    riskLevel: "medium",
    tokenCost: 60,
    winRate: 74.1,
    roi90d: 32.7,
    maxDrawdown: 11.8,
    subscribers: 1089,
    isAI: true,
    tags: ["grid", "quant", "oscillation", "ranging"],
    features: ["Dynamic grid spacing", "Vol-adjusted sizing", "Auto harvest", "Rebalancing on trend"],
  },
  {
    id: "political-predictor",
    name: "Political Alpha",
    author: "QuantElite",
    description: "Specialized in political prediction markets. Integrates polling data, historical patterns, and news flow.",
    longDesc: "Combines polling aggregators, historical election models, and real-time news sentiment to predict political outcomes better than current market prices.",
    category: "Event",
    riskLevel: "medium",
    tokenCost: 90,
    winRate: 61.5,
    roi90d: 41.3,
    maxDrawdown: 19.7,
    subscribers: 556,
    isAI: false,
    tags: ["politics", "elections", "polling", "news"],
    features: ["Polling aggregation", "Historical pattern matching", "News sentiment", "Multi-market view"],
  },
  {
    id: "btc-macro",
    name: "BTC Macro Mirror",
    author: "CryptoSage",
    description: "Mirrors macro Bitcoin signals onto Polymarket crypto prediction markets. Captures BTC volatility as predictions.",
    longDesc: "Translates technical and on-chain Bitcoin analysis into Polymarket position sizing. When BTC shows strong breakout signals, this strategy pre-positions in directional Polymarket crypto markets.",
    category: "Momentum",
    riskLevel: "high",
    tokenCost: 40,
    winRate: 58.9,
    roi90d: 73.2,
    maxDrawdown: 26.5,
    subscribers: 723,
    isAI: false,
    tags: ["btc", "crypto", "macro", "on-chain"],
    features: ["BTC on-chain scoring", "Momentum confirmation", "Directional sizing", "Fast execution"],
  },
  {
    id: "sport-model",
    name: "Sports Quantitative",
    author: "D3-AI",
    description: "Uses ELO ratings, injury reports, and historical matchup data to find edges in sports prediction markets.",
    longDesc: "A purpose-built sports prediction model using ELO ratings, recent form, injury reports, and historical head-to-head records. Targets markets where Polymarket prices diverge significantly from the model's win probabilities.",
    category: "Quant",
    riskLevel: "medium",
    tokenCost: 70,
    winRate: 66.3,
    roi90d: 38.9,
    maxDrawdown: 13.5,
    subscribers: 892,
    isAI: true,
    tags: ["sports", "elo", "injuries", "model"],
    features: ["ELO ratings system", "Injury report parsing", "Form analysis", "Historical H2H"],
  },
  {
    id: "multi-strat",
    name: "Multi-Strategy Blend",
    author: "D3-AI",
    description: "Combines momentum, value, and event strategies with portfolio optimization for a balanced return profile.",
    longDesc: "An ensemble strategy that dynamically allocates between momentum, value, and event-driven approaches based on current market regime. Uses mean-variance optimization to maintain a Sharpe > 2.0 target.",
    category: "AI",
    riskLevel: "medium",
    tokenCost: 180,
    winRate: 69.7,
    roi90d: 45.8,
    maxDrawdown: 12.4,
    subscribers: 1567,
    isAI: true,
    tags: ["ensemble", "portfolio", "balanced", "sharpe"],
    features: ["Regime detection", "Dynamic allocation", "Mean-variance optimization", "Drawdown circuit breaker"],
  },
  {
    id: "vol-target",
    name: "Volatility Targeting",
    author: "D3-AI",
    description: "Scales position sizes to target a constant portfolio volatility of 12% annualized. All-weather design.",
    longDesc: "Continuously adjusts position sizing across all Polymarket positions to maintain a target portfolio volatility of 12% annualized. Designed to work in all market regimes while maximizing risk-adjusted returns.",
    category: "Hedge",
    riskLevel: "low",
    tokenCost: 100,
    winRate: 72.4,
    roi90d: 22.1,
    maxDrawdown: 7.8,
    subscribers: 934,
    isAI: true,
    tags: ["vol-targeting", "risk-parity", "all-weather"],
    features: ["Constant vol targeting", "Cross-position correlation", "Dynamic leverage", "Risk parity"],
  },
];

// ── Token / KB state (server-backed user holdings) ───────────────────────────
function useTokens() {
  const { data: userData, refetch } = useGetUserStrategies();
  const balance = userData?.tokens ?? 500;
  const owned = userData?.ownedIds ?? [];
  const kb = userData?.knowledgeBase ?? [];

  const purchase = async (id: string, cost: number) => {
    const r = await fetch("/api/strategies/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!r.ok) return false;
    await refetch();
    return true;
  };

  const addToKB = (id: string) => {
    if (kb.includes(id)) return;
    const next = [...kb, id];
    fetch("/api/strategies/user", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ knowledgeBase: next }) }).then(() => refetch());
  };

  const removeFromKB = (id: string) => {
    const next = kb.filter((k) => k !== id);
    fetch("/api/strategies/user", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ knowledgeBase: next }) }).then(() => refetch());
  };

  return { balance, owned, kb, purchase, addToKB, removeFromKB };
}

// ── Risk badge config ──────────────────────────────────────────────────────────
function useRiskCfg() {
  const { t } = useTranslation();
  return {
    low:    { label: t("strategy.conservative"), icon: <Shield className="h-3 w-3" />,   color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20" },
    medium: { label: t("strategy.stable"),       icon: <BarChart2 className="h-3 w-3" />, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    high:   { label: t("strategy.aggressive"),   icon: <Flame className="h-3 w-3" />,    color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/25" },
  };
}

// ── Strategy Card ──────────────────────────────────────────────────────────────
function StrategyCard({
  strategy, isOwned, inKB, onPurchase, onAddKB, onRemoveKB, index,
}: {
  strategy: StrategyDef; isOwned: boolean; inKB: boolean;
  onPurchase: () => void; onAddKB: () => void; onRemoveKB: () => void; index?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const RISK_CFG = useRiskCfg();
  const risk = RISK_CFG[strategy.riskLevel];
  const isPosRoi = strategy.roi90d > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (index ?? 0) * 0.04 }}
      whileHover={{ y: -4 }}
      className={cn(
        "rounded-2xl border p-4 sm:p-5 transition-all relative overflow-hidden group flex flex-col",
        isOwned
          ? "border-primary/30 bg-gradient-to-br from-primary/6 to-card hover:shadow-[0_8px_32px_rgba(59,130,246,0.15)]"
          : "border-border/30 bg-card/60 hover:border-border/60 hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
      )}
    >
      {/* Shimmer */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-gradient-to-br from-white/2 to-transparent pointer-events-none" />

      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-black text-sm leading-snug">{strategy.name}</span>
            {strategy.isAI && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary flex items-center gap-1">
                <Brain className="h-2.5 w-2.5" /> AI
              </span>
            )}
            {isOwned && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 flex items-center gap-1">
                <CheckCircle className="h-2.5 w-2.5" /> {t("strategy.owned")}
              </motion.span>
            )}
            {inKB && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 flex items-center gap-1">
                <BookOpen className="h-2.5 w-2.5" /> {t("strategy.inKB")}
              </motion.span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">by {strategy.author}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={cn("flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg border", risk.color, risk.bg)}>
            {risk.icon} {risk.label}
          </span>
          {strategy.tokenCost === 0 ? (
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{t("strategy.free")}</span>
          ) : !isOwned ? (
            <span className="flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
              <Coins className="h-2.5 w-2.5" /> {strategy.tokenCost}
            </span>
          ) : null}
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 line-clamp-2 flex-shrink-0">{strategy.description}</p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-3">
        <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
          {strategy.category}
        </span>
        {strategy.tags.slice(0, 3).map(tag => (
          <span key={tag} className="text-[9px] bg-white/5 border border-white/8 px-1.5 py-0.5 rounded-full text-muted-foreground">{tag}</span>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-0 rounded-xl border border-border/20 overflow-hidden mb-3">
        {[
          { label: "ROI 90D", value: `${isPosRoi ? "+" : ""}${strategy.roi90d.toFixed(1)}%`, color: isPosRoi ? "text-emerald-400" : "text-red-400" },
          { label: "Win Rate", value: `${strategy.winRate.toFixed(1)}%`, color: "text-foreground" },
          { label: "Max DD", value: `-${strategy.maxDrawdown.toFixed(1)}%`, color: "text-red-400/80" },
        ].map((s, i) => (
          <div key={s.label} className={cn("py-2.5 text-center bg-white/2", i > 0 && "border-l border-border/20")}>
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider mb-0.5">{s.label}</div>
            <div className={cn("text-xs font-black font-mono", s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="mb-3 overflow-hidden"
          >
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-2.5">{strategy.longDesc}</p>
            <div className="flex flex-wrap gap-1.5">
              {strategy.features.map(f => (
                <span key={f} className="text-[10px] flex items-center gap-1 bg-white/4 border border-white/8 px-2 py-1 rounded-lg text-muted-foreground">
                  <Zap className="h-2.5 w-2.5 text-primary/60" /> {f}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action row */}
      <div className="flex items-center gap-2 mt-auto">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="h-3 w-3" />
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        <div className="flex items-center gap-1.5 ml-auto">
          {isOwned ? (
            <Button
              size="sm"
              variant={inKB ? "outline" : "default"}
              className="h-7 text-[10px] px-3 relative overflow-hidden"
              onClick={inKB ? onRemoveKB : onAddKB}
            >
              {inKB ? (
                <><CheckCircle className="h-3 w-3 mr-1 text-emerald-400" /> {t("strategy.inKB")}</>
              ) : (
                <><BookOpen className="h-3 w-3 mr-1" /> {t("strategy.addToKB")}</>
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              className="h-7 text-[10px] px-3 relative overflow-hidden group/btn"
              onClick={onPurchase}
            >
              {strategy.tokenCost === 0 ? (
                <><Unlock className="h-3 w-3 mr-1" /> {t("strategy.getFree")}</>
              ) : (
                <><Coins className="h-3 w-3 mr-1" /> {t("strategy.buy")} {strategy.tokenCost}</>
              )}
              <span className="absolute inset-0 shimmer-bg opacity-0 group-hover/btn:opacity-100 transition-opacity" />
            </Button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border/10 flex items-center justify-between text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-2.5 w-2.5" /> {strategy.subscribers.toLocaleString()} users
        </span>
        <span className="flex items-center gap-1.5">
          {strategy.isAI && <Bot className="h-2.5 w-2.5 text-primary/60" />}
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
          Live
        </span>
      </div>
    </motion.div>
  );
}

// ── Publish dialog ─────────────────────────────────────────────────────────────
function CreateStrategyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const createMut = useCreateStrategy();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", description: "", riskLevel: "medium" as CreateStrategyBodyRiskLevel, tagsInput: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = form.tagsInput.split(",").map(tag => tag.trim()).filter(Boolean);
    createMut.mutate(
      { data: { name: form.name, description: form.description, riskLevel: form.riskLevel, tags } },
      {
        onSuccess: () => {
          toast({ title: t("strategy.strategyPublished") });
          onClose();
          setForm({ name: "", description: "", riskLevel: "medium", tagsInput: "" });
        },
        onError: () => toast({ title: t("strategy.publishFailed"), variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" /> {t("strategy.publishStrategy")}
          </DialogTitle>
          <DialogDescription>{t("strategy.shareStrategy")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label>{t("strategy.strategyName")}</Label>
            <Input placeholder="e.g. BTC Momentum Breakout" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="grid gap-2">
            <Label>{t("strategy.description")}</Label>
            <Textarea placeholder="Describe your strategy's approach and key indicators..." rows={3}
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
          </div>
          <div className="grid gap-2">
            <Label>{t("strategy.riskLevel")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "low" as const, label: t("strategy.conservative"), icon: <Shield className="h-4 w-4 text-blue-400" /> },
                { value: "medium" as const, label: t("strategy.stable"), icon: <BarChart2 className="h-4 w-4 text-emerald-400" /> },
                { value: "high" as const, label: t("strategy.aggressive"), icon: <Flame className="h-4 w-4 text-amber-400" /> },
              ]).map(opt => (
                <button key={opt.value} type="button" onClick={() => setForm(f => ({ ...f, riskLevel: opt.value }))}
                  className={cn("flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all",
                    form.riskLevel === opt.value ? "border-primary bg-primary/10" : "border-border/40 hover:border-border/70 bg-white/3"
                  )}>
                  {opt.icon}
                  <span className="text-xs font-semibold">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{t("strategy.tags")}</Label>
            <Input placeholder="btc, momentum, breakout" value={form.tagsInput}
              onChange={e => setForm(f => ({ ...f, tagsInput: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? t("strategy.publishing") : t("strategy.publish")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Featured card (compact) ───────────────────────────────────────────────────
function FeaturedCard({ s, rank, isOwned }: { s: StrategyDef; rank: number; isOwned: boolean }) {
  const { t } = useTranslation();
  const RISK_CFG = useRiskCfg();
  const risk = RISK_CFG[s.riskLevel];
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: rank * 0.07 }}
      whileHover={{ y: -4, scale: 1.02 }}
      className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/7 via-card to-card p-4 relative overflow-hidden hover:shadow-[0_8px_32px_rgba(59,130,246,0.18)] transition-all cursor-default"
    >
      <div className="absolute top-0 right-0 w-20 h-20 bg-primary/8 rounded-full -translate-y-10 translate-x-10 blur-2xl" />
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-base">{medals[rank]}</span>
            <span className="font-black text-sm">{s.name}</span>
            {s.isAI && <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">AI</span>}
          </div>
          <p className="text-[10px] text-muted-foreground">by {s.author}</p>
        </div>
        <div className={cn("text-2xl font-black font-mono", s.roi90d > 0 ? "text-emerald-400" : "text-red-400")}>
          {s.roi90d > 0 ? "+" : ""}{s.roi90d.toFixed(0)}%
        </div>
      </div>

      <div className={cn("flex items-center gap-1 text-[9px] font-bold mb-3 w-fit px-2 py-1 rounded-lg border", risk.color, risk.bg)}>
        {risk.icon} {risk.label}
      </div>

      <div className="grid grid-cols-3 gap-1 text-center">
        {[
          { label: "Win", value: `${s.winRate.toFixed(1)}%` },
          { label: "DD", value: `-${s.maxDrawdown.toFixed(1)}%` },
          { label: "Users", value: s.subscribers >= 1000 ? `${(s.subscribers / 1000).toFixed(1)}K` : String(s.subscribers) },
        ].map(m => (
          <div key={m.label} className="rounded-lg bg-white/4 py-1.5">
            <div className="text-[8px] text-muted-foreground">{m.label}</div>
            <div className="text-[11px] font-black font-mono text-foreground">{m.value}</div>
          </div>
        ))}
      </div>

      {isOwned && (
        <div className="mt-2.5 flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
          <CheckCircle className="h-3 w-3" /> {t("strategy.owned")}
        </div>
      )}
    </motion.div>
  );
}

// ── Catalog stats banner ───────────────────────────────────────────────────────
function CatalogStats({ catalog }: { catalog: StrategyDef[] }) {
  const avgRoi = catalog.reduce((a, s) => a + s.roi90d, 0) / catalog.length;
  const avgWin = catalog.reduce((a, s) => a + s.winRate, 0) / catalog.length;
  const totalSubs = catalog.reduce((a, s) => a + s.subscribers, 0);
  const aiCount = catalog.filter(s => s.isAI).length;

  return (
    <div className="grid grid-cols-4 gap-2">
      {[
        { label: "Avg ROI 90D", value: `+${avgRoi.toFixed(1)}%`, icon: <TrendingUp className="h-3 w-3 text-emerald-400" />, color: "text-emerald-400" },
        { label: "Avg Win Rate", value: `${avgWin.toFixed(1)}%`, icon: <Trophy className="h-3 w-3 text-amber-400" />, color: "text-amber-400" },
        { label: "Total Users", value: `${(totalSubs / 1000).toFixed(1)}K`, icon: <Users className="h-3 w-3 text-blue-400" />, color: "text-blue-400" },
        { label: "AI Strategies", value: `${aiCount}/${catalog.length}`, icon: <Cpu className="h-3 w-3 text-purple-400" />, color: "text-purple-400" },
      ].map((stat, i) => (
        <motion.div key={stat.label}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
          className="rounded-xl border border-border/30 bg-white/3 px-3 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">{stat.icon}</div>
          <div className={cn("text-sm font-black font-mono", stat.color)}>{stat.value}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{stat.label}</div>
        </motion.div>
      ))}
    </div>
  );
}

// ── KB tab view ───────────────────────────────────────────────────────────────
function KBView({ strategies, onRemoveKB }: { strategies: StrategyDef[]; onRemoveKB: (id: string) => void }) {
  const { t } = useTranslation();
  const RISK_CFG = useRiskCfg();
  if (strategies.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="text-center py-20 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto">
          <BookOpen className="h-7 w-7 text-purple-400" />
        </div>
        <div>
          <div className="text-base font-bold text-foreground">{t("strategy.kbEmpty")}</div>
          <div className="text-sm text-muted-foreground mt-1">{t("strategy.kbEmptyDesc")}</div>
        </div>
        <div className="text-xs text-muted-foreground/60">{t("strategy.kbUsedForTraining")}</div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-r from-purple-500/8 to-card p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
          <Bot className="h-5 w-5 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-purple-400">{t("strategy.aiTrainingActive")}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{strategies.length} {t("strategy.strategiesInPipeline")}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          <span className="text-[10px] text-purple-400 font-mono font-bold">TRAINING</span>
        </div>
      </div>

      <div className="space-y-2">
        {strategies.map((s, i) => {
          const risk = RISK_CFG[s.riskLevel];
          return (
            <motion.div key={s.id}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-purple-500/15 bg-purple-500/4 p-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
                {s.isAI ? <Brain className="h-4 w-4 text-purple-400" /> : <BarChart2 className="h-4 w-4 text-purple-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{s.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn("text-[9px] font-bold flex items-center gap-0.5", risk.color)}>{risk.icon} {risk.label}</span>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">+{s.roi90d.toFixed(1)}%</span>
                  <span className="text-[10px] text-muted-foreground">{s.winRate.toFixed(1)}% win</span>
                </div>
              </div>
              <button onClick={() => onRemoveKB(s.id)}
                className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors border border-border/30 hover:border-red-400/30 px-2 py-1 rounded-lg">
                {t("strategy.remove")}
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Owned tab view ─────────────────────────────────────────────────────────────
function OwnedView({ strategies, kb, onAddKB, onRemoveKB }: {
  strategies: StrategyDef[]; kb: string[];
  onAddKB: (s: StrategyDef) => void; onRemoveKB: (id: string) => void;
}) {
  const { t } = useTranslation();
  const RISK_CFG = useRiskCfg();
  if (strategies.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="text-center py-20 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
          <Unlock className="h-7 w-7 text-primary" />
        </div>
        <div>
          <div className="text-base font-bold">{t("strategy.noStrategiesOwned")}</div>
          <div className="text-sm text-muted-foreground mt-1">{t("strategy.browseMarketplace")}</div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm text-primary font-semibold">{strategies.length} {t("strategy.inPortfolio")}</span>
        <span className="text-xs text-muted-foreground ml-1">· {kb.length} {t("strategy.inKB")}</span>
        <div className="ml-auto flex items-center gap-1">
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {strategies.map((s, i) => (
          <StrategyCard
            key={s.id} strategy={s} isOwned inKB={kb.includes(s.id)}
            index={i}
            onPurchase={() => {}}
            onAddKB={() => onAddKB(s)}
            onRemoveKB={() => onRemoveKB(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Strategy() {
  const [category, setCategory] = useState<Category>("All");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"marketplace" | "owned" | "kb">("marketplace");
  const [sort, setSort] = useState<SortKey>("roi");
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { balance, owned, kb, purchase, addToKB, removeFromKB } = useTokens();

  const handlePurchase = async (s: StrategyDef) => {
    if (s.tokenCost === 0) {
      const ok = await purchase(s.id, 0);
      if (ok) toast({ title: `"${s.name}" ${t("strategy.unlocked")}`, description: t("strategy.canAddToKB") });
      return;
    }
    if (balance < s.tokenCost) {
      toast({ title: t("strategy.insufficientTokens"), description: `${t("strategy.need")} ${s.tokenCost} tokens. ${t("strategy.have")} ${balance}.`, variant: "destructive" });
      return;
    }
    const ok = await purchase(s.id, s.tokenCost);
    if (ok) toast({ title: `"${s.name}" ${t("strategy.purchased")}`, description: `−${s.tokenCost} tokens.` });
  };

  const handleAddKB = (s: StrategyDef) => {
    addToKB(s.id);
    toast({ title: t("strategy.addedToKB"), description: `"${s.name}" ${t("strategy.willBeUsedInTraining")}` });
  };

  const SORT_FNS: Record<SortKey, (a: StrategyDef, b: StrategyDef) => number> = {
    roi: (a, b) => b.roi90d - a.roi90d,
    winRate: (a, b) => b.winRate - a.winRate,
    subscribers: (a, b) => b.subscribers - a.subscribers,
    drawdown: (a, b) => a.maxDrawdown - b.maxDrawdown,
  };

  const { data: catalogData } = useGetStrategyCatalog();
  const catalog = (catalogData?.strategies as StrategyDef[] | undefined) ?? STRATEGY_CATALOG;

  const filtered = useMemo(() => {
    let list = [...catalog];
    if (category !== "All") list = list.filter(s => s.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(tag => tag.includes(q))
      );
    }
    list.sort(SORT_FNS[sort]);
    return list;
  }, [catalog, category, search, sort]);

  // Top 3 by ROI for featured section
  const featuredList = [...catalog].sort((a, b) => b.roi90d - a.roi90d).slice(0, 3);
  const kbStrategies = catalog.filter(s => kb.includes(s.id));
  const ownedStrategies = catalog.filter(s => owned.includes(s.id));

  const categoryCount = (c: Category) =>
    c === "All" ? catalog.length : catalog.filter(s => s.category === c).length;

  return (
    <div className="space-y-6 pb-10">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight gradient-text-gold font-display">
            {t("strategy.title")}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {t("strategy.subtitle")}
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}
          className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/5">
            <Coins className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-black text-amber-400 font-mono">{balance}</span>
            <span className="text-xs text-muted-foreground">tokens</span>
          </div>
          <Button size="sm" className="h-9 relative overflow-hidden group/btn" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("strategy.publishStrategy")}
            <span className="absolute inset-0 shimmer-bg opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />
          </Button>
        </motion.div>
      </div>

      {/* ── Featured top 3 ── */}
      <div>
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
          <Trophy className="h-3.5 w-3.5 text-amber-400" /> Top Performing Strategies
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {featuredList.map((s, i) => (
            <FeaturedCard key={s.id} s={s} rank={i} isOwned={owned.includes(s.id)} />
          ))}
        </div>
      </div>

      {/* ── Catalog stats ── */}
      <CatalogStats catalog={STRATEGY_CATALOG} />

      {/* ── KB status bar ── */}
      {kb.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-3.5 flex items-center gap-3">
          <BookOpen className="h-4 w-4 text-purple-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold text-purple-400">{t("strategy.knowledgeBase")}</span>
            <span className="text-xs text-muted-foreground ml-2">{kb.length} {t("strategy.strategiesInKB")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {kbStrategies.slice(0, 2).map(s => (
              <span key={s.id} className="text-[9px] bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded font-medium">{s.name}</span>
            ))}
            {kb.length > 2 && <span className="text-[9px] text-muted-foreground">+{kb.length - 2} more</span>}
          </div>
          <button onClick={() => setTab("kb")}
            className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors shrink-0">
            View <ArrowRight className="h-3 w-3" />
          </button>
        </motion.div>
      )}

      {/* ── Tab bar ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {[
            { key: "marketplace" as const, label: t("strategy.marketplace"), icon: <FlaskConical className="h-3.5 w-3.5" />, count: STRATEGY_CATALOG.length },
            { key: "owned" as const, label: t("strategy.ownedTab"), icon: <Unlock className="h-3.5 w-3.5" />, count: owned.length },
            { key: "kb" as const, label: t("strategy.knowledgeBase"), icon: <BookOpen className="h-3.5 w-3.5" />, count: kb.length },
          ].map(tabItem => (
            <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
              className={cn("flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl border font-semibold whitespace-nowrap transition-all shrink-0",
                tab === tabItem.key
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-white/3 text-muted-foreground border-border/30 hover:border-border/60"
              )}>
              {tabItem.icon} {tabItem.label}
              <span className={cn("ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black",
                tab === tabItem.key ? "bg-primary/20 text-primary" : "bg-white/8 text-muted-foreground"
              )}>{tabItem.count}</span>
            </button>
          ))}
        </div>

        {/* Marketplace filters */}
        <AnimatePresence>
          {tab === "marketplace" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="space-y-2">
              {/* Category row */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCategory(c)}
                    className={cn("text-xs px-2.5 py-1.5 rounded-lg border font-medium whitespace-nowrap transition-all flex items-center gap-1",
                      category === c
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "bg-white/3 text-muted-foreground border-border/30 hover:border-border/60"
                    )}>
                    {c}
                    <span className="text-[9px] opacity-60">({categoryCount(c)})</span>
                  </button>
                ))}
              </div>

              {/* Search + sort */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search strategies..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 h-9 text-xs bg-white/4 border-border/30"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <SortDesc className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {([
                    { key: "roi" as const, label: "ROI" },
                    { key: "winRate" as const, label: "Win %" },
                    { key: "subscribers" as const, label: "Popular" },
                    { key: "drawdown" as const, label: "Safest" },
                  ]).map(s => (
                    <button key={s.key} onClick={() => setSort(s.key)}
                      className={cn("text-[10px] px-2.5 py-1.5 rounded-lg border font-semibold whitespace-nowrap transition-all",
                        sort === s.key
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-white/3 text-muted-foreground border-border/30 hover:border-border/60"
                      )}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Content area ── */}
      <AnimatePresence mode="wait">
        {tab === "marketplace" && (
          <motion.div key="marketplace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence>
                {filtered.map((s, i) => (
                  <StrategyCard
                    key={s.id} strategy={s} index={i}
                    isOwned={owned.includes(s.id)}
                    inKB={kb.includes(s.id)}
                    onPurchase={() => handlePurchase(s)}
                    onAddKB={() => handleAddKB(s)}
                    onRemoveKB={() => removeFromKB(s.id)}
                  />
                ))}
              </AnimatePresence>
              {filtered.length === 0 && (
                <div className="col-span-full text-center py-16 text-muted-foreground text-sm">
                  <Search className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  {t("strategy.noStrategiesFound")}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {tab === "owned" && (
          <motion.div key="owned" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <OwnedView strategies={ownedStrategies} kb={kb} onAddKB={handleAddKB} onRemoveKB={removeFromKB} />
          </motion.div>
        )}

        {tab === "kb" && (
          <motion.div key="kb" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <KBView strategies={kbStrategies} onRemoveKB={removeFromKB} />
          </motion.div>
        )}
      </AnimatePresence>

      <CreateStrategyDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
