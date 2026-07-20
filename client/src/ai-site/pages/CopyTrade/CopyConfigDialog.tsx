import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@ai/lib/utils";
import { Bot, Shield, Zap, Flame, Copy, CheckCircle, TrendingUp, Target, Activity } from "lucide-react";
import type { Trader, AIAgent } from "./types";
import { useToast } from "@ai/hooks/use-toast";
import { apiHeaders } from "@ai/api-client-react";
import { aiFetch } from "@/lib/aiApi";

type RiskPref = "conservative" | "balanced" | "aggressive";
type CopyMode = "percent" | "threshold" | "fixed";

const ALLOC_PRESETS = [
  { label: "25%", value: "25" },
  { label: "50%", value: "50" },
  { label: "75%", value: "75" },
  { label: "100%", value: "100" },
];

const RISK_OPTIONS = [
  {
    key: "conservative" as const,
    labelKey: "copyTrade.conservative",
    subKey: "copyTrade.lowRisk",
    icon: <Shield className="h-4 w-4" />,
    border: "border-emerald-500/40 bg-emerald-500/8",
    active: "border-emerald-500 bg-emerald-500/12 text-emerald-400 shadow-[0_0_20px_rgba(34,197,94,0.15)]",
    color: "text-emerald-400",
  },
  {
    key: "balanced" as const,
    labelKey: "copyTrade.balanced",
    subKey: "copyTrade.mediumRisk",
    icon: <Zap className="h-4 w-4" />,
    border: "border-blue-500/40 bg-blue-500/8",
    active: "border-primary bg-primary/12 text-primary shadow-[0_0_20px_rgba(59,130,246,0.2)]",
    color: "text-primary",
  },
  {
    key: "aggressive" as const,
    labelKey: "copyTrade.aggressive",
    subKey: "copyTrade.highRisk",
    icon: <Flame className="h-4 w-4" />,
    border: "border-orange-500/40 bg-orange-500/8",
    active: "border-orange-500 bg-orange-500/12 text-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.15)]",
    color: "text-orange-400",
  },
];

