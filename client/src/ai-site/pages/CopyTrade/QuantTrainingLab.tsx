import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@ai/lib/utils";
import {
  FlaskConical, Trophy, Cpu, Settings2, Layers,
  ChevronRight, TrendingUp, Database, Rocket,
  CheckCircle, Circle, Loader2, CheckSquare, Square, Star,
} from "lucide-react";
import type { TrainedAgent } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────
function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function generateAgent(index: number, strategy: string, model: string, riskBias: number, runSeed: number): TrainedAgent {
  const r = (i: number) => seededRandom(runSeed + index * 137 + i * 31);
  const base = 35 + r(0) * 55 + riskBias * 8;
  const score = Math.min(99, Math.round(base));
  const winRate = 42 + r(1) * 36;
  const pnlPct = -20 + r(2) * 180;
  const dd = 5 + r(3) * 35;
  const sharpe = 0.5 + r(4) * 3;
  const riskLevel: "low" | "medium" | "high" = score > 75 ? "high" : score > 55 ? "medium" : "low";

  return {
    id: `agent_${runSeed}_${index}`,
    name: `Agent #${String(index + 1).padStart(3, "0")}`,
    strategy,
    model,
    score,
    winRate: parseFloat(winRate.toFixed(1)),
    backtestPnl: parseFloat((pnlPct * 100).toFixed(0)),
    backtestPnlPct: parseFloat(pnlPct.toFixed(1)),
    maxDrawdown: parseFloat(dd.toFixed(1)),
    sharpeRatio: parseFloat(sharpe.toFixed(2)),
    trades: Math.round(200 + r(5) * 1800),
    riskLevel,
    isCandidate: false,
    trainedAt: new Date().toISOString(),
  };
}

// ── Score cell ────────────────────────────────────────────────────────────────
function AgentCell({ agent }: { agent: TrainedAgent | null }) {
  const score = agent?.score ?? 0;
  const color =
    score >= 80 ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
    : score >= 65 ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
    : score >= 50 ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
    : "text-muted-foreground bg-white/5 border-border/20";

  return agent ? (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={cn(
        "aspect-square rounded-xl border flex flex-col items-center justify-center transition-all",
        color,
        score >= 80 && "ring-1 ring-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
      )}
      title={`${agent.name} · Score ${score}`}
    >
      <span className="text-xs font-black">{score}</span>
    </motion.div>
  ) : (
    <div className="aspect-square rounded-xl border border-border/10 bg-white/2 flex items-center justify-center">
      <motion.div
        animate={{ opacity: [0.15, 0.5, 0.15] }} transition={{ duration: 1.4, repeat: Infinity }}
        className="w-2 h-2 rounded-full bg-primary/30"
      />
    </div>
  );
}

// ── Training phases ───────────────────────────────────────────────────────────
type Phase = "idle" | "init" | "data" | "training" | "eval" | "complete";

const PHASE_ORDER: Phase[] = ["init", "data", "training", "eval"];
const PHASE_ICONS: Record<string, React.ReactNode> = {
  init: <Settings2 className="h-3.5 w-3.5" />,
  data: <Database className="h-3.5 w-3.5" />,
  training: <Cpu className="h-3.5 w-3.5" />,
  eval: <Layers className="h-3.5 w-3.5" />,
};

// Durations (ms)
const INIT_MS = 3500;
const DATA_MS = 5000;
const TRAIN_TICK_MS = 420;   // 1 agent per tick → ~42s for 100 agents
const EVAL_MS = 5500;

const STRATEGIES = [
  "Polymarket Momentum",
  "Deep Value Arbitrage",
  "Elite Signal Distiller",
  "Event Alpha",
  "Sentiment AI",
  "Cross-Market Hedge",
  "Volume Breakout",
];

const MODELS = [
  { id: "conservative", label: "Conservative", desc: "Low risk, steady returns" },
  { id: "balanced", label: "Balanced", desc: "Moderate risk/reward" },
  { id: "aggressive", label: "Aggressive", desc: "High risk, max alpha" },
];

