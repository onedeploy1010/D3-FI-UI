import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { cn } from "@ai/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Radio, Zap, TrendingUp, TrendingDown, Clock, ArrowRight,
  FlaskConical, Target, Gauge, ShieldCheck,
} from "lucide-react";
import { useTrainedAgents } from "../CopyTrade/hooks/useTrainedAgents";
import { usePreference } from "@ai/hooks/usePreference";
import type { TrainedAgent } from "../CopyTrade/types";

const ENABLED_KEY = "signal_agents_enabled";

const MARKETS = [
  { name: "Fed rate cut by September 2026?", side: ["YES", "NO"] },
  { name: "BTC above $150K by year end?", side: ["YES", "NO"] },
  { name: "ETH ETF net inflows this quarter?", side: ["YES", "NO"] },
  { name: "US recession declared in 2026?", side: ["YES", "NO"] },
  { name: "AI chip export rules loosened?", side: ["YES", "NO"] },
  { name: "SOL flips BNB by market cap?", side: ["YES", "NO"] },
  { name: "Eurozone inflation under 2% in Q3?", side: ["YES", "NO"] },
  { name: "OPEC+ extends production cuts?", side: ["YES", "NO"] },
];

interface GeneratedSignal {
  id: string;
  agent: TrainedAgent;
  market: string;
  side: string;
  entry: number;
  confidence: number;
  sizePct: number;
  minutesAgo: number;
  reasonKey: string;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function generateSignals(agents: TrainedAgent[], hourBucket: number): GeneratedSignal[] {
  const out: GeneratedSignal[] = [];
  for (const agent of agents) {
    const base = hashStr(agent.id) + hourBucket;
    const count = 2 + (base % 2);
    for (let i = 0; i < count; i++) {
      const seed = base + i * 7919;
      const m = MARKETS[seed % MARKETS.length];
      const side = m.side[seed % 2];
      const confidence = Math.min(96, Math.round(agent.winRate * 0.7 + 25 + (seed % 14)));
      out.push({
        id: `${agent.id}-${hourBucket}-${i}`,
        agent,
        market: m.name,
        side,
        entry: 0.25 + ((seed % 50) / 100),
        confidence,
        sizePct: agent.riskLevel === "high" ? 8 + (seed % 5) : agent.riskLevel === "medium" ? 5 + (seed % 4) : 2 + (seed % 3),
        minutesAgo: 3 + (seed % 55),
        reasonKey: `strategy.signalReason${(seed % 4) + 1}`,
      });
    }
  }
  return out.sort((a, b) => a.minutesAgo - b.minutesAgo);
}

const RISK_STYLE: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-500 border-emerald-500/25",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/25",
  high: "bg-rose-500/10 text-rose-500 border-rose-500/25",
};

