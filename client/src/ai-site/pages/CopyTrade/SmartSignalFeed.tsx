import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@ai/lib/utils";
import {
  Zap, TrendingUp, TrendingDown, Target, ShieldAlert, Radio,
  Trophy, Users, Settings2, ChevronRight, CircleStop, Clock,
} from "lucide-react";
import type { WatchlistEntry } from "./types";

export interface ActiveFollow {
  strategyId: string;
  strategyName: string;
  startedAt: number;
  params: {
    maxPositionPct: number;
    stopLossBuffer: number;
    minFollowScore: number;
    lagLimit: number;
  };
}

interface AdviceSignal {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  target: number;
  stopLoss: number;
  confidence: number;
  traderName: string;
  minutesAgo: number;
  reasonKey: string;
}

const PAIRS: { symbol: string; base: number }[] = [
  { symbol: "BTC/USDT", base: 97400 },
  { symbol: "ETH/USDT", base: 3620 },
  { symbol: "SOL/USDT", base: 212 },
  { symbol: "BNB/USDT", base: 645 },
  { symbol: "XRP/USDT", base: 2.31 },
  { symbol: "DOGE/USDT", base: 0.324 },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function fmtP(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 10) return p.toFixed(2);
  return p.toFixed(4);
}

function generateSignals(entries: WatchlistEntry[], follow: ActiveFollow): AdviceSignal[] {
  const bucket = Math.floor(Date.now() / 600_000);
  const active = entries.filter(e => !e.paused && e.trader.followScore >= follow.params.minFollowScore);
  const signals: AdviceSignal[] = [];
  active.forEach(entry => {
    const seedBase = hashStr(entry.trader.address) + bucket * 13 + hashStr(follow.strategyId);
    const count = 1 + (seedBase % 2);
    for (let k = 0; k < count; k++) {
      const seed = seedBase + k * 977;
      const pair = PAIRS[seed % PAIRS.length];
      const isLong = seed % 3 !== 1;
      const movePct = (1.2 + (seed % 28) / 10) / 100;
      const entryPrice = pair.base * (1 + ((seed % 21) - 10) / 4000);
      const target = isLong ? entryPrice * (1 + movePct) : entryPrice * (1 - movePct);
      const stopLoss = isLong
        ? entryPrice * (1 - follow.params.stopLossBuffer / 100 / 3)
        : entryPrice * (1 + follow.params.stopLossBuffer / 100 / 3);
      signals.push({
        id: `${entry.trader.address}-${k}-${bucket}`,
        symbol: pair.symbol,
        direction: isLong ? "LONG" : "SHORT",
        entry: entryPrice,
        target,
        stopLoss,
        confidence: 58 + (seed % 37),
        traderName: entry.trader.name,
        minutesAgo: 1 + (seed % 42),
        reasonKey: `copyTrade.sfReason${(seed % 4) + 1}`,
      });
    }
  });
  return signals.sort((a, b) => a.minutesAgo - b.minutesAgo).slice(0, 10);
}

interface Props {
  entries: WatchlistEntry[];
  activeFollow: ActiveFollow | null;
  onStop: () => void;
  onGoRankings: () => void;
  onGoConfig: () => void;
}

