import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useGetAiHubStatus, useGetSimLeaderboard, useGetSimulationRuns } from "@ai/api-client-react";
import { cn } from "@ai/lib/utils";
import { formatPercent, formatCompactNumber, formatCurrency, formatDateTime } from "@ai/lib/format";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Zap, CheckCircle2,
  Shield, ChevronRight, RefreshCw,
  Bot, Activity, Target, Copy, Database, Network,
  MessageSquare, Settings2, Play, Pause, Award,
  PlayCircle, Clock, AlertCircle, BookOpen, Repeat, Link2,
  FlaskConical, Users, Wallet,
  Dumbbell, GitBranch, ShieldCheck, Eye,
  LayoutDashboard,
  Sparkles, Flame, Hexagon, Orbit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@ai/hooks/use-toast";
import { QuantTrainingLab } from "@ai/pages/CopyTrade/QuantTrainingLab";
import { QuantMyAgents } from "@ai/pages/CopyTrade/QuantMyAgents";
import { QuantSignalBots } from "@ai/pages/CopyTrade/QuantSignalBots";
import { useTrainedAgents } from "@ai/pages/CopyTrade/hooks/useTrainedAgents";
import type { TrainedAgent } from "@ai/pages/CopyTrade/types";

type BotStatus = "active" | "scanning" | "executing" | "idle";