export function CopyConfigDialog({
  open,
  trader,
  onClose,
}: {
  open: boolean;
  trader: Trader | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [riskPref, setRiskPref] = useState<RiskPref>("balanced");
  const [copyMode, setCopyMode] = useState<CopyMode>("percent");
  const [allocation, setAllocation] = useState("20");
  const [infiniteMode, setInfiniteMode] = useState(true);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [slippage, setSlippage] = useState("5.0");
  const [autoSlippage, setAutoSlippage] = useState(true);
  const [agentId, setAgentId] = useState("balanced-pro");
  const [starting, setStarting] = useState(false);

  const { data: agents = [] } = useQuery<AIAgent[]>({
    queryKey: ["ai-agents"],
    queryFn: () => aiFetch<AIAgent[]>("/copytrade/ai-agents", { headers: apiHeaders() }),
    staleTime: 60000,
  });

  const handleStart = async () => {
    setStarting(true);
    await new Promise(r => setTimeout(r, 1400));
    setStarting(false);
    const agent = (agents as AIAgent[]).find(a => a.id === agentId);
    toast({
      title: t("copyTrade.copyTradeStarted"),
      description: t("copyTrade.copyingToast", { trader: trader?.name ?? "trader", alloc: allocation, agent: agent?.name ?? agentId }),
    });
    onClose();
  };

  const selectedAgent = (agents as AIAgent[]).find(a => a.id === agentId);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto p-0 gap-0 border-border/60 bg-card/95 backdrop-blur-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/20 bg-gradient-to-r from-primary/5 to-purple-500/5">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Copy className="h-4 w-4 text-primary" />
            </motion.div>
            {t("copyTrade.copyTrader")}
          </DialogTitle>
          {trader && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 mt-1.5"
            >
              <span className="font-bold text-foreground">{trader.name}</span>
              <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full border border-white/8">
                {trader.address.slice(0, 8)}…{trader.address.slice(-4)}
              </span>
              <span className="ml-auto text-[11px] font-mono">
                {t("copyTrade.scoreLabel")} <span className="text-primary font-black glow-score">{trader.followScore}</span>
              </span>
            </motion.div>
          )}
        </div>

        <div className="p-5">
          <Tabs defaultValue="mode" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-9 mb-5 bg-white/5 border border-border/30">
              <TabsTrigger value="mode" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t("copyTrade.mode")}</TabsTrigger>
              <TabsTrigger value="risk" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t("copyTrade.riskFilter")}</TabsTrigger>
              <TabsTrigger value="agent" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t("copyTrade.aiAgent")}</TabsTrigger>
            </TabsList>

            {/* ── Mode tab ─────────────────────────────────────────── */}
            <TabsContent value="mode" className="space-y-5 mt-0">
              {/* Risk preference */}
              <div>
                <Label className="text-xs text-muted-foreground mb-3 block font-medium uppercase tracking-wider">{t("copyTrade.riskPreference")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {RISK_OPTIONS.map(opt => (
                    <motion.button
                      key={opt.key}
                      onClick={() => setRiskPref(opt.key)}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className={cn(
                        "flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all text-xs font-semibold",
                        riskPref === opt.key ? opt.active : `border-border/40 text-muted-foreground hover:${opt.border}`
                      )}
                    >
                      <span className={riskPref === opt.key ? opt.color : ""}>{opt.icon}</span>
                      <span>{t(opt.labelKey)}</span>
                      <span className="text-[9px] font-normal opacity-70">{t(opt.subKey)}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Copy mode */}
              <div>
                <Label className="text-xs text-muted-foreground mb-3 block font-medium uppercase tracking-wider">{t("copyTrade.copyMode")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "percent", label: t("copyTrade.percentAmount"), icon: "%" },
                    { key: "threshold", label: t("copyTrade.threshold"), icon: "≥" },
                    { key: "fixed", label: t("copyTrade.fixedDollar"), icon: "$" },
                  ] as const).map(m => (
                    <motion.button
                      key={m.key}
                      onClick={() => setCopyMode(m.key)}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className={cn(
                        "flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all",
                        copyMode === m.key
                          ? "border-primary bg-primary/10 text-primary shadow-[0_0_16px_rgba(59,130,246,0.2)]"
                          : "border-border/40 text-muted-foreground hover:border-border"
                      )}
                    >
                      <span className="text-xl font-black">{m.icon}</span>
                      <span className="text-xs font-semibold">{m.label}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Allocation input */}
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block font-medium uppercase tracking-wider">
                  {copyMode === "percent" ? t("copyTrade.allocationPercent") : copyMode === "fixed" ? t("copyTrade.fixedAmount") : t("copyTrade.minThreshold")}
                </Label>
                <div className="flex items-center gap-2 mb-2">
                  <Input
                    value={allocation}
                    onChange={e => setAllocation(e.target.value)}
                    className="font-mono text-base bg-white/4 border-border/30 focus:border-primary/40"
                    type="number"
                  />
                  <span className="text-sm text-muted-foreground shrink-0 w-6">{copyMode === "percent" ? "%" : "$"}</span>
                </div>
                {copyMode === "percent" && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {ALLOC_PRESETS.map(p => (
                      <motion.button
                        key={p.value}
                        onClick={() => setAllocation(p.value)}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        className={cn(
                          "py-1.5 text-xs font-bold rounded-lg border transition-all",
                          allocation === p.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/40 text-muted-foreground hover:border-border/70"
                        )}
                      >
                        {p.label}
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>

              {/* Infinite mode */}
              <motion.div
                className="flex items-start justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5"
                whileHover={{ borderColor: "rgba(59,130,246,0.35)", backgroundColor: "rgba(59,130,246,0.08)" }}
              >
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold">{t("copyTrade.infiniteMode")}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">{t("copyTrade.recommended")}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("copyTrade.infiniteModeDesc")}
                  </p>
                </div>
                <Switch checked={infiniteMode} onCheckedChange={setInfiniteMode} />
              </motion.div>
            </TabsContent>

            {/* ── Risk & Filter tab ─────────────────────────────── */}
            <TabsContent value="risk" className="space-y-5 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block font-medium uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> {t("copyTrade.takeProfit")} ($)
                    </span>
                  </Label>
                  <Input value={takeProfit} onChange={e => setTakeProfit(e.target.value)} placeholder={t("copyTrade.unlimited")} className="font-mono bg-white/4 border-emerald-500/20 focus:border-emerald-500/40" />
                  <p className="text-[10px] text-muted-foreground mt-1">{t("copyTrade.takeProfitDesc")}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block font-medium uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> {t("copyTrade.stopLoss")} ($)
                    </span>
                  </Label>
                  <Input value={stopLoss} onChange={e => setStopLoss(e.target.value)} placeholder={t("copyTrade.unlimited")} className="font-mono bg-white/4 border-red-500/20 focus:border-red-500/40" />
                  <p className="text-[10px] text-muted-foreground mt-1">{t("copyTrade.stopLossDesc")}</p>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-3 block font-medium uppercase tracking-wider">{t("copyTrade.slippageTolerance")}</Label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { label: t("copyTrade.autoDynamic"), value: true },
                    { label: t("copyTrade.fixed"), value: false },
                  ].map(opt => (
                    <motion.button
                      key={String(opt.value)}
                      onClick={() => setAutoSlippage(opt.value)}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className={cn(
                        "py-2 text-xs font-bold rounded-xl border-2 transition-all",
                        autoSlippage === opt.value
                          ? "border-primary bg-primary/10 text-primary shadow-[0_0_12px_rgba(59,130,246,0.15)]"
                          : "border-border/40 text-muted-foreground"
                      )}
                    >
                      {opt.label}
                    </motion.button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0 text-muted-foreground">{t("copyTrade.maxSlippage")}</Label>
                  <Input
                    value={slippage}
                    onChange={e => setSlippage(e.target.value)}
                    className="font-mono bg-white/4 border-border/30"
                    type="number"
                    step="0.5"
                    disabled={autoSlippage}
                  />
                  <span className="text-sm text-muted-foreground shrink-0">%</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  {t("copyTrade.slippageDesc")}
                </p>
              </div>
            </TabsContent>

            {/* ── AI Agent tab ──────────────────────────────────── */}
            <TabsContent value="agent" className="space-y-3 mt-0">
              <p className="text-xs text-muted-foreground mb-3">{t("copyTrade.chooseAIAgent")}</p>
              <AnimatePresence>
                {(agents as AIAgent[]).map((agent, i) => (
                  <motion.button
                    key={agent.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setAgentId(agent.id)}
                    className={cn(
                      "w-full text-left rounded-xl border-2 p-3.5 transition-all",
                      agentId === agent.id
                        ? "border-primary/50 bg-primary/8 shadow-[0_0_20px_rgba(59,130,246,0.12)]"
                        : "border-border/40 hover:border-border/70 hover:bg-white/3"
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <motion.div
                          animate={agentId === agent.id ? { scale: [1, 1.15, 1] } : {}}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <Bot className={cn("h-4 w-4", agentId === agent.id ? "text-primary" : "text-muted-foreground")} />
                        </motion.div>
                        <span className="font-bold text-sm">{agent.name}</span>
                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase",
                          agent.riskLevel === "low" ? "bg-emerald-500/15 text-emerald-400" :
                          agent.riskLevel === "medium" ? "bg-amber-500/15 text-amber-400" :
                          "bg-red-500/15 text-red-400"
                        )}>
                          {t(`copyTrade.risk${agent.riskLevel.charAt(0).toUpperCase() + agent.riskLevel.slice(1)}`)}
                        </span>
                      </div>
                      {agentId === agent.id && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 400 }}
                        >
                          <CheckCircle className="h-4 w-4 text-primary" />
                        </motion.div>
                      )}
                    </div>

                    {/* Metrics row */}
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {[
                        { icon: <Target className="h-3 w-3" />, label: t("copyTrade.winRateMetric"), value: `${agent.winRate}%`, color: "text-emerald-400" },
                        { icon: <TrendingUp className="h-3 w-3" />, label: t("copyTrade.avgRoiMetric"), value: `+${agent.avgRoi}%`, color: "text-primary" },
                        { icon: <Activity className="h-3 w-3" />, label: t("copyTrade.maxDDMetric"), value: `${agent.maxDrawdown}%`, color: "text-red-400" },
                      ].map(m => (
                        <div key={m.label} className="bg-white/4 rounded-lg p-2">
                          <div className="flex items-center gap-1 text-[9px] text-muted-foreground mb-0.5">
                            {m.icon} {m.label}
                          </div>
                          <div className={cn("text-xs font-bold font-mono", m.color)}>{m.value}</div>
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">{agent.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {agent.features.map(f => (
                        <span key={f} className="text-[9px] bg-white/5 border border-white/8 px-1.5 py-0.5 rounded-full text-muted-foreground">{f}</span>
                      ))}
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 border-border/40">{t("copyTrade.cancel")}</Button>
          <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={handleStart}
              disabled={starting}
              className="w-full relative overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {starting ? (
                  <>
                    <motion.span
                      className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    />
                    {t("copyTrade.connecting")}
                  </>
                ) : (
                  <>{t("copyTrade.startCopyTrade")}</>
                )}
              </span>
              {!starting && <span className="absolute inset-0 shimmer-bg opacity-0 hover:opacity-100 transition-opacity duration-500" />}
            </Button>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