export function SmartSignalFeed({ entries, activeFollow, onStop, onGoRankings, onGoConfig }: Props) {
  const { t } = useTranslation();

  const signals = useMemo(
    () => (activeFollow ? generateSignals(entries, activeFollow) : []),
    [entries, activeFollow],
  );

  if (!activeFollow) {
    const hasTraders = entries.length > 0;
    const steps = [
      { icon: <Trophy className="h-4 w-4" />, text: t("copyTrade.sfStep1"), done: hasTraders },
      { icon: <Settings2 className="h-4 w-4" />, text: t("copyTrade.sfStep2"), done: false },
      { icon: <Zap className="h-4 w-4" />, text: t("copyTrade.sfStep3"), done: false },
    ];
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center py-14 text-center">
        <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 3, repeat: Infinity }}
          className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
          <Radio className="h-7 w-7 text-primary" />
        </motion.div>
        <h3 className="font-bold text-lg mb-1.5">{t("copyTrade.sfEmptyTitle")}</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">{t("copyTrade.sfEmptyDesc")}</p>
        <div className="w-full max-w-md space-y-2.5 text-left">
          {steps.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className={cn("flex items-center gap-3 rounded-xl border p-3.5",
                s.done ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/40 bg-card/60")}>
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                s.done ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary")}>
                {s.icon}
              </div>
              <span className={cn("text-sm font-semibold flex-1", s.done && "text-emerald-600")}>
                {i + 1}. {s.text}
              </span>
              {s.done && <span className="text-[10px] font-black text-emerald-600">✓</span>}
            </motion.div>
          ))}
        </div>
        <div className="flex items-center gap-2.5 mt-6">
          {!hasTraders && (
            <Button variant="outline" onClick={onGoRankings} className="gap-1.5">
              <Trophy className="h-4 w-4" /> {t("copyTrade.sfGoRankings")}
            </Button>
          )}
          <Button onClick={onGoConfig} className="gap-1.5">
            <Settings2 className="h-4 w-4" /> {t("copyTrade.sfGoConfig")}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </motion.div>
    );
  }

  const activeTraders = entries.filter(e => !e.paused).length;
  const startedStr = new Date(activeFollow.startedAt).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="space-y-4">
      {/* Running status */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/8 via-card to-card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <div className="font-black text-base flex items-center gap-2 flex-wrap">
                {t("copyTrade.sfRunning")}
                <span className="text-primary">{activeFollow.strategyName}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                <Users className="h-3 w-3" /> {activeTraders} {t("copyTrade.traders")}
                <span>·</span>
                <Clock className="h-3 w-3" /> {t("copyTrade.sfSince")} {startedStr}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onStop}
            className="gap-1.5 text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-500 shrink-0">
            <CircleStop className="h-4 w-4" /> {t("copyTrade.sfStopBtn")}
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {[
            { label: t("copyTrade.maxPositionPct"), value: `${activeFollow.params.maxPositionPct}%` },
            { label: t("copyTrade.stopLossBuffer"), value: `${activeFollow.params.stopLossBuffer}%` },
            { label: t("copyTrade.minFollowScore"), value: `${activeFollow.params.minFollowScore}` },
            { label: t("copyTrade.lagLimitSec"), value: `${activeFollow.params.lagLimit}s` },
          ].map(chip => (
            <span key={chip.label} className="text-[10px] px-2 py-1 rounded-lg bg-muted text-muted-foreground border border-border/40">
              {chip.label}: <span className="font-bold text-foreground">{chip.value}</span>
            </span>
          ))}
        </div>
      </motion.div>

      {/* Signal list */}
      {signals.length === 0 ? (
        <div className="rounded-2xl border border-border/40 bg-card/60 p-8 text-center text-sm text-muted-foreground">
          {t("copyTrade.sfNoActive")}
        </div>
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence>
            {signals.map((sig, i) => {
              const isLong = sig.direction === "LONG";
              return (
                <motion.div key={sig.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-2xl border border-border/40 bg-card/60 p-4 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                        isLong ? "bg-emerald-500/12 text-emerald-600" : "bg-red-500/12 text-red-500")}>
                        {isLong ? <TrendingUp className="h-4.5 w-4.5" /> : <TrendingDown className="h-4.5 w-4.5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm font-mono">{sig.symbol}</span>
                          <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded-md border",
                            isLong
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25"
                              : "bg-red-500/10 text-red-500 border-red-500/25")}>
                            {sig.direction}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/8 text-primary border border-primary/20 font-bold">
                            {sig.confidence}%
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {t("copyTrade.sfFrom")} <span className="font-semibold text-foreground/80">{sig.traderName}</span>
                          <span className="mx-1">·</span>{sig.minutesAgo} {t("copyTrade.sfMinAgo")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="text-muted-foreground">{t("copyTrade.sfEntry")} <span className="font-bold text-foreground">${fmtP(sig.entry)}</span></span>
                      <span className="flex items-center gap-1 text-emerald-600"><Target className="h-3 w-3" /> ${fmtP(sig.target)}</span>
                      <span className="flex items-center gap-1 text-red-500"><ShieldAlert className="h-3 w-3" /> ${fmtP(sig.stopLoss)}</span>
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2.5 border-t border-border/40 flex items-start gap-1.5">
                    <Zap className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                    <p className="text-[11px] text-muted-foreground">{t(sig.reasonKey)}</p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
