import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@ai/lib/utils";
import {
  Trophy, TrendingUp, TrendingDown, Zap, Star, StarOff,
  Cpu, Filter, CheckCircle, BarChart2, Shield, Flame,
  PlayCircle, Loader2, LineChart,
} from "lucide-react";
import type { TrainedAgent } from "./types";

const SIM_DURATION_MS = 10_000;

const RISK_CFG = {
  low: { label: "Conservative", icon: <Shield className="h-3 w-3" />, color: "text-blue-400", bg: "bg-blue-500/10" },
  medium: { label: "Stable", icon: <BarChart2 className="h-3 w-3" />, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  high: { label: "Aggressive", icon: <Flame className="h-3 w-3" />, color: "text-amber-400", bg: "bg-amber-500/10" },
};

function ScoreRing({ score }: { score: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? "#10b981" : score >= 65 ? "#3b82f6" : score >= 50 ? "#f59e0b" : "#6b7280";

  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#ffffff10" strokeWidth="4" />
        <motion.circle
          cx="24" cy="24" r={r}
          fill="none" stroke={color} strokeWidth="4"
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${fill} ${circ - fill}` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-black" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

interface Props {
  agents: TrainedAgent[];
  onToggleCandidate: (id: string) => void;
  onUpdateAgent: (id: string, patch: Partial<TrainedAgent>) => void;
}

export function QuantMyAgents({ agents, onToggleCandidate, onUpdateAgent }: Props) {
  const { t } = useTranslation();
  const [minScore, setMinScore] = useState(50);
  const [sort, setSort] = useState<"score" | "pnl" | "winRate">("score");
  const [showCandidatesOnly, setShowCandidatesOnly] = useState(false);
  const [, setTick] = useState(0);

  // Complete running simulations after their duration elapses (survives remounts)
  useEffect(() => {
    const running = agents.filter(a => a.simStatus === "running");
    if (running.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      for (const a of running) {
        const started = a.simStartedAt ? new Date(a.simStartedAt).getTime() : 0;
        if (now - started >= SIM_DURATION_MS) {
          const drift = (a.winRate - 55) / 8;
          const simPnl = parseFloat((drift * 4 + (Math.random() * 16 - 6)).toFixed(1));
          const simWin = parseFloat(Math.min(92, Math.max(35, a.winRate + (Math.random() * 8 - 4))).toFixed(1));
          onUpdateAgent(a.id, { simStatus: "done", simPnlPct: simPnl, simWinRate: simWin });
        }
      }
      setTick(v => v + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [agents, onUpdateAgent]);

  const startSim = (agent: TrainedAgent) =>
    onUpdateAgent(agent.id, { simStatus: "running", simStartedAt: new Date().toISOString() });

  const filtered = agents
    .filter(a => a.score >= minScore)
    .filter(a => !showCandidatesOnly || a.isCandidate)
    .sort((a, b) => {
      if (sort === "score") return b.score - a.score;
      if (sort === "pnl") return b.backtestPnlPct - a.backtestPnlPct;
      return b.winRate - a.winRate;
    });

  const candidates = agents.filter(a => a.isCandidate);

  if (agents.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20 text-center">
        <motion.div
          animate={{ rotate: [0, 360] }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
          <Cpu className="h-6 w-6 text-primary" />
        </motion.div>
        <h3 className="font-bold text-lg mb-1.5">{t("copyTrade.noTrainedAgents")}</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {t("copyTrade.goToTrainingLab")}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border/30 bg-gradient-to-r from-primary/5 via-card to-card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-xl tracking-tight">{t("copyTrade.myTrainedAgents")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {agents.length} agents trained · {candidates.length} candidates selected
            </p>
          </div>
          {candidates.length > 0 && (
            <div className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl text-emerald-400 font-semibold">
              <CheckCircle className="h-3.5 w-3.5" />
              {candidates.length} {t("copyTrade.readyForDeployment")}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{t("copyTrade.minScore")}:</span>
          {[50, 65, 80].map(v => (
            <button key={v} onClick={() => setMinScore(v)}
              className={cn("text-xs px-2.5 py-1 rounded-lg border font-medium transition-all",
                minScore === v ? "bg-primary/15 text-primary border-primary/30" : "bg-white/3 text-muted-foreground border-border/30 hover:border-border/60"
              )}>
              ≥{v}
            </button>
          ))}
          <div className="h-4 w-px bg-border/30" />
          <span className="text-xs text-muted-foreground">{t("copyTrade.sort")}:</span>
          {[
            { key: "score" as const, label: "Score" },
            { key: "pnl" as const, label: "PnL%" },
            { key: "winRate" as const, label: "Win%" },
          ].map(s => (
            <button key={s.key} onClick={() => setSort(s.key)}
              className={cn("text-xs px-2.5 py-1 rounded-lg border font-medium transition-all",
                sort === s.key ? "bg-primary/15 text-primary border-primary/30" : "bg-white/3 text-muted-foreground border-border/30"
              )}>
              {s.label}
            </button>
          ))}
          <div className="h-4 w-px bg-border/30" />
          <button
            onClick={() => setShowCandidatesOnly(!showCandidatesOnly)}
            className={cn("text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1.5",
              showCandidatesOnly ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-white/3 text-muted-foreground border-border/30"
            )}>
            <Star className="h-3 w-3" /> {t("copyTrade.candidatesOnly")}
          </button>
        </div>
      </motion.div>

      {/* Agent grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <AnimatePresence>
          {filtered.map((agent, i) => {
            const risk = RISK_CFG[agent.riskLevel];
            const isPos = agent.backtestPnlPct >= 0;
            return (
              <motion.div
                key={agent.id}
                layout
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.03 }}
                className={cn(
                  "rounded-2xl border p-4 transition-all",
                  agent.isCandidate
                    ? "border-amber-500/30 bg-amber-500/5 shadow-[0_0_16px_rgba(245,158,11,0.1)]"
                    : "border-border/30 bg-white/3 hover:border-border/60"
                )}
              >
                <div className="flex items-start gap-3 mb-3">
                  <ScoreRing score={agent.score} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{agent.name}</span>
                      {agent.isCandidate && (
                        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 flex items-center gap-1">
                          <Star className="h-2 w-2" /> CANDIDATE
                        </motion.span>
                      )}
                      {agent.score >= 80 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 flex items-center gap-1">
                          <Trophy className="h-2 w-2" /> TOP
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{agent.strategy}</div>
                    <div className={cn("flex items-center gap-1 text-[9px] font-bold mt-1", risk.color)}>
                      {risk.icon} {risk.label}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { label: t("copyTrade.winRate"), value: `${agent.winRate.toFixed(1)}%`, color: "text-emerald-400" },
                    { label: t("copyTrade.backtestPnl"), value: `${isPos ? "+" : ""}${agent.backtestPnlPct.toFixed(1)}%`, color: isPos ? "text-emerald-400" : "text-red-400" },
                    { label: t("copyTrade.maxDD"), value: `${agent.maxDrawdown.toFixed(1)}%`, color: "text-red-400" },
                    { label: t("copyTrade.sharpe"), value: agent.sharpeRatio.toFixed(2), color: "text-primary" },
                  ].map(s => (
                    <div key={s.label} className="bg-white/3 rounded-xl p-2">
                      <div className="text-[8px] text-muted-foreground uppercase tracking-wider mb-0.5">{s.label}</div>
                      <div className={cn("text-xs font-black font-mono", s.color)}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Sim result */}
                {agent.simStatus === "done" && agent.simPnlPct !== undefined && (
                  <div className="flex items-center gap-2 mb-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 px-2.5 py-2">
                    <LineChart className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <span className="text-[10px] text-muted-foreground">{t("copyTrade.simResult")}</span>
                    <span className={cn("text-[11px] font-black font-mono ml-auto",
                      agent.simPnlPct >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {agent.simPnlPct >= 0 ? "+" : ""}{agent.simPnlPct.toFixed(1)}%
                    </span>
                    {agent.simWinRate !== undefined && (
                      <span className="text-[9px] text-muted-foreground font-mono">
                        {t("copyTrade.winRate")} {agent.simWinRate.toFixed(1)}%
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8"
                    disabled={agent.simStatus === "running"}
                    onClick={() => startSim(agent)}
                  >
                    {agent.simStatus === "running" ? (
                      <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> {t("copyTrade.simRunning")}</>
                    ) : agent.simStatus === "done" ? (
                      <><PlayCircle className="h-3 w-3 mr-1.5" /> {t("copyTrade.simAgain")}</>
                    ) : (
                      <><PlayCircle className="h-3 w-3 mr-1.5" /> {t("copyTrade.simTrain")}</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant={agent.isCandidate ? "outline" : "default"}
                    className="text-xs h-8"
                    onClick={() => onToggleCandidate(agent.id)}
                  >
                    {agent.isCandidate ? (
                      <><StarOff className="h-3 w-3 mr-1.5" /> {t("copyTrade.removeCandidate")}</>
                    ) : (
                      <><Star className="h-3 w-3 mr-1.5" /> {t("copyTrade.addToCandidate")}</>
                    )}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {t("copyTrade.noAgentsMatching")}
        </div>
      )}
    </div>
  );
}
