import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@ai/lib/utils";
import { Link } from "wouter";
import {
  Bot, Radio, Terminal, TrendingUp, TrendingDown, Zap,
  Play, Pause, Trash2, Rocket, ArrowRight, CheckCircle,
} from "lucide-react";
import type { TrainedAgent } from "./types";
import { usePreference } from "@ai/hooks/usePreference";

const BOTS_KEY = "signal_bots";

interface SignalBot {
  agentId: string;
  status: "running" | "paused";
  deployedAt: string;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const COINS: { symbol: string; base: number }[] = [
  { symbol: "BTC/USDT", base: 97400 },
  { symbol: "ETH/USDT", base: 3620 },
  { symbol: "SOL/USDT", base: 212 },
  { symbol: "BNB/USDT", base: 645 },
  { symbol: "XRP/USDT", base: 2.31 },
  { symbol: "DOGE/USDT", base: 0.324 },
  { symbol: "AVAX/USDT", base: 42.6 },
  { symbol: "LINK/USDT", base: 24.8 },
];

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 10) return p.toFixed(2);
  return p.toFixed(4);
}

interface BotSignal {
  id: string;
  agentName: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence: number;
  minutesAgo: number;
  status: "active" | "filled";
  reasonKey: string;
  entry: number;
  target: number;
  stop: number;
}

function generateBotSignals(agents: TrainedAgent[], hourBucket: number): BotSignal[] {
  const out: BotSignal[] = [];
  for (const agent of agents) {
    const base = hashStr(agent.id) + hourBucket * 13;
    const count = 2 + (base % 2);
    for (let i = 0; i < count; i++) {
      const seed = base + i * 7919;
      const coin = COINS[seed % COINS.length];
      const direction: "LONG" | "SHORT" = seed % 2 === 0 ? "LONG" : "SHORT";
      const entry = coin.base * (1 + ((seed % 400) - 200) / 10000);
      const movePct = (1.2 + (seed % 26) / 10) / 100;
      const target = direction === "LONG" ? entry * (1 + movePct) : entry * (1 - movePct);
      const stop = direction === "LONG" ? entry * (1 - movePct / 2) : entry * (1 + movePct / 2);
      out.push({
        id: `${agent.id}-${hourBucket}-${i}`,
        agentName: agent.name,
        symbol: coin.symbol,
        direction,
        confidence: Math.min(9.6, 5.5 + ((agent.winRate - 40) / 12) + ((seed % 18) / 10)),
        minutesAgo: 2 + (seed % 56),
        status: seed % 3 === 0 ? "filled" : "active",
        reasonKey: `strategy.signalReason${(seed % 4) + 1}`,
        entry,
        target,
        stop,
      });
    }
  }
  return out.sort((a, b) => a.minutesAgo - b.minutesAgo);
}

interface Props {
  agents: TrainedAgent[];
  standalone?: boolean;
}