const STATUS_CFG: Record<BotStatus, { label: string; labelZh: string; dot: string; badge: string; icon: ReactNode }> = {
  active:    { label: "TRAINING",  labelZh: "训练中", dot: "bg-emerald-400 animate-pulse", badge: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400", icon: <Dumbbell className="h-3.5 w-3.5" /> },
  scanning:  { label: "LEARNING",  labelZh: "学习中", dot: "bg-amber-400 animate-ping",    badge: "bg-amber-500/10 border-amber-500/20 text-amber-400",       icon: <Eye className="h-3.5 w-3.5" /> },
  executing: { label: "EXECUTING", labelZh: "执行中", dot: "bg-blue-400 animate-pulse",    badge: "bg-blue-500/10 border-blue-500/20 text-blue-400",          icon: <Zap className="h-3.5 w-3.5" /> },
  idle:      { label: "IDLE",      labelZh: "待命",   dot: "bg-zinc-500",                   badge: "bg-zinc-500/10 border-zinc-500/20 text-zinc-400",          icon: <RefreshCw className="h-3.5 w-3.5" /> },
};

const AGENTS = [
  {
    id: "analyst", name: "ANALYST", fullNameKey: "aiHub.agentAnalystName",
    icon: <Brain className="h-6 w-6" />, color: "text-gold", border: "border-gold/25",
    glow: "shadow-[0_0_24px_rgba(218,165,32,0.2)]", bg: "from-gold/8 to-transparent",
    badge: "bg-gold/10 text-gold border-gold/20",
    roleKey: "aiHub.agentAnalystRole",
    descKey: "aiHub.agentAnalystDesc",
    capKeys: ["aiHub.agentAnalystCap1", "aiHub.agentAnalystCap2", "aiHub.agentAnalystCap3", "aiHub.agentAnalystCap4"],
    trainingStats: { epoch: 847, accuracy: 78.3, loss: 0.024, lr: 0.0003 },
    metricLabelKey: "aiHub.accuracy", metricValue: "78.3%",
  },
  {
    id: "sentinel", name: "SENTINEL", fullNameKey: "aiHub.agentSentinelName",
    icon: <Shield className="h-6 w-6" />, color: "text-crimson", border: "border-crimson/25",
    glow: "shadow-[0_0_24px_rgba(200,50,50,0.2)]", bg: "from-crimson/8 to-transparent",
    badge: "bg-crimson/10 text-crimson border-crimson/20",
    roleKey: "aiHub.agentSentinelRole",
    descKey: "aiHub.agentSentinelDesc",
    capKeys: ["aiHub.agentSentinelCap1", "aiHub.agentSentinelCap2", "aiHub.agentSentinelCap3", "aiHub.agentSentinelCap4"],
    trainingStats: { epoch: 612, accuracy: 91.7, loss: 0.011, lr: 0.0001 },
    metricLabelKey: "aiHub.riskScore", metricValue: "28/100",
  },
  {
    id: "replica", name: "REPLICA", fullNameKey: "aiHub.agentReplicaName",
    icon: <Copy className="h-6 w-6" />, color: "text-violet-400", border: "border-violet-500/25",
    glow: "shadow-[0_0_24px_rgba(139,92,246,0.2)]", bg: "from-violet-500/8 to-transparent",
    badge: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    roleKey: "aiHub.agentReplicaRole",
    descKey: "aiHub.agentReplicaDesc",
    capKeys: ["aiHub.agentReplicaCap1", "aiHub.agentReplicaCap2", "aiHub.agentReplicaCap3", "aiHub.agentReplicaCap4"],
    trainingStats: { epoch: 534, accuracy: 72.1, loss: 0.038, lr: 0.0005 },
    metricLabelKey: "aiHub.tradersLearned", metricValue: "7",
  },
  {
    id: "arbiter", name: "ARBITER", fullNameKey: "aiHub.agentArbiterName",
    icon: <Zap className="h-6 w-6" />, color: "text-amber-400", border: "border-amber-400/25",
    glow: "shadow-[0_0_24px_rgba(251,191,36,0.2)]", bg: "from-amber-400/8 to-transparent",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    roleKey: "aiHub.agentArbiterRole",
    descKey: "aiHub.agentArbiterDesc",
    capKeys: ["aiHub.agentArbiterCap1", "aiHub.agentArbiterCap2", "aiHub.agentArbiterCap3", "aiHub.agentArbiterCap4"],
    trainingStats: { epoch: 923, accuracy: 84.6, loss: 0.019, lr: 0.0002 },
    metricLabelKey: "aiHub.arbAccuracy", metricValue: "84.6%",
  },
];

const TRAINING_PIPELINE = [
  { id: "ingest", icon: <BookOpen className="h-5 w-5" />, color: "text-blue-400", count: 12 },
  { id: "rl",     icon: <Dumbbell className="h-5 w-5" />, color: "text-violet-400", count: 847 },
  { id: "sim",    icon: <FlaskConical className="h-5 w-5" />, color: "text-amber-400", count: 100 },
  { id: "verify", icon: <ShieldCheck className="h-5 w-5" />, color: "text-emerald-400", count: 38 },
];

const STRATEGY_FEED = [
  { name: "Order Flow Momentum",   source: "Knowledge Base", status: "training", confidence: 82, agents: ["ANALYST", "ARBITER"] },
  { name: "Mean Reversion Pro",    source: "Marketplace",    status: "training", confidence: 74, agents: ["ANALYST"] },
  { name: "Whale Copy Pattern",    source: "Copy-Trade",     status: "learning", confidence: 68, agents: ["REPLICA"] },
  { name: "Multi-TF Trend",        source: "Knowledge Base", status: "complete", confidence: 91, agents: ["ANALYST", "SENTINEL"] },
  { name: "Breakout Hunter v3",    source: "Knowledge Base", status: "training", confidence: 77, agents: ["ARBITER"] },
  { name: "Statistical Arb Alpha", source: "Marketplace",    status: "queued",   confidence: 0,  agents: ["ARBITER"] },
];

const COPY_TRADE_LEARNERS = [
  { trader: "sovereign2013", pseudo: "Ultimate-Locality",     winRate: 82.4, trades: 1247, learning: 94, status: "active" },
  { trader: "elkmonkey",     pseudo: "Unconscious-Penguin",   winRate: 78.1, trades: 892,  learning: 87, status: "active" },
  { trader: "BigFishSushiChief", pseudo: "Super-Cornerstone", winRate: 75.6, trades: 634, learning: 71, status: "active" },
  { trader: "Bonereaper",    pseudo: "Popular-Insurrection",  winRate: 73.2, trades: 1089, learning: 65, status: "paused" },
  { trader: "bmoneyyyyy",    pseudo: "Heavy-Melatonin",       winRate: 71.8, trades: 567,  learning: 58, status: "active" },
];

const ONCHAIN_RESULTS = [
  { market: "BTC > $80K by May?", prediction: "YES", confidence: 78, result: "correct", pnl: +2340, txHash: "0x7a3f...e21b", verified: true },
  { market: "Fed rate cut June?",  prediction: "NO",  confidence: 62, result: "correct", pnl: +890,  txHash: "0x4c8d...f39a", verified: true },
  { market: "ETH > $5K Sept?",    prediction: "YES", confidence: 71, result: "pending", pnl: 0,     txHash: "0x9e1a...b47c", verified: true },
  { market: "Lakers playoffs?",   prediction: "NO",  confidence: 85, result: "correct", pnl: +1560, txHash: "0x2b7f...d82e", verified: true },
  { market: "Spain wins WC 2026?", prediction: "NO", confidence: 88, result: "pending", pnl: 0,     txHash: "0x5d3c...a19f", verified: true },
];

function AgentTrainingCard({ agent, status, onToggle }: { agent: typeof AGENTS[0]; status: BotStatus; onToggle: () => void }) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const stCfg = STATUS_CFG[status];
  const ts = agent.trainingStats;
  const isZh = i18n.language === "zh";

  return (
    <motion.div layout whileHover={{ y: -3, scale: 1.01 }}
      className={cn("rounded-2xl card-premium glass p-5 transition-all cursor-default relative overflow-hidden", agent.border,
        status !== "idle" && agent.glow)}>
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60 pointer-events-none", agent.bg)} />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex items-center gap-3">
            <div className={cn("w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 relative", agent.border,
              status !== "idle" ? "bg-white/8" : "bg-white/4")}>
              <span className={agent.color}>{agent.icon}</span>
              {status !== "idle" && (
                <span className={cn("absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background", stCfg.dot)} />
              )}
            </div>
            <div>
              <div className={cn("text-base sm:text-lg font-black font-mono tracking-wide glow-text", agent.color)}>{agent.name}</div>
              <div className="text-xs sm:text-sm text-muted-foreground/80">{t(agent.fullNameKey)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold glass", stCfg.badge)}>
              {stCfg.icon} {isZh ? stCfg.labelZh : stCfg.label}
            </div>
            <button onClick={onToggle}
              className={cn("p-2 rounded-lg transition-all btn-3d-secondary", status === "idle" ? "text-muted-foreground hover:text-foreground" : cn("hover:opacity-70", agent.color))}>
              {status === "idle" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="text-xs sm:text-sm text-muted-foreground/70 mb-4">{t(agent.roleKey)}</div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          {[
            { l: t("aiHub.epoch"), v: ts.epoch.toLocaleString(), c: agent.color },
            { l: t("aiHub.accuracy"), v: `${ts.accuracy}%`, c: "text-emerald-400" },
            { l: t("aiHub.loss"), v: ts.loss.toFixed(3), c: "text-amber-400" },
            { l: t("aiHub.learningRate"), v: ts.lr.toString(), c: "text-muted-foreground" },
          ].map(s => (
            <div key={s.l} className="glass rounded-lg px-2.5 py-2 text-center">
              <div className={cn("text-sm sm:text-base font-black font-mono", s.c)}>{s.v}</div>
              <div className="text-[9px] sm:text-[10px] text-muted-foreground/50 uppercase tracking-wider">{s.l}</div>
            </div>
          ))}
        </div>

        {status !== "idle" && (
          <div className="mb-4">
            <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground/50 mb-1.5">
              <span>{t("aiHub.trainingProgress")}</span>
              <span className={agent.color}>{ts.accuracy}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <motion.div className={cn("h-full rounded-full bg-gradient-to-r",
                agent.id === "analyst" ? "from-gold to-amber-400" :
                agent.id === "sentinel" ? "from-crimson to-rose-400" :
                agent.id === "replica" ? "from-violet-500 to-purple-400" :
                "from-amber-500 to-yellow-400")}
                initial={{ width: 0 }} animate={{ width: `${ts.accuracy}%` }}
                transition={{ duration: 2, ease: "easeOut" }} />
            </div>
          </div>
        )}

        <button onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors w-full">
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
          {expanded ? t("aiHub.hide") : t("aiHub.capabilitiesConfig")}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              <div className="pt-4 space-y-3">
                <p className="text-xs sm:text-sm text-muted-foreground/60 leading-relaxed">{t(agent.descKey)}</p>
                <div className="space-y-1.5">
                  {agent.capKeys.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground/70">
                      <CheckCircle2 className={cn("h-3.5 w-3.5 shrink-0", agent.color)} /> {t(c)}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className={cn("h-9 text-xs flex-1 btn-3d-secondary", agent.border, agent.color)}>
                    <Settings2 className="h-3.5 w-3.5 mr-1.5" /> {t("aiHub.configure")}
                  </Button>
                  <Button size="sm" variant="outline" className={cn("h-9 text-xs flex-1 btn-3d-secondary", agent.border, agent.color)}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> {t("aiHub.connectChannel")}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function NeuralBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-10">
      {Array.from({ length: 24 }).map((_, i) => (
        <motion.div key={i} className="w-1 rounded-t-sm bg-gold/40"
          animate={active ? { height: ["20%", `${30 + Math.sin(i * 0.7) * 50}%`, "20%"], backgroundColor: ["rgba(218,165,32,0.25)", "rgba(218,165,32,0.8)", "rgba(218,165,32,0.25)"] } : { height: "10%" }}
          transition={{ duration: 0.8 + (i % 5) * 0.2, repeat: Infinity, delay: i * 0.05, ease: "easeInOut" }}
          style={{ minHeight: 3 }} />
      ))}
    </div>
  );
}

function OracleGrid() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
      <div className="absolute inset-0 terminal-grid" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-gold/5 blur-[100px]" />
    </div>
  );
}

const TAB_ITEMS = [
  { id: "overview",   icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "training",   icon: <FlaskConical className="h-4 w-4" /> },
  { id: "agents",     icon: <Bot className="h-4 w-4" /> },
  { id: "validation", icon: <ShieldCheck className="h-4 w-4" /> },
] as const;

type TabId = typeof TAB_ITEMS[number]["id"];

export default function AiHub() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language === "zh";
  const { data: status } = useGetAiHubStatus();
  const { data: leaderboard, isLoading: isLoadingLeaderboard } = useGetSimLeaderboard({ limit: 10 });
  const { data: simRuns, isLoading: isLoadingSimRuns } = useGetSimulationRuns();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [agentStates, setAgentStates] = useState<Record<string, BotStatus>>({
    analyst: "active", sentinel: "active", replica: "scanning", arbiter: "executing",
  });
  const { agents: trainedAgents, addAgents, updateAgent, toggleCandidate } = useTrainedAgents();

  const handleDeployAgents = (agents: TrainedAgent[]) => {
    addAgents(agents);
    toast({
      title: t("copyTrade.deployToastTitle"),
      description: t("copyTrade.deployToastDesc", { count: agents.length }),
    });
    setTimeout(() => setActiveTab("agents"), 700);
  };

  const toggleAgent = (id: string) => {
    setAgentStates(prev => {
      const cur = prev[id];
      const next = cur === "idle" ? "active" : "idle";
      toast({ title: `${id.toUpperCase()} ${next === "active" ? t("aiHub.activated") : t("aiHub.paused")}`, description: next === "active" ? t("aiHub.agentRunning") : t("aiHub.agentPaused") });
      return { ...prev, [id]: next };
    });
  };

  const activeCount = Object.values(agentStates).filter(s => s !== "idle").length;
  const lb = (leaderboard ?? []) as any[];
  const runs = (simRuns ?? []) as any[];
  const totalEpochs = AGENTS.reduce((s, a) => s + a.trainingStats.epoch, 0);
  const avgAccuracy = +(AGENTS.reduce((s, a) => s + a.trainingStats.accuracy, 0) / AGENTS.length).toFixed(1);
  const verifiedCount = ONCHAIN_RESULTS.filter(r => r.verified).length;
  const correctCount = ONCHAIN_RESULTS.filter(r => r.result === "correct").length;

  return (
    <div className="space-y-6 pb-24 sm:pb-12 min-h-[calc(100dvh-80px)] relative">
      <OracleGrid />

      <div className="relative z-10 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold/20 to-crimson/10 flex items-center justify-center border border-gold/20">
              <Sparkles className="h-5 w-5 text-gold" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight gradient-text-gold font-display">
              {t("aiHub.title")}
            </h2>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground/70 mt-1 max-w-xl">
            {t("aiHub.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden sm:block"><NeuralBars active={activeCount > 0} /></div>
          <div className="text-right glass rounded-xl px-4 py-3 oracle-glow">
            <div className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-widest">{t("aiHub.system")}</div>
            <div className="text-sm font-bold text-emerald-400 flex items-center gap-2 glow-text-green mt-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 pulse-green" />
              {t("common.online")}
            </div>
          </div>
        </div>
      </div>

      {/* Master Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: t("aiHub.learningProgress"),  value: `${status?.learningProgress ?? 80}%`, icon: <Brain className="h-5 w-5" />,       color: "text-gold",     glowCls: "oracle-glow", showBar: true, barVal: status?.learningProgress ?? 80 },
          { label: t("aiHub.simAccounts"),        value: formatCompactNumber(status?.totalSimAccounts ?? 100), icon: <Database className="h-5 w-5" />,    color: "text-blue-400",    glowCls: "" },
          { label: t("aiHub.activeAgents"),       value: `${activeCount}/${AGENTS.length}`,    icon: <Network className="h-5 w-5" />,     color: "text-emerald-400", glowCls: "" },
          { label: t("aiHub.totalEpochs"),        value: formatCompactNumber(totalEpochs),     icon: <Repeat className="h-5 w-5" />,      color: "text-violet-400",  glowCls: "" },
          { label: t("aiHub.avgAccuracy"),        value: `${avgAccuracy}%`,                    icon: <Target className="h-5 w-5" />,      color: "text-amber-400",   glowCls: "" },
          { label: t("aiHub.onChainVerified"),    value: `${verifiedCount}`,                   icon: <ShieldCheck className="h-5 w-5" />, color: "text-cyan-400",    glowCls: "" },
        ].map(s => (
          <motion.div key={s.label} whileHover={{ y: -2, scale: 1.02 }}
            className={cn("rounded-2xl card-premium glass px-4 py-4", s.glowCls)}>
            <div className={cn("mb-2", s.color)}>{s.icon}</div>
            <div className={cn("text-xl sm:text-2xl font-black font-mono stat-value", s.color)}>{s.value}</div>
            <div className="text-[9px] sm:text-[10px] text-muted-foreground/70 mt-1.5 uppercase tracking-wider font-semibold">{s.label}</div>
            {"showBar" in s && s.showBar && <Progress value={s.barVal} className="h-2 mt-2.5" />}
          </motion.div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none border-b border-gold/15 pb-0">
        {TAB_ITEMS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 sm:px-5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-2 -mb-[1px]",
              activeTab === tab.id
                ? "text-gold border-gold"
                : "text-muted-foreground/50 border-transparent hover:text-muted-foreground hover:border-gold/20"
            )}>
            {tab.icon}
            <span>{t(`aiHub.tab_${tab.id}`)}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}>

          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Training Pipeline */}
              <div className="rounded-2xl card-premium glass p-5 overflow-hidden relative">
                <div className="flex items-center gap-2.5 mb-5">
                  <GitBranch className="h-5 w-5 text-gold" />
                  <span className="text-sm font-bold text-gold/80 uppercase tracking-widest font-mono">{t("aiHub.trainingPipeline")}</span>
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-green" /> {t("aiHub.allStagesActive")}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {TRAINING_PIPELINE.map((stage, i) => (
                    <motion.div key={stage.id}
                      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}
                      whileHover={{ y: -3 }}
                      className="glass rounded-xl p-4 border border-gold/10 hover:border-gold/25 transition-all">
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center glass border border-white/8", stage.color)}>
                          {stage.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn("text-xs sm:text-sm font-bold truncate", stage.color)}>{t(`aiHub.pipeline_${stage.id}`)}</div>
                          <div className="text-[9px] sm:text-[10px] text-muted-foreground/50">{t(`aiHub.pipelineDesc_${stage.id}`)}</div>
                        </div>
                      </div>
                      <div className={cn("text-xl sm:text-2xl font-black font-mono stat-value", stage.color)}>{stage.count}</div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Quick Agent Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {AGENTS.map(agent => {
                  const st = agentStates[agent.id] ?? "idle";
                  const stCfg = STATUS_CFG[st];
                  return (
                    <motion.div key={agent.id} whileHover={{ y: -3, scale: 1.02 }}
                      className={cn("rounded-2xl card-premium glass p-4 relative overflow-hidden cursor-pointer", agent.border, st !== "idle" && agent.glow)}
                      onClick={() => setActiveTab("agents")}>
                      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-40 pointer-events-none", agent.bg)} />
                      <div className="relative z-10">
                        <div className="flex items-center gap-2.5 mb-3">
                          <span className={agent.color}>{agent.icon}</span>
                          <span className={cn("text-sm sm:text-base font-black font-mono", agent.color)}>{agent.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className={cn("w-2 h-2 rounded-full", stCfg.dot)} />
                          <span className={cn("text-[10px] sm:text-xs font-bold", stCfg.badge.split(" ").pop())}>{isZh ? stCfg.labelZh : stCfg.label}</span>
                        </div>
                        <div className={cn("text-lg sm:text-xl font-black font-mono stat-value", agent.color)}>{agent.metricValue}</div>
                        <div className="text-[9px] sm:text-[10px] text-muted-foreground/50 uppercase mt-1">{t(agent.metricLabelKey)}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Quick Stats: Strategy + Copy-Trade + Simulation */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl card-premium glass p-5 cursor-pointer hover:border-gold/20 transition-all" onClick={() => setActiveTab("training")}>
                  <div className="flex items-center gap-2.5 mb-4">
                    <BookOpen className="h-5 w-5 text-blue-400" />
                    <span className="text-xs sm:text-sm font-bold text-white/50 uppercase tracking-widest">{t("aiHub.tab_strategies")}</span>
                  </div>
                  <div className="text-3xl sm:text-4xl font-black font-mono stat-value text-blue-400">{STRATEGY_FEED.length}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground/50 mt-1">{t("aiHub.strategiesInTraining")}</div>
                  <div className="flex gap-1.5 mt-3">
                    {["training", "learning", "complete", "queued"].map(s => {
                      const c = STRATEGY_FEED.filter(f => f.status === s).length;
                      if (!c) return null;
                      return <span key={s} className="text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-muted-foreground/60">{c} {s}</span>;
                    })}
                  </div>
                </div>
                <div className="rounded-2xl card-premium glass p-5 cursor-pointer hover:border-gold/20 transition-all" onClick={() => setActiveTab("training")}>
                  <div className="flex items-center gap-2.5 mb-4">
                    <Users className="h-5 w-5 text-violet-400" />
                    <span className="text-xs sm:text-sm font-bold text-white/50 uppercase tracking-widest">{t("aiHub.copyTradeLearnTitle")}</span>
                  </div>
                  <div className="text-3xl sm:text-4xl font-black font-mono stat-value text-violet-400">{COPY_TRADE_LEARNERS.length}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground/50 mt-1">{t("aiHub.tradersBeingLearned")}</div>
                  <div className="text-xs font-mono text-emerald-400/70 mt-3">
                    {t("aiHub.avgWinRate")}: {(COPY_TRADE_LEARNERS.reduce((s, c) => s + c.winRate, 0) / COPY_TRADE_LEARNERS.length).toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-2xl card-premium glass p-5 cursor-pointer hover:border-gold/20 transition-all" onClick={() => setActiveTab("validation")}>
                  <div className="flex items-center gap-2.5 mb-4">
                    <Award className="h-5 w-5 text-amber-400" />
                    <span className="text-xs sm:text-sm font-bold text-white/50 uppercase tracking-widest">{t("aiHub.tab_simulation")}</span>
                  </div>
                  <div className="text-3xl sm:text-4xl font-black font-mono stat-value text-amber-400">{lb.length}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground/50 mt-1">{t("aiHub.agentsRanked")}</div>
                  <div className="text-xs font-mono text-muted-foreground/40 mt-3">{runs.length} {t("aiHub.runs")}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "agents" && (
            <div className="space-y-8">
              <QuantMyAgents agents={trainedAgents} onToggleCandidate={toggleCandidate} onUpdateAgent={updateAgent} />
              <QuantSignalBots agents={trainedAgents} />
              <div className="space-y-5 pt-6 border-t border-gold/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Dumbbell className="h-5 w-5 text-gold/60" />
                    <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{t("aiHub.specializedAgents")}</span>
                  </div>
                  <span className="text-xs text-muted-foreground/40">{activeCount} {t("aiHub.training")} · {AGENTS.length - activeCount} {t("aiHub.idleLabel")}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {AGENTS.map(agent => (
                    <AgentTrainingCard key={agent.id} agent={agent} status={agentStates[agent.id] ?? "idle"} onToggle={() => toggleAgent(agent.id)} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "training" && (
            <div className="mb-8">
              <QuantTrainingLab onDeployAgents={handleDeployAgents} />
            </div>
          )}

          {activeTab === "training" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-6 border-t border-gold/10">
              <div className="rounded-2xl card-premium glass overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gold/10">
                  <BookOpen className="h-5 w-5 text-blue-400" />
                  <span className="text-sm font-bold text-gold/60 uppercase tracking-widest font-mono">{t("aiHub.strategyFeed")}</span>
                  <span className="ml-auto text-xs font-mono text-white/25">{STRATEGY_FEED.length} {t("aiHub.strategies")}</span>
                </div>
                <div className="divide-y divide-white/4">
                  {STRATEGY_FEED.map((strat, i) => (
                    <motion.div key={strat.name}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      className="px-5 py-4 hover:bg-gold/3 transition-all">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="text-sm sm:text-base font-bold text-foreground">{strat.name}</div>
                          <div className="text-xs text-muted-foreground/50 font-mono">{t("aiHub.source")}: {strat.source}</div>
                        </div>
                        <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold glass",
                          strat.status === "training" ? "bg-violet-500/10 border-violet-500/20 text-violet-400" :
                          strat.status === "learning" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                          strat.status === "complete" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                          "bg-zinc-500/10 border-zinc-500/20 text-zinc-400")}>
                          {strat.status === "training" ? <Dumbbell className="h-3 w-3" /> :
                           strat.status === "learning" ? <Eye className="h-3 w-3" /> :
                           strat.status === "complete" ? <CheckCircle2 className="h-3 w-3" /> :
                           <Clock className="h-3 w-3" />}
                          {strat.status.toUpperCase()}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {strat.confidence > 0 && (
                          <div className="flex items-center gap-2 flex-1">
                            <div className="h-1.5 rounded-full bg-white/5 flex-1 overflow-hidden">
                              <motion.div className={cn("h-full rounded-full",
                                strat.confidence > 80 ? "bg-emerald-500" : strat.confidence > 60 ? "bg-gold" : "bg-amber-400")}
                                initial={{ width: 0 }} animate={{ width: `${strat.confidence}%` }}
                                transition={{ duration: 1, delay: i * 0.08 }} />
                            </div>
                            <span className="text-xs font-mono text-muted-foreground/60">{strat.confidence}%</span>
                          </div>
                        )}
                        <div className="flex gap-1.5 shrink-0">
                          {strat.agents.map(a => (
                            <span key={a} className="text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-muted-foreground/60 font-mono">{a}</span>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl card-premium glass overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gold/10">
                  <Users className="h-5 w-5 text-violet-400" />
                  <span className="text-sm font-bold text-gold/60 uppercase tracking-widest font-mono">{t("aiHub.copyTradeLearnTitle")}</span>
                  <span className="ml-auto text-xs font-mono text-white/25">{COPY_TRADE_LEARNERS.length} {t("aiHub.traders")}</span>
                </div>
                <div className="divide-y divide-white/4">
                  {COPY_TRADE_LEARNERS.map((trader, i) => (
                    <motion.div key={trader.trader}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className="px-5 py-4 hover:bg-gold/3 transition-all">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                            <Wallet className="h-4 w-4 text-violet-400" />
                          </div>
                          <div>
                            <div className="text-sm sm:text-base font-bold text-foreground">{trader.pseudo}</div>
                            <div className="text-[10px] sm:text-xs text-muted-foreground/40 font-mono">@{trader.trader}</div>
                          </div>
                        </div>
                        <div className={cn("w-2 h-2 rounded-full", trader.status === "active" ? "bg-emerald-400 pulse-green" : "bg-zinc-500")} />
                      </div>
                      <div className="flex items-center gap-4 mt-1.5">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-[10px] sm:text-xs text-muted-foreground/40">{t("aiHub.learningLabel")}:</span>
                          <div className="h-1.5 rounded-full bg-white/5 flex-1 overflow-hidden">
                            <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                              initial={{ width: 0 }} animate={{ width: `${trader.learning}%` }}
                              transition={{ duration: 1.5, delay: i * 0.1 }} />
                          </div>
                          <span className="text-xs font-mono font-bold text-violet-400">{trader.learning}%</span>
                        </div>
                        <span className="text-xs font-mono text-emerald-400 shrink-0">{trader.winRate}% {t("aiHub.winRateShort")}</span>
                        <span className="text-xs font-mono text-muted-foreground/40 shrink-0 hidden sm:inline">{trader.trades} {t("aiHub.trades")}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "validation" && (
            <div className="space-y-5">
              <div className="rounded-2xl card-premium glass overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gold/10">
                  <Award className="h-5 w-5 text-amber-400" />
                  <span className="text-sm font-bold text-gold/60 uppercase tracking-widest font-mono">{t("aiHub.simulationLeaderboard")}</span>
                  <span className="ml-auto text-xs font-mono text-white/25">{lb.length} {t("aiHub.agentsRanked")}</span>
                </div>
                {isLoadingLeaderboard ? (
                  <div className="p-10 text-center text-muted-foreground text-base">{t("aiHub.loadingRankings")}</div>
                ) : lb.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gold/10 text-xs uppercase tracking-wider text-muted-foreground/50">
                          <th className="text-left px-5 py-3">{t("aiHub.rank")}</th>
                          <th className="text-left py-3">{t("aiHub.agent")}</th>
                          <th className="text-right py-3">{t("aiHub.pnl")}</th>
                          <th className="text-right py-3 hidden sm:table-cell">{t("aiHub.winRate")}</th>
                          <th className="text-right py-3 hidden sm:table-cell">{t("aiHub.trades")}</th>
                          <th className="text-right pr-5 py-3">{t("aiHub.roi")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/4">
                        {lb.map((entry: any, i: number) => (
                          <motion.tr key={entry.id ?? i}
                            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                            className="hover:bg-gold/3 transition-colors">
                            <td className="px-5 py-4">
                              <span className={cn("text-base font-black font-mono",
                                i === 0 ? "text-gold" : i === 1 ? "text-zinc-300" : i === 2 ? "text-amber-600" : "text-muted-foreground")}>
                                #{entry.rank ?? i + 1}
                              </span>
                            </td>
                            <td className="py-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                                  <Bot className="h-4 w-4 text-gold" />
                                </div>
                                <div>
                                  <div className="font-bold text-foreground text-sm">{entry.agentName ?? entry.name ?? `Agent-${i+1}`}</div>
                                  <div className="text-xs text-muted-foreground">{entry.strategy ?? "Multi-strategy"}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 text-right font-mono font-bold">
                              <span className={cn(entry.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                                {entry.pnl >= 0 ? "+" : ""}{formatCurrency(entry.pnl ?? 0)}
                              </span>
                            </td>
                            <td className="py-4 text-right font-mono hidden sm:table-cell">
                              {entry.winRate != null ? formatPercent(entry.winRate, 1, false) : "—"}
                            </td>
                            <td className="py-4 text-right font-mono hidden sm:table-cell">
                              {formatCompactNumber(entry.totalTrades ?? 0)}
                            </td>
                            <td className="py-4 text-right pr-5">
                              {entry.roi != null ? (
                                <span className={cn("font-mono font-black text-base", entry.roi > 0 ? "text-emerald-400" : "text-red-400")}>
                                  {entry.roi > 0 ? "+" : ""}{formatPercent(entry.roi, 1, false)}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-10 text-center text-muted-foreground text-base">{t("aiHub.noRankings")}</div>
                )}
              </div>

              <div className="rounded-2xl card-premium glass overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gold/10">
                  <PlayCircle className="h-5 w-5 text-emerald-400" />
                  <span className="text-sm font-bold text-gold/60 uppercase tracking-widest font-mono">{t("aiHub.simulationRuns")}</span>
                  <span className="ml-auto text-xs font-mono text-white/25">{runs.length} {t("aiHub.runs")}</span>
                </div>
                {isLoadingSimRuns ? (
                  <div className="p-10 text-center text-muted-foreground text-base">{t("aiHub.loadingSimHistory")}</div>
                ) : runs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gold/10 text-xs uppercase tracking-wider text-muted-foreground/50">
                          <th className="text-left px-5 py-3">{t("aiHub.agent")}</th>
                          <th className="text-left py-3 hidden sm:table-cell">{t("aiHub.strategy")}</th>
                          <th className="text-center py-3">{t("aiHub.status")}</th>
                          <th className="text-right py-3">{t("aiHub.capital")}</th>
                          <th className="text-right py-3 hidden sm:table-cell">{t("aiHub.trades")}</th>
                          <th className="text-right py-3 hidden sm:table-cell">{t("aiHub.winRate")}</th>
                          <th className="text-right pr-5 py-3">{t("aiHub.roi")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/4">
                        {runs.map((run: any, i: number) => (
                          <motion.tr key={run.id ?? i}
                            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                            className="hover:bg-gold/3 transition-colors">
                            <td className="px-5 py-4">
                              <div className="font-bold text-foreground text-sm">{run.agentName ?? `Agent-${run.agentId}`}</div>
                              <div className="text-xs text-muted-foreground font-mono">{run.createdAt ? formatDateTime(run.createdAt) : ""}</div>
                            </td>
                            <td className="py-4 hidden sm:table-cell">
                              <span className="text-xs bg-white/5 text-muted-foreground px-2.5 py-1 rounded">{run.strategy ?? "Default"}</span>
                            </td>
                            <td className="py-4 text-center">
                              {run.status === "completed" ? (
                                <div className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-bold"><CheckCircle2 className="h-3.5 w-3.5" /> {t("aiHub.done")}</div>
                              ) : run.status === "running" ? (
                                <div className="inline-flex items-center gap-1.5 text-blue-400 text-xs font-bold"><Clock className="h-3.5 w-3.5 animate-pulse" /> {t("aiHub.running")}</div>
                              ) : run.status === "failed" ? (
                                <div className="inline-flex items-center gap-1.5 text-red-400 text-xs font-bold"><AlertCircle className="h-3.5 w-3.5" /> {t("aiHub.failed")}</div>
                              ) : (
                                <Badge variant="outline" className="text-xs">{run.status}</Badge>
                              )}
                            </td>
                            <td className="py-4 text-right font-mono">
                              <div className="text-foreground">{formatCurrency(run.initialCapital ?? 0)}</div>
                              {run.finalCapital != null && (
                                <div className={cn("text-xs mt-0.5", run.finalCapital >= run.initialCapital ? "text-emerald-400" : "text-red-400")}>
                                  → {formatCurrency(run.finalCapital)}
                                </div>
                              )}
                            </td>
                            <td className="py-4 text-right font-mono hidden sm:table-cell">{formatCompactNumber(run.totalTrades ?? 0)}</td>
                            <td className="py-4 text-right font-mono hidden sm:table-cell">
                              {run.winRate != null ? formatPercent(run.winRate, 1, false) : "—"}
                            </td>
                            <td className="py-4 text-right pr-5">
                              {run.roi != null ? (
                                <span className={cn("font-mono text-base font-black", run.roi > 0 ? "text-emerald-400" : "text-red-400")}>
                                  {run.roi > 0 ? "+" : ""}{formatPercent(run.roi, 1, false)}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-10 text-center text-muted-foreground text-base">{t("aiHub.noSimRuns")}</div>
                )}
              </div>
            </div>
          )}

          {activeTab === "validation" && (
            <div className="space-y-5 mt-5 pt-6 border-t border-gold/10">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: t("aiHub.totalPredictions"), value: ONCHAIN_RESULTS.length, color: "text-cyan-400", icon: <ShieldCheck className="h-5 w-5" /> },
                  { label: t("aiHub.correctPredictions"), value: correctCount, color: "text-emerald-400", icon: <CheckCircle2 className="h-5 w-5" /> },
                  { label: t("aiHub.pendingResults"), value: ONCHAIN_RESULTS.filter(r => r.result === "pending").length, color: "text-amber-400", icon: <Clock className="h-5 w-5" /> },
                  { label: t("aiHub.totalPnlOnChain"), value: `+$${ONCHAIN_RESULTS.reduce((s, r) => s + r.pnl, 0).toLocaleString()}`, color: "text-emerald-400", icon: <Activity className="h-5 w-5" /> },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl card-premium glass px-4 py-4">
                    <div className={cn("mb-2", s.color)}>{s.icon}</div>
                    <div className={cn("text-2xl sm:text-3xl font-black font-mono stat-value", s.color)}>{s.value}</div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground/70 mt-1.5 uppercase tracking-wider font-semibold">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl card-premium glass overflow-hidden oracle-glow">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gold/10">
                  <ShieldCheck className="h-5 w-5 text-cyan-400" />
                  <span className="text-sm font-bold text-gold/60 uppercase tracking-widest font-mono">{t("aiHub.onChainVerifiedResults")}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-xs font-mono text-emerald-400">{correctCount}/{verifiedCount} {t("aiHub.correct")}</span>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gold/10 text-xs uppercase tracking-wider text-muted-foreground/50">
                        <th className="text-left px-5 py-3">{t("aiHub.market")}</th>
                        <th className="text-center py-3">{t("aiHub.prediction")}</th>
                        <th className="text-center py-3 hidden sm:table-cell">{t("aiHub.confidenceLabel")}</th>
                        <th className="text-center py-3">{t("aiHub.result")}</th>
                        <th className="text-right py-3">{t("aiHub.pnl")}</th>
                        <th className="text-right pr-5 py-3 hidden sm:table-cell">{t("aiHub.txProof")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/4">
                      {ONCHAIN_RESULTS.map((r, i) => (
                        <motion.tr key={r.txHash}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                          className="hover:bg-gold/3 transition-colors">
                          <td className="px-5 py-4">
                            <div className="text-sm font-medium text-foreground">{r.market}</div>
                          </td>
                          <td className="py-4 text-center">
                            <span className={cn("text-xs sm:text-sm font-black font-mono px-2.5 py-1 rounded-full border glass",
                              r.prediction === "YES" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10" : "text-red-400 border-red-500/20 bg-red-500/10")}>
                              {r.prediction}
                            </span>
                          </td>
                          <td className="py-4 text-center hidden sm:table-cell">
                            <span className="text-sm font-bold font-mono text-foreground">{r.confidence}%</span>
                          </td>
                          <td className="py-4 text-center">
                            {r.result === "correct" ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> {t("aiHub.resultCorrect")}</span>
                            ) : r.result === "pending" ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400"><Clock className="h-3.5 w-3.5 animate-pulse" /> {t("aiHub.resultPending")}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400"><AlertCircle className="h-3.5 w-3.5" /> {t("aiHub.resultWrong")}</span>
                            )}
                          </td>
                          <td className="py-4 text-right font-mono font-bold">
                            {r.pnl > 0 ? <span className="text-emerald-400">+{formatCurrency(r.pnl)}</span> :
                             r.pnl < 0 ? <span className="text-red-400">{formatCurrency(r.pnl)}</span> :
                             <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="py-4 text-right pr-5 hidden sm:table-cell">
                            <a href="#" className="inline-flex items-center gap-1.5 text-xs font-mono text-cyan-400/70 hover:text-cyan-400 transition-colors">
                              <Link2 className="h-3.5 w-3.5" /> {r.txHash}
                            </a>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      </div>
    </div>
  );
}