interface Props {
  onDeployAgents: (agents: TrainedAgent[]) => void;
}

export function QuantTrainingLab({ onDeployAgents }: Props) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState("Polymarket Momentum");
  const [model, setModel] = useState("balanced");
  const [agents, setAgents] = useState<(TrainedAgent | null)[]>(Array(100).fill(null));
  const [phase, setPhase] = useState<Phase>("idle");
  const [selected, setSelected] = useState<string[]>([]);
  const [deployed, setDeployed] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  useEffect(() => () => clearTimers(), []);

  const riskBias = model === "conservative" ? -2 : model === "aggressive" ? 3 : 0;
  const agentCount = agents.filter(Boolean).length;
  const highCount = agents.filter(a => a && a.score >= 80).length;
  const completedAgents = useMemo(
    () => agents.filter((a): a is TrainedAgent => a !== null),
    [agents],
  );
  const rankedAgents = useMemo(
    () => [...completedAgents].sort((a, b) => b.score - a.score).slice(0, 12),
    [completedAgents],
  );

  const isRunning = phase !== "idle" && phase !== "complete";

  // Overall progress across phases
  const progress =
    phase === "idle" ? 0
    : phase === "init" ? 5
    : phase === "data" ? 12
    : phase === "training" ? 15 + Math.round((agentCount / 100) * 70)
    : phase === "eval" ? 90
    : 100;

  const handleLaunch = () => {
    clearTimers();
    setPhase("init");
    setAgents(Array(100).fill(null));
    setSelected([]);
    setDeployed(false);

    const runSeed = Math.floor(Math.random() * 1_000_000);
    const generated = Array.from({ length: 100 }, (_, i) =>
      generateAgent(i, strategy, model, riskBias, runSeed)
    );

    // Phase: init → data → training (gradual) → eval → complete
    timersRef.current.push(setTimeout(() => setPhase("data"), INIT_MS));
    timersRef.current.push(setTimeout(() => {
      setPhase("training");
      let completed = 0;
      intervalRef.current = setInterval(() => {
        completed += 1;
        setAgents(prev => {
          const next = [...prev];
          next[completed - 1] = generated[completed - 1];
          return next;
        });
        if (completed >= 100) {
          clearInterval(intervalRef.current!);
          setPhase("eval");
          timersRef.current.push(setTimeout(() => {
            setPhase("complete");
            // Pre-select high scorers among the visible top-12 list only
            const top12 = [...generated].sort((a, b) => b.score - a.score).slice(0, 12);
            setSelected(top12.filter(a => a.score >= 80).map(a => a.id));
          }, EVAL_MS));
        }
      }, TRAIN_TICK_MS);
    }, INIT_MS + DATA_MS));
  };

  const toggleSelect = (id: string) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const handleDeploy = () => {
    const toDeploy = completedAgents
      .filter(a => selected.includes(a.id))
      .map(a => ({ ...a, deployedAt: new Date().toISOString() }));
    if (toDeploy.length === 0) return;
    setDeployed(true);
    onDeployAgents(toDeploy);
  };

  // ETA for training phase
  const etaSec = phase === "training" ? Math.ceil(((100 - agentCount) * TRAIN_TICK_MS) / 1000) : 0;

  const phaseLabel = (p: Phase) => t(`copyTrade.phase_${p}`);

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h3 className="font-black text-xl tracking-tight bg-gradient-to-r from-foreground via-primary to-blue-400 bg-clip-text text-transparent">
          {t("copyTrade.agentTrainingLab")}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {t("copyTrade.agentTrainingLabDesc")}
        </p>
      </motion.div>

      {/* Config panel */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        className="rounded-2xl border border-border/30 bg-card/60 p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold mb-1">
          <Settings2 className="h-4 w-4 text-primary" />
          {t("copyTrade.trainingParameters")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">{t("copyTrade.baseStrategy")}</label>
            <Select value={strategy} onValueChange={setStrategy} disabled={isRunning}>
              <SelectTrigger className="bg-white/4 border-border/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">{t("copyTrade.agentModel")}</label>
            <div className="flex gap-2">
              {MODELS.map(m => (
                <button
                  key={m.id}
                  disabled={isRunning}
                  onClick={() => setModel(m.id)}
                  className={cn(
                    "flex-1 text-xs py-2.5 px-2 rounded-xl border transition-all font-semibold",
                    model === m.id
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-white/3 text-muted-foreground border-border/30 hover:border-border/60"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          <Button
            className="w-full h-11 font-bold text-sm relative overflow-hidden"
            onClick={handleLaunch}
            disabled={isRunning}
          >
            <Cpu className="h-4 w-4 mr-2" />
            {isRunning
              ? `${phaseLabel(phase)}… ${progress}%`
              : phase === "complete" ? t("copyTrade.retrainAgents") : t("copyTrade.launchTraining")}
            <span className="absolute inset-0 shimmer-bg opacity-0 hover:opacity-100 transition-opacity duration-500" />
          </Button>
        </motion.div>
      </motion.div>

      {/* Phase pipeline + progress */}
      <AnimatePresence>
        {phase !== "idle" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="space-y-3">
            {/* Phase steps */}
            <div className="grid grid-cols-4 gap-2">
              {PHASE_ORDER.map(p => {
                const idx = PHASE_ORDER.indexOf(p);
                const currentIdx = phase === "complete" ? PHASE_ORDER.length : PHASE_ORDER.indexOf(phase);
                const done = idx < currentIdx;
                const active = p === phase;
                return (
                  <div key={p} className={cn(
                    "rounded-xl border p-2.5 flex items-center gap-2 transition-all",
                    active ? "border-primary/40 bg-primary/8"
                      : done ? "border-emerald-500/25 bg-emerald-500/5"
                      : "border-border/20 bg-white/2"
                  )}>
                    <span className={cn("shrink-0",
                      active ? "text-primary" : done ? "text-emerald-500" : "text-muted-foreground/40")}>
                      {done ? <CheckCircle className="h-3.5 w-3.5" />
                        : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Circle className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 hidden sm:block">
                      <div className={cn("text-[10px] font-bold truncate",
                        active ? "text-primary" : done ? "text-emerald-500" : "text-muted-foreground/60")}>
                        {phaseLabel(p)}
                      </div>
                    </div>
                    <span className={cn("sm:hidden", active ? "text-primary" : "text-muted-foreground/50")}>
                      {PHASE_ICONS[p]}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-muted-foreground font-medium">
                  {phase === "training"
                    ? `${agentCount}/100 ${t("copyTrade.agentsTrained")} · ${t("copyTrade.etaSeconds", { s: etaSec })}`
                    : phase === "complete" ? t("copyTrade.trainingComplete")
                    : phaseLabel(phase)}
                </span>
                <span className="font-bold text-primary">{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-blue-400 to-primary bg-[length:200%] animate-[shimmer_2s_linear_infinite]"
                  style={{ width: `${progress}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </div>

            {phase === "complete" && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <Trophy className="h-3.5 w-3.5" /> {highCount} {t("copyTrade.highScoreAgents")}
                </span>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">{t("copyTrade.pickAgentsToDeploy")}</span>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats row */}
      {phase !== "idle" && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Cpu className="h-4 w-4" />, label: t("copyTrade.trained"), value: `${agentCount}/100`, color: "text-primary" },
            { icon: <Trophy className="h-4 w-4" />, label: t("copyTrade.highScoreLabel"), value: highCount, color: "text-emerald-400" },
            { icon: <TrendingUp className="h-4 w-4" />, label: t("copyTrade.bestScore"), value: Math.max(...agents.filter(Boolean).map(a => a!.score), 0), color: "text-amber-400" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-border/20 bg-white/3 p-3 text-center">
              <div className={cn("flex items-center justify-center gap-1 text-[9px] text-muted-foreground mb-1", s.color)}>
                {s.icon} {s.label}
              </div>
              <div className={cn("text-xl font-black font-mono", s.color)}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 10×10 agent grid */}
      {(phase === "training" || phase === "eval" || phase === "complete") && (
        <div>
          <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
            <FlaskConical className="h-3.5 w-3.5 text-primary" />
            <span>{t("copyTrade.agentSimGrid")}</span>
            <div className="flex items-center gap-3 ml-auto">
              {[
                { label: "≥80", color: "bg-emerald-500/40" },
                { label: "65–79", color: "bg-blue-500/30" },
                { label: "50–64", color: "bg-amber-500/30" },
                { label: "<50", color: "bg-white/10" },
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1">
                  <span className={cn("w-2.5 h-2.5 rounded-sm", l.color)} />
                  <span className="text-[9px]">{l.label}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-10 gap-1.5">
            {agents.map((agent, i) => (
              <AgentCell key={i} agent={agent} />
            ))}
          </div>
        </div>
      )}

      {/* Deployment selection */}
      <AnimatePresence>
        {phase === "complete" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-2xl border border-primary/25 bg-primary/4 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Rocket className="h-4 w-4 text-primary" />
                  {t("copyTrade.selectDeployTitle")}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t("copyTrade.selectDeployDesc")}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setSelected(rankedAgents.filter(a => a.score >= 80).map(a => a.id))}
                  disabled={deployed}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg border border-border/40 text-muted-foreground hover:border-primary/40 hover:text-primary transition-all font-semibold disabled:opacity-50 disabled:pointer-events-none">
                  {t("copyTrade.selectTopScorers")}
                </button>
                <button onClick={() => setSelected([])}
                  disabled={deployed}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg border border-border/40 text-muted-foreground hover:border-border/70 transition-all font-semibold disabled:opacity-50 disabled:pointer-events-none">
                  {t("copyTrade.clearSelection")}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {rankedAgents.map(agent => {
                const on = selected.includes(agent.id);
                return (
                  <button key={agent.id} onClick={() => !deployed && toggleSelect(agent.id)}
                    disabled={deployed}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      on ? "border-primary/40 bg-primary/8" : "border-border/30 bg-white/3 hover:border-border/60",
                      deployed && "opacity-60 cursor-not-allowed"
                    )}>
                    <div className="flex items-center gap-2.5">
                      <span className={on ? "text-primary" : "text-muted-foreground/40"}>
                        {on ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate flex items-center gap-1.5">
                          {agent.name}
                          {agent.score >= 80 && <Star className="h-2.5 w-2.5 text-amber-400 shrink-0" />}
                        </div>
                        <div className="text-[9px] text-muted-foreground">
                          {t("copyTrade.winRate")} {agent.winRate.toFixed(1)}% · Sharpe {agent.sharpeRatio.toFixed(2)}
                        </div>
                      </div>
                      <span className={cn("text-sm font-black font-mono shrink-0",
                        agent.score >= 80 ? "text-emerald-500" : agent.score >= 65 ? "text-blue-400" : "text-amber-500")}>
                        {agent.score}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <Button className="w-full h-10 font-bold text-sm" onClick={handleDeploy}
              disabled={selected.length === 0 || deployed}>
              <Rocket className="h-4 w-4 mr-2" />
              {deployed
                ? t("copyTrade.deployedDone", { count: selected.length })
                : t("copyTrade.deploySelected", { count: selected.length })}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idle placeholder */}
      {phase === "idle" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/30 rounded-2xl">
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 4, repeat: Infinity }}
            className="w-14 h-14 rounded-2xl bg-primary/8 border border-primary/20 flex items-center justify-center mb-4">
            <FlaskConical className="h-6 w-6 text-primary" />
          </motion.div>
          <h4 className="font-bold mb-1.5">{t("copyTrade.readyToTrain")}</h4>
          <p className="text-xs text-muted-foreground max-w-xs">
            {t("copyTrade.readyToTrainDesc")}
          </p>
        </motion.div>
      )}
    </div>
  );
}
