import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@ai/lib/utils";
import {
  Sparkles, Lock, CheckCircle, Zap, Shield, Flame, BarChart2,
  Coins, ChevronRight, Settings2, Rocket, AlertCircle, Info,
} from "lucide-react";
import type { WatchlistEntry, CopyStrategy } from "./types";
import type { ActiveFollow } from "./SmartSignalFeed";

const STRATEGIES: CopyStrategy[] = [
  {
    id: "poly-momentum",
    name: "Polymarket Momentum",
    description: "Follows price momentum on prediction markets. Enters on breakouts, exits on reversal signals.",
    riskLevel: "medium",
    tokenCost: 0,
    category: "Momentum",
    owned: true,
    features: ["Momentum detection", "Auto position sizing", "Risk-adjusted entries"],
    expectedRoi: "18–35%",
    winRate: 64,
  },
  {
    id: "deep-value",
    name: "Deep Value Arbitrage",
    description: "Identifies underpriced probabilities on Polymarket vs fundamentals. Slow, high-conviction bets.",
    riskLevel: "low",
    tokenCost: 0,
    category: "Value",
    owned: true,
    features: ["Fundamental scoring", "Probability gap detection", "Conviction sizing"],
    expectedRoi: "12–22%",
    winRate: 71,
  },
  {
    id: "elite-follow",
    name: "Elite Signal Distiller",
    description: "Distills the moves of verified top-10 Polymarket traders into actionable trade advice with freshness and slippage checks.",
    riskLevel: "medium",
    tokenCost: 50,
    category: "Signal",
    owned: false,
    features: ["Signal freshness scoring", "Slippage-aware advice", "Multi-trader consensus"],
    expectedRoi: "25–60%",
    winRate: 68,
  },
  {
    id: "event-alpha",
    name: "Event Alpha",
    description: "Pre-positions around major events (elections, Fed meetings, crypto upgrades). High conviction, short duration.",
    riskLevel: "high",
    tokenCost: 120,
    category: "Event",
    owned: false,
    features: ["Event calendar integration", "Pre-event entry", "Fast exit triggers"],
    expectedRoi: "40–150%",
    winRate: 55,
  },
  {
    id: "sentiment-ai",
    name: "Sentiment AI",
    description: "Uses NLP on news, social, and on-chain signals to predict market shifts and surface advice from traders who lead them.",
    riskLevel: "high",
    tokenCost: 200,
    category: "AI",
    owned: false,
    features: ["Real-time NLP", "Social sentiment scoring", "On-chain signal fusion"],
    expectedRoi: "50–200%",
    winRate: 52,
  },
];