export function QuantSignalBots({ agents, standalone = false }: Props) {
  const { t } = useTranslation();
  const [bots, setBots] = usePreference<SignalBot[]>(BOTS_KEY, []);
  const [hourBucket, setHourBucket] = useState(() => Math.floor(Date.now() / 3_600_000));

  // Prune bots whose agent no longer exists
  useEffect(() => {
    setBots(prev => {
      const valid = prev.filter(b => agents.some(a => a.id === b.agentId));
      return valid.length === prev.length ? prev : valid;
    });
  }, [agents]);

  useEffect(() => {
    const timer = setInterval(() => {
      setHourBucket(prev => {
        const next = Math.floor(Date.now() / 3_600_000);
        return next === prev ? prev : next;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const candidates = agents.filter(a => a.isCandidate);
  const deployedIds = new Set(bots.map(b => b.agentId));
  const pendingCandidates = candidates.filter(a => !deployedIds.has(a.id));

  const runningAgents = useMemo(
    () => bots
      .filter(b => b.status === "running")
      .map(b => agents.find(a => a.id === b.agentId))
      .filter((a): a is TrainedAgent => !!a),
    [bots, agents],
  );

  const signals = useMemo(
    () => generateBotSignals(runningAgents, hourBucket),
    [runningAgents, hourBucket],
  );
  const activeSignals = signals.filter(s => s.status === "active");

  const deployBot = (agentId: string) =>
    setBots(prev => (prev.some(b => b.agentId === agentId)
      ? prev
      : [...prev, { agentId, status: "running", deployedAt: new Date().toISOString() }]));

  const deployAll = () =>
    setBots(prev => [
      ...prev,
      ...pendingCandidates
        .filter(a => !prev.some(b => b.agentId === a.id))
        .map(a => ({ agentId: a.id, status: "running" as const, deployedAt: new Date().toISOString() })),
    ]);

  const toggleBot = (agentId: string) =>
    setBots(prev => prev.map(b => b.agentId === agentId
      ? { ...b, status: b.status === "running" ? "paused" : "running" }
      : b));

  const removeBot = (agentId: string) =>
    setBots(prev => prev.filter(b => b.agentId !== agentId));

  if (candidates.length === 0 && bots.length === 0) {
    if (!standalone) return null;
    return (
      <div className="rounded-2xl border border-border/40 bg-card/50 p-10 text-center space-y-3">
        <Bot className="h-8 w-8 mx-auto text-primary/40" />
        <div className="text-sm font-bold">{t("copyTrade.noSignalBotsYet")}</div>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">{t("copyTrade.noSignalBotsYetDesc")}</p>
        <Link href="/ai-hub">
          <Button size="sm" className="h-8 font-bold mt-1">
            {t("copyTrade.goTrainAgents")} <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", !standalone && "mt-6 pt-6 border-t border-border/30")}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-lg tracking-tight flex items-center gap-2">
            <Rocket className="h-4.5 w-4.5 text-primary" />
            {t("copyTrade.signalBotsTitle")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("copyTrade.signalBotsDesc")}</p>
        </div>
        {pendingCandidates.length > 0 && (
          <Button size="sm" className="h-9 font-bold shrink-0" onClick={deployAll}>
            <Rocket className="h-3.5 w-3.5 mr-1.5" />
            {t("copyTrade.deployAllCandidates", { count: pendingCandidates.length })}
          </Button>
        )}
      </div>

      {/* Pending candidates to deploy */}
      {pendingCandidates.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/4 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-500">
            <CheckCircle className="h-3.5 w-3.5" />
            {t("copyTrade.pendingSignalDeploy", { count: pendingCandidates.length })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {pendingCandidates.map(agent => (
              <div key={agent.id}
                className="rounded-xl border border-border/30 bg-card/60 p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{agent.name}</div>
                  <div className="text-[9px] text-muted-foreground font-mono">
                    Score {agent.score} · {t("copyTrade.winRate")} {agent.winRate.toFixed(1)}%
                  </div>
                </div>
                <Button size="sm" className="h-7 text-[10px] font-bold shrink-0 px-2.5"
                  onClick={() => deployBot(agent.id)}>
                  <Rocket className="h-3 w-3 mr-1" /> {t("copyTrade.deploySignalBot")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {bots.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Deployed bots */}
          <div className="xl:col-span-1 space-y-2.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              <Bot className="h-3.5 w-3.5 text-primary" />
              {t("copyTrade.deployedSignalBots", { count: bots.length })}
            </div>
            <AnimatePresence>
              {bots.map(bot => {
                const agent = agents.find(a => a.id === bot.agentId);
                if (!agent) return null;
                const running = bot.status === "running";
                return (
                  <motion.div key={bot.agentId} layout
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                    className={cn("rounded-xl border p-3 transition-all",
                      running ? "border-emerald-500/25 bg-emerald-500/4" : "border-border/30 bg-white/3 opacity-75"
                    )}>
                    <div className="flex items-center gap-2.5">
                      <span className={cn("w-2 h-2 rounded-full shrink-0",
                        running ? "bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]" : "bg-amber-500")} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate flex items-center gap-1.5">
                          {agent.name}
                          {running && <Radio className="h-3 w-3 text-emerald-500 shrink-0" />}
                        </div>
                        <div className="text-[9px] text-muted-foreground truncate">
                          {agent.strategy} · {running ? t("copyTrade.signalBotRunning") : t("copyTrade.signalBotPaused")}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => toggleBot(bot.agentId)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                          title={running ? t("copyTrade.pause") : t("copyTrade.resume")}>
                          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => removeBot(bot.agentId)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                          title={t("copyTrade.stop")}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Signal terminal */}
          <div className="xl:col-span-2 rounded-2xl border border-white/10 overflow-hidden flex flex-col bg-[hsl(222,25%,5%)] max-h-[420px]">
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2 bg-black/30 shrink-0">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 animate-pulse" />
              </div>
              <Terminal className="h-3.5 w-3.5 text-[#E0568F] ml-1" />
              <span className="text-[11px] font-mono font-bold text-[#E0568F] tracking-widest uppercase">
                {t("copyTrade.signalBotTerminal")}
              </span>
              <div className="ml-auto flex items-center gap-2 text-[9px] font-mono">
                <span className="text-emerald-400 font-bold">{activeSignals.length} LIVE</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {runningAgents.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  <Radio className="h-5 w-5 mx-auto mb-2 opacity-40" />
                  {t("copyTrade.noRunningSignalBots")}
                </div>
              ) : (
                signals.map((sig, i) => (
                  <motion.div key={sig.id}
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={cn("flex items-start gap-2 p-2.5 rounded-xl border transition-all",
                      sig.status === "active" ? "border-[#E0568F]/30 bg-[#E0568F]/10" : "border-white/10 bg-white/5"
                    )}>
                    <div className={cn(
                      "shrink-0 w-11 rounded-md text-[9px] font-black flex flex-col items-center justify-center py-1 gap-0.5 mt-0.5",
                      sig.direction === "LONG" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                    )}>
                      {sig.direction === "LONG" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      <span>{sig.direction}</span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5 font-mono">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[13px] font-black text-white tracking-tight">{sig.symbol}</span>
                        <span className="text-[9px] text-slate-400 shrink-0">
                          {t("strategy.minAgo", { n: sig.minutesAgo })}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px]">
                        <span className="text-slate-400">
                          {t("copyTrade.sigEntry")} <span className="text-white font-bold">{fmtPrice(sig.entry)}</span>
                        </span>
                        <span className="text-slate-400">
                          {t("copyTrade.sigTarget")} <span className="text-emerald-400 font-bold">{fmtPrice(sig.target)}</span>
                        </span>
                        <span className="text-slate-400">
                          {t("copyTrade.sigStop")} <span className="text-red-400 font-bold">{fmtPrice(sig.stop)}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                          <motion.div
                            className={cn("h-full rounded-full",
                              sig.confidence >= 7.5 ? "bg-emerald-500" : sig.confidence >= 6 ? "bg-amber-400" : "bg-red-500")}
                            initial={{ width: 0 }}
                            animate={{ width: `${sig.confidence * 10}%` }}
                            transition={{ duration: 0.6, delay: i * 0.04 }}
                          />
                        </div>
                        <span className={cn("text-[9px] font-bold shrink-0",
                          sig.confidence >= 7.5 ? "text-emerald-400" : sig.confidence >= 6 ? "text-amber-400" : "text-red-400")}>
                          AI {sig.confidence.toFixed(1)}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight truncate">{t(sig.reasonKey)}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-slate-500 flex items-center gap-1">
                          <Bot className="h-2.5 w-2.5 text-[#E0568F]" /> {sig.agentName}
                        </span>
                        <span className={cn("ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded",
                          sig.status === "active" ? "bg-blue-500/15 text-blue-400" : "bg-emerald-500/10 text-emerald-400")}>
                          {sig.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            <div className="px-3 py-2 border-t border-white/10 bg-black/20 shrink-0">
              <div className="grid grid-cols-3 gap-1 text-[9px] font-mono text-center">
                <div>
                  <div className="text-slate-400">{t("copyTrade.total")}</div>
                  <div className="text-white font-bold">{signals.length}</div>
                </div>
                <div>
                  <div className="text-slate-400">{t("copyTrade.filled")}</div>
                  <div className="text-emerald-400 font-bold">{signals.filter(s => s.status === "filled").length}</div>
                </div>
                <div>
                  <div className="text-slate-400">{t("copyTrade.activeLabel")}</div>
                  <div className="text-blue-400 font-bold animate-pulse">{activeSignals.length}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
