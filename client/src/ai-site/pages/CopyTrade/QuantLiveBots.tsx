import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@ai/lib/utils";
import { useGetExchangeConnections } from "@ai/api-client-react";
import {
  Bot, Play, Pause, Square, Zap, Cpu, TrendingUp, TrendingDown,
  Activity, AlertCircle, CheckCircle, Settings2, Plus, Trash2,
  Link, BarChart2, ArrowUpRight, Clock, Shield, Flame,
} from "lucide-react";
import type { TrainedAgent, LiveBot } from "./types";

function seededRnd(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function makeLiveBot(agent: TrainedAgent, exchange: string, allocation: number, idx: number): LiveBot {
  const r = (i: number) => seededRnd(agent.score + idx * 7 + i);
  const running = r(0) > 0.3;
  const pnlPct = -8 + r(1) * 40;
  return {
    id: `bot_${agent.id}_${exchange}_${idx}`,
    agentId: agent.id,
    agentName: agent.name,
    strategy: agent.strategy,
    exchange,
    allocation,
    maxDrawdown: agent.maxDrawdown,
    autoConfig: true,
    status: running ? "running" : r(2) > 0.5 ? "paused" : "stopped",
    pnl: parseFloat((pnlPct * allocation * 10).toFixed(2)),
    pnlPct: parseFloat(pnlPct.toFixed(2)),
    trades: Math.round(r(3) * 200 + 10),
    startedAt: new Date(Date.now() - r(4) * 1000 * 3600 * 72).toISOString(),
  };
}

const EXCHANGES = [
  { id: "polymarket", label: "Polymarket", logo: "🔷" },
  { id: "binance", label: "Binance", logo: "🟡" },
  { id: "bybit", label: "Bybit", logo: "🔶" },
  { id: "okx", label: "OKX", logo: "⚫" },
];

const STATUS_CFG = {
  running: { label: "Running", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse" },
  paused: { label: "Paused", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", dot: "bg-amber-500" },
  stopped: { label: "Stopped", color: "text-muted-foreground", bg: "bg-white/5 border-border/20", dot: "bg-muted-foreground" },
};

// ── Deploy dialog ─────────────────────────────────────────────────────────────
function DeployDialog({
  candidates,
  onDeploy,
  onClose,
}: {
  candidates: TrainedAgent[];
  onDeploy: (bot: LiveBot) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [agentId, setAgentId] = useState(candidates[0]?.id ?? "");
  const [exchange, setExchange] = useState("polymarket");
  const [allocation, setAllocation] = useState(10);
  const [autoConfig, setAutoConfig] = useState(true);
  const { data: connections } = useGetExchangeConnections();

  const agent = candidates.find(c => c.id === agentId);

  const handleDeploy = () => {
    if (!agent) return;
    const bot = makeLiveBot(agent, exchange, allocation, Date.now());
    bot.status = "running";
    bot.autoConfig = autoConfig;
    onDeploy(bot);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-primary/20 bg-card shadow-[0_32px_64px_rgba(0,0,0,0.6)] overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/20 bg-gradient-to-r from-primary/5 to-transparent flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-base">{t("copyTrade.deployLiveBot")}</h3>
            <p className="text-xs text-muted-foreground">{t("copyTrade.deployLiveBotDesc")}</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Agent selector */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">{t("copyTrade.candidateAgent")}</label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="bg-white/4 border-border/30">
                <SelectValue placeholder="Select agent…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — Score {c.score} ({c.strategy})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Exchange selector */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">{t("copyTrade.targetExchange")}</label>
            <div className="grid grid-cols-2 gap-2">
              {EXCHANGES.map(ex => (
                <button
                  key={ex.id}
                  onClick={() => setExchange(ex.id)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all",
                    exchange === ex.id
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-white/3 border-border/30 text-muted-foreground hover:border-border/60"
                  )}
                >
                  <span className="text-base">{ex.logo}</span>
                  {ex.label}
                  {connections?.some(c => c.exchange.toLowerCase() === ex.id) && (
                    <span className="ml-auto text-[8px] bg-emerald-500/10 text-emerald-400 px-1 py-0.5 rounded font-bold">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Allocation slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted-foreground">{t("copyTrade.capitalAllocation")}</label>
              <span className="text-sm font-black text-primary font-mono">{allocation}%</span>
            </div>
            <input type="range" min={1} max={50} value={allocation} onChange={e => setAllocation(Number(e.target.value))}
              className="w-full h-1.5 accent-primary cursor-pointer" />
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
              <span>1%</span><span>25%</span><span>50%</span>
            </div>
          </div>

          {/* Agent preview stats */}
          {agent && (
            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-white/3 border border-border/20">
              {[
                { label: "Score", value: agent.score, color: "text-primary" },
                { label: "Win Rate", value: `${agent.winRate.toFixed(1)}%`, color: "text-emerald-400" },
                { label: "Sharpe", value: agent.sharpeRatio.toFixed(2), color: "text-blue-400" },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className="text-[8px] text-muted-foreground uppercase">{s.label}</div>
                  <div className={cn("text-sm font-black font-mono", s.color)}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Auto config toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/3 border border-border/20">
            <div>
              <div className="text-sm font-semibold">{t("copyTrade.aiAutoConfigure")}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{t("copyTrade.aiAutoConfigureDesc")}</div>
            </div>
            <Switch checked={autoConfig} onCheckedChange={setAutoConfig} />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-10" onClick={onClose}>{t("copyTrade.cancel")}</Button>
            <Button className="flex-1 h-10 font-bold relative overflow-hidden group/btn" onClick={handleDeploy} disabled={!agent}>
              <Bot className="h-4 w-4 mr-1.5" /> {t("copyTrade.deployBot")}
              <span className="absolute inset-0 shimmer-bg opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Bot card ──────────────────────────────────────────────────────────────────
function BotCard({
  bot,
  onToggle,
  onStop,
}: {
  bot: LiveBot;
  onToggle: (id: string) => void;
  onStop: (id: string) => void;
}) {
  const { t } = useTranslation();
  const cfg = STATUS_CFG[bot.status];
  const isPos = bot.pnlPct >= 0;
  const exchange = EXCHANGES.find(e => e.id === bot.exchange) ?? EXCHANGES[0];
  const hours = Math.round((Date.now() - new Date(bot.startedAt).getTime()) / 3600000);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, height: 0 }}
      className={cn(
        "rounded-2xl border p-4 sm:p-5 transition-all",
        bot.status === "running"
          ? "border-emerald-500/20 bg-emerald-500/3 hover:shadow-[0_0_20px_rgba(16,185,129,0.08)]"
          : "border-border/30 bg-white/3 opacity-75"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <div className={cn("w-2 h-2 rounded-full shrink-0", cfg.dot)} />
            <span className="font-bold text-sm">{bot.agentName}</span>
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border", cfg.color, cfg.bg)}>
              {cfg.label}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">{bot.strategy}</p>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="text-sm">{exchange.logo}</span> {exchange.label}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {hours}h running</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onToggle(bot.id)}
            className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
            title={bot.status === "running" ? t("copyTrade.pause") : t("copyTrade.resume")}
          >
            {bot.status === "running" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={() => onStop(bot.id)}
            className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
            title={t("copyTrade.stop")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "PnL", value: `${isPos ? "+" : ""}${bot.pnlPct.toFixed(2)}%`, color: isPos ? "text-emerald-400" : "text-red-400" },
          { label: "Allocation", value: `${bot.allocation}%`, color: "text-foreground" },
          { label: "Trades", value: String(bot.trades), color: "text-blue-400" },
          { label: "Max DD", value: `-${bot.maxDrawdown.toFixed(1)}%`, color: "text-red-400/80" },
        ].map(s => (
          <div key={s.label} className="bg-white/3 rounded-xl p-2.5 text-center">
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider mb-0.5">{s.label}</div>
            <div className={cn("text-xs font-black font-mono", s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Auto config indicator */}
      {bot.autoConfig && (
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-primary/60">
          <Zap className="h-3 w-3" /> {t("copyTrade.aiAutoConfigured")}
        </div>
      )}
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  agents: import("./types").TrainedAgent[];
}

export function QuantLiveBots({ agents }: Props) {
  const { t } = useTranslation();
  const candidates = agents.filter(a => a.isCandidate);
  const [bots, setBots] = useState<LiveBot[]>(() => {
    // Pre-populate a few demo bots from candidates if available
    return candidates.slice(0, 2).map((a, i) =>
      makeLiveBot(a, EXCHANGES[i % EXCHANGES.length].id, 10 + i * 5, i)
    );
  });
  const [deployOpen, setDeployOpen] = useState(false);

  const handleDeploy = (bot: LiveBot) => {
    setBots(prev => [bot, ...prev]);
  };

  const handleToggle = (id: string) => {
    setBots(prev => prev.map(b => b.id === id
      ? { ...b, status: b.status === "running" ? "paused" : "running" }
      : b
    ));
  };

  const handleStop = (id: string) => {
    setBots(prev => prev.filter(b => b.id !== id));
  };

  // Portfolio summary
  const running = bots.filter(b => b.status === "running");
  const totalPnl = bots.reduce((s, b) => s + b.pnl, 0);
  const totalAlloc = running.reduce((s, b) => s + b.allocation, 0);

  if (candidates.length === 0 && bots.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20 text-center">
        <motion.div
          animate={{ rotate: [0, 360] }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
          <Bot className="h-7 w-7 text-primary" />
        </motion.div>
        <h3 className="font-bold text-lg mb-1.5">{t("copyTrade.noCandidateAgents")}</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {t("copyTrade.goToMyAgents")}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border/30 bg-gradient-to-r from-emerald-500/5 via-card to-card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-xl tracking-tight">{t("copyTrade.liveExchangeBots")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {bots.length} bots total · {running.length} running · {totalAlloc}% capital deployed
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{t("copyTrade.totalPnl")}</div>
              <div className={cn("text-xl font-black font-mono", totalPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toFixed(0)}
              </div>
            </div>
            <Button
              className="relative overflow-hidden group/btn"
              onClick={() => setDeployOpen(true)}
              disabled={candidates.length === 0}
            >
              <Plus className="h-4 w-4 mr-1.5" /> {t("copyTrade.deployBot")}
              <span className="absolute inset-0 shimmer-bg opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />
            </Button>
          </div>
        </div>

        {/* Candidates badge */}
        {candidates.length > 0 && (
          <div className="mt-4 flex items-center gap-2 text-xs">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-muted-foreground">{candidates.length} {t("copyTrade.candidatesReady")}:</span>
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {candidates.map(c => (
                <span key={c.id} className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {c.name} ({c.score})
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Exchange health */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {EXCHANGES.map((ex, i) => {
          const botCount = bots.filter(b => b.exchange === ex.id && b.status === "running").length;
          return (
            <motion.div key={ex.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className={cn(
                "rounded-xl border p-3 flex items-center gap-2.5 transition-all",
                botCount > 0 ? "border-emerald-500/20 bg-emerald-500/5" : "border-border/20 bg-white/2"
              )}>
              <span className="text-xl">{ex.logo}</span>
              <div>
                <div className="text-xs font-bold">{ex.label}</div>
                <div className={cn("text-[9px]", botCount > 0 ? "text-emerald-400" : "text-muted-foreground")}>
                  {botCount > 0 ? `${botCount} bot${botCount > 1 ? "s" : ""} active` : "Idle"}
                </div>
              </div>
              {botCount > 0 && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Bot list */}
      {bots.length > 0 ? (
        <div className="space-y-3">
          <AnimatePresence>
            {bots.map(bot => (
              <BotCard key={bot.id} bot={bot} onToggle={handleToggle} onStop={handleStop} />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-10 text-sm text-muted-foreground">
          {t("copyTrade.noBotsDeployed")}
        </div>
      )}

      {/* Deploy dialog */}
      <AnimatePresence>
        {deployOpen && (
          <DeployDialog candidates={candidates} onDeploy={handleDeploy} onClose={() => setDeployOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