const RISK_LABEL = {
  low: { labelKey: "copyTrade.conservative", icon: <Shield className="h-3.5 w-3.5" />, color: "text-blue-400", bg: "bg-blue-500/10" },
  medium: { labelKey: "copyTrade.stable", icon: <BarChart2 className="h-3.5 w-3.5" />, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  high: { labelKey: "copyTrade.aggressive", icon: <Flame className="h-3.5 w-3.5" />, color: "text-amber-400", bg: "bg-amber-500/10" },
};

interface AIConfig {
  maxPositionPct: number;
  stopLossBuffer: number;
  minFollowScore: number;
  lagLimit: number;
  autoRebalance: boolean;
  onlyActiveMarkets: boolean;
  rationale: string;
}

function generateAIConfig(entries: WatchlistEntry[], strategyId: string): AIConfig {
  const avgScore = entries.length > 0
    ? entries.reduce((s, e) => s + e.trader.followScore, 0) / entries.length
    : 80;
  const hasAggressive = entries.some(e => e.riskCategory === "aggressive");
  const isEventStrategy = strategyId === "event-alpha";

  return {
    maxPositionPct: hasAggressive ? 12 : 8,
    stopLossBuffer: hasAggressive ? 18 : 12,
    minFollowScore: Math.round(avgScore * 0.88),
    lagLimit: isEventStrategy ? 30 : 120,
    autoRebalance: true,
    onlyActiveMarkets: true,
    rationale: entries.length === 0
      ? "Add traders to your watchlist for a personalized AI config."
      : `Based on your ${entries.length} watchlist traders (avg score ${avgScore.toFixed(0)}), the AI recommends ${hasAggressive ? "higher risk tolerance" : "a conservative allocation model"} with ${isEventStrategy ? "tight lag limits for event timing" : "standard lag tolerance"}.`,
  };
}

interface Props {
  entries: WatchlistEntry[];
  onFollow: (follow: ActiveFollow) => void;
}

export function SmartCopyConfig({ entries, onFollow }: Props) {
  const { t } = useTranslation();
  const [selectedStrategy, setSelectedStrategy] = useState("poly-momentum");
  const [useAIConfig, setUseAIConfig] = useState(true);
  const [started, setStarted] = useState(false);
  const [manualConfig, setManualConfig] = useState({
    maxPositionPct: 8,
    stopLossBuffer: 12,
    minFollowScore: 75,
    lagLimit: 120,
    autoRebalance: true,
    onlyActiveMarkets: true,
  });

  const strategy = STRATEGIES.find(s => s.id === selectedStrategy)!;
  const aiConfig = generateAIConfig(entries, selectedStrategy);
  const config = useAIConfig ? aiConfig : manualConfig;

  const handleStart = () => {
    setStarted(true);
    setTimeout(() => setStarted(false), 3000);
    onFollow({
      strategyId: strategy.id,
      strategyName: strategy.name,
      startedAt: Date.now(),
      params: {
        maxPositionPct: config.maxPositionPct,
        stopLossBuffer: config.stopLossBuffer,
        minFollowScore: config.minFollowScore,
        lagLimit: config.lagLimit,
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h3 className="font-black text-xl tracking-tight bg-gradient-to-r from-foreground via-primary to-blue-400 bg-clip-text text-transparent">
          {t("copyTrade.copyStrategyConfig")}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {t("copyTrade.copyStrategyConfigDesc")}
        </p>
      </motion.div>

      {/* Strategy selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {STRATEGIES.map((s, i) => {
          const risk = RISK_LABEL[s.riskLevel];
          const isSelected = selectedStrategy === s.id;
          return (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}
              onClick={() => s.owned && setSelectedStrategy(s.id)}
              className={cn(
                "text-left p-4 rounded-2xl border transition-all relative overflow-hidden",
                isSelected
                  ? "border-primary/50 bg-primary/8 shadow-[0_0_20px_rgba(59,130,246,0.15)]"
                  : "border-border/40 bg-white/3 hover:border-border/70",
                !s.owned && "opacity-70 cursor-not-allowed"
              )}
            >
              {isSelected && (
                <motion.div
                  className="absolute inset-0 bg-primary/3"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                />
              )}
              <div className="relative">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-bold text-sm">{s.name}</span>
                    <div className={cn("flex items-center gap-1 text-[9px] font-bold mt-0.5", risk.color)}>
                      {risk.icon} {t(risk.labelKey)}
                    </div>
                  </div>
                  {s.owned ? (
                    isSelected && <CheckCircle className="h-4 w-4 text-primary" />
                  ) : (
                    <div className="flex items-center gap-1 bg-amber-500/10 text-amber-400 text-[9px] font-bold px-2 py-1 rounded-lg">
                      <Lock className="h-2.5 w-2.5" />
                      <Coins className="h-2.5 w-2.5" />
                      {s.tokenCost}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed mb-2.5 line-clamp-2">{s.description}</p>
                <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                  <span>ROI: <span className="text-foreground font-semibold">{s.expectedRoi}</span></span>
                  <span>Win: <span className="text-emerald-400 font-semibold">{s.winRate}%</span></span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Config section */}
      <div className="rounded-2xl border border-border/30 bg-card/60 overflow-hidden">
        {/* Config header */}
        <div className="px-5 py-4 border-b border-border/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">{t("copyTrade.parameters")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("copyTrade.aiConfig")}</span>
            <Switch checked={useAIConfig} onCheckedChange={setUseAIConfig} className="scale-90" />
            <span className={cn("text-xs font-bold", useAIConfig ? "text-primary" : "text-muted-foreground")}>
              {useAIConfig ? "ON" : "OFF"}
            </span>
          </div>
        </div>

        {/* AI rationale */}
        <AnimatePresence>
          {useAIConfig && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-5 py-3.5 bg-primary/3 border-b border-primary/10"
            >
              <div className="flex items-start gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed italic">{aiConfig.rationale}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Params grid */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: "maxPositionPct" as const, label: t("copyTrade.maxPositionPct"), suffix: "%", min: 1, max: 30 },
            { key: "stopLossBuffer" as const, label: t("copyTrade.stopLossBuffer"), suffix: "%", min: 5, max: 40 },
            { key: "minFollowScore" as const, label: t("copyTrade.minFollowScore"), suffix: "", min: 50, max: 99 },
            { key: "lagLimit" as const, label: t("copyTrade.lagLimitSec"), suffix: "s", min: 10, max: 300 },
          ].map(f => (
            <div key={f.key}>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                {f.label}
                {useAIConfig && <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded font-bold">AI</span>}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  value={config[f.key] as number}
                  disabled={useAIConfig}
                  min={f.min}
                  max={f.max}
                  onChange={e => !useAIConfig && setManualConfig(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                  className={cn(
                    "font-mono text-sm pr-8",
                    useAIConfig && "opacity-70 cursor-not-allowed"
                  )}
                />
                {f.suffix && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{f.suffix}</span>
                )}
              </div>
            </div>
          ))}

          {/* Toggle params */}
          {[
            { key: "autoRebalance" as const, label: t("copyTrade.autoRebalance"), desc: t("copyTrade.autoRebalanceDesc") },
            { key: "onlyActiveMarkets" as const, label: t("copyTrade.activeMarketsOnly"), desc: t("copyTrade.activeMarketsOnlyDesc") },
          ].map(f => (
            <div key={f.key} className="sm:col-span-2 flex items-center justify-between p-3.5 rounded-xl bg-white/3 border border-border/20">
              <div>
                <div className="text-sm font-semibold">{f.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{f.desc}</div>
              </div>
              <Switch
                checked={config[f.key] as boolean}
                disabled={useAIConfig}
                onCheckedChange={v => !useAIConfig && setManualConfig(p => ({ ...p, [f.key]: v }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Watchlist warning */}
      {entries.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-2 p-3.5 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {t("copyTrade.addTradersFirst")}
          <ChevronRight className="h-3 w-3 ml-auto" />
        </motion.div>
      )}

      {/* Strategy features */}
      {strategy && (
        <motion.div
          key={strategy.id}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" /> {strategy.name} {t("copyTrade.includes")}:</span>
          <div className="flex flex-wrap gap-1.5">
            {strategy.features.map(f => (
              <span key={f} className="text-[10px] bg-white/5 border border-white/8 px-2 py-1 rounded-full text-muted-foreground flex items-center gap-1">
                <Zap className="h-2.5 w-2.5 text-primary/60" /> {f}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Start button */}
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
        <Button
          className="w-full h-12 text-sm font-bold relative overflow-hidden group"
          disabled={entries.length === 0 || started}
          onClick={handleStart}
        >
          <AnimatePresence mode="wait">
            {started ? (
              <motion.span key="ok" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
                {t("copyTrade.copyTradeActivated")}
              </motion.span>
            ) : (
              <motion.span key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-2">
                <Rocket className="h-5 w-5" />
                {t("copyTrade.startFollowing")} {entries.length > 0 ? `${entries.filter(e => !e.paused).length} ${t("copyTrade.traders")}` : t("copyTrade.tabWatchlist")}
              </motion.span>
            )}
          </AnimatePresence>
          <span className="absolute inset-0 shimmer-bg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </Button>
      </motion.div>
    </div>
  );
}