export default function SignalAgents() {
  const { t } = useTranslation();
  const { agents } = useTrainedAgents();
  const [enabled, setEnabled] = usePreference<string[]>(ENABLED_KEY, []);
  const [hourBucket, setHourBucket] = useState(() => Math.floor(Date.now() / 3_600_000));

  // Prune enabled ids for agents that no longer exist
  useEffect(() => {
    setEnabled(prev => {
      const valid = prev.filter(id => agents.some(a => a.id === id));
      return valid.length === prev.length ? prev : valid;
    });
  }, [agents]);

  // Refresh signal feed when the hour bucket rolls over
  useEffect(() => {
    const timer = setInterval(() => {
      setHourBucket(prev => {
        const next = Math.floor(Date.now() / 3_600_000);
        return next === prev ? prev : next;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const toggle = (id: string) =>
    setEnabled(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const activeAgents = useMemo(
    () => agents.filter(a => enabled.includes(a.id)),
    [agents, enabled],
  );
  const signals = useMemo(
    () => generateSignals(activeAgents, hourBucket),
    [activeAgents, hourBucket],
  );

  if (agents.length === 0) {
    return (
      <div className="rounded-2xl card-premium glass p-10 text-center">
        <Bot className="h-10 w-10 mx-auto mb-4 text-muted-foreground/30" />
        <div className="text-sm font-bold mb-1">{t("strategy.noTrainedAgentsTitle")}</div>
        <p className="text-xs text-muted-foreground mb-5 max-w-sm mx-auto">{t("strategy.noTrainedAgentsDesc")}</p>
        <Link href="/ai-hub">
          <Button size="sm" className="h-9">
            <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
            {t("strategy.goToTraining")}
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Agent selection ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            <Bot className="h-3.5 w-3.5 text-primary" /> {t("strategy.signalAgentsTitle")}
          </div>
          <span className="text-[10px] text-muted-foreground">
            {t("strategy.activeSignalAgents", { count: activeAgents.length })}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{t("strategy.signalAgentsDesc")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {agents.map(agent => {
            const on = enabled.includes(agent.id);
            return (
              <motion.div key={agent.id} layout
                className={cn("rounded-2xl border p-4 transition-all",
                  on ? "border-primary/40 bg-primary/5" : "border-border/40 bg-white/3"
                )}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate flex items-center gap-1.5">
                      {agent.name}
                      {on && <Radio className="h-3 w-3 text-emerald-500 animate-pulse shrink-0" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{agent.strategy} · {agent.model}</div>
                  </div>
                  <Badge variant="outline" className={cn("text-[9px] shrink-0", RISK_STYLE[agent.riskLevel])}>
                    {t(`strategy.risk_${agent.riskLevel}`)}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <div className="text-[9px] text-muted-foreground flex items-center gap-1"><Target className="h-2.5 w-2.5" /> {t("strategy.winRateLabel")}</div>
                    <div className="text-xs font-black font-mono text-emerald-500">{agent.winRate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-muted-foreground flex items-center gap-1"><Gauge className="h-2.5 w-2.5" /> Sharpe</div>
                    <div className="text-xs font-black font-mono">{agent.sharpeRatio.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-2.5 w-2.5" /> {t("strategy.scoreLabel")}</div>
                    <div className="text-xs font-black font-mono text-primary">{agent.score}</div>
                  </div>
                </div>
                <Button size="sm" variant={on ? "secondary" : "default"} className="w-full h-8 text-xs"
                  onClick={() => toggle(agent.id)}>
                  {on ? t("strategy.signalsOn") : t("strategy.enableSignals")}
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Signal feed ── */}
      <div className="border-t border-border/40 pt-5">
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
          <Zap className="h-3.5 w-3.5 text-amber-400" /> {t("strategy.liveSignals")}
          {activeAgents.length > 0 && (
            <span className="flex items-center gap-1 text-[9px] text-emerald-500 normal-case font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
            </span>
          )}
        </div>

        {activeAgents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center text-xs text-muted-foreground">
            <Radio className="h-6 w-6 mx-auto mb-2 opacity-25" />
            {t("strategy.noActiveAgents")}
          </div>
        ) : (
          <div className="space-y-2.5">
            <AnimatePresence>
              {signals.map((sig, i) => {
                const isYes = sig.side === "YES";
                return (
                  <motion.div key={sig.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-2xl card-premium glass p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                      isYes ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                      {isYes ? <TrendingUp className="h-4.5 w-4.5" /> : <TrendingDown className="h-4.5 w-4.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold">{sig.market}</span>
                        <Badge variant="outline" className={cn("text-[9px]",
                          isYes ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25" : "bg-rose-500/10 text-rose-500 border-rose-500/25")}>
                          {isYes ? t("strategy.buyYes") : t("strategy.buyNo")} @ {sig.entry.toFixed(2)}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">{t(sig.reasonKey)}</div>
                      <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Bot className="h-2.5 w-2.5 text-primary" /> {sig.agent.name}</span>
                        <span>·</span>
                        <span>{sig.agent.strategy}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {t("strategy.minAgo", { n: sig.minutesAgo })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 sm:text-right">
                      <div>
                        <div className="text-[9px] text-muted-foreground">{t("strategy.confidence")}</div>
                        <div className={cn("text-sm font-black font-mono",
                          sig.confidence >= 80 ? "text-emerald-500" : sig.confidence >= 65 ? "text-amber-500" : "text-muted-foreground")}>
                          {sig.confidence}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-muted-foreground">{t("strategy.suggestedSize")}</div>
                        <div className="text-sm font-black font-mono">{sig.sizePct}%</div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
