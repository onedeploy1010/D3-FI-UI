import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@ai/lib/utils";
import {
  Users, Pause, Play, Trash2, TrendingUp, TrendingDown,
  ChevronRight, Shield, Zap, Flame, ExternalLink, Rocket,
  CheckCircle, BarChart2, AlertCircle,
} from "lucide-react";
import type { WatchlistEntry } from "./types";

const CATEGORY_CONFIG = {
  conservative: {
    label: "Conservative",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    glow: "hover:shadow-[0_0_20px_rgba(59,130,246,0.12)]",
    icon: <Shield className="h-3.5 w-3.5" />,
  },
  stable: {
    label: "Stable",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    glow: "hover:shadow-[0_0_20px_rgba(16,185,129,0.12)]",
    icon: <BarChart2 className="h-3.5 w-3.5" />,
  },
  aggressive: {
    label: "Aggressive",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    glow: "hover:shadow-[0_0_20px_rgba(245,158,11,0.12)]",
    icon: <Flame className="h-3.5 w-3.5" />,
  },
};

function AllocationSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide w-16">{t("copyTrade.allocation")}</span>
      <input
        type="range"
        min={1}
        max={30}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-primary cursor-pointer"
      />
      <span className="text-[11px] font-bold font-mono text-primary w-8 text-right">{value}%</span>
    </div>
  );
}

interface Props {
  entries: WatchlistEntry[];
  onRemove: (address: string) => void;
  onToggle: (address: string) => void;
  onSetAllocation: (address: string, alloc: number) => void;
  onFollowAll: () => void;
}

export function SmartCopyWatchlist({ entries, onRemove, onToggle, onSetAllocation, onFollowAll }: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | "conservative" | "stable" | "aggressive">("all");
  const [following, setFollowing] = useState(false);

  const groups: Array<"conservative" | "stable" | "aggressive"> = ["conservative", "stable", "aggressive"];
  const filtered = filter === "all" ? entries : entries.filter(e => e.riskCategory === filter);

  const totalAlloc = entries.filter(e => !e.paused).reduce((s, e) => s + e.allocation, 0);
  const totalPnl = entries.reduce((s, e) => s + e.trader.openPnl, 0);

  const handleFollowAll = () => {
    setFollowing(true);
    setTimeout(() => setFollowing(false), 2000);
    onFollowAll();
  };

  if (entries.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 3, repeat: Infinity }}
          className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4"
        >
          <Users className="h-7 w-7 text-primary" />
        </motion.div>
        <h3 className="font-bold text-lg mb-1.5">{t("copyTrade.watchlistEmpty")}</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {t("copyTrade.watchlistEmptyDesc")}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <ChevronRight className="h-3 w-3 text-primary" />
          {t("copyTrade.goToRankings")}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + stats */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border/30 bg-gradient-to-r from-primary/5 via-card to-card p-4 sm:p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-xl tracking-tight">{t("copyTrade.myWatchlist")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {entries.length} traders · {entries.filter(e => !e.paused).length} active · {totalAlloc.toFixed(0)}% allocated
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{t("copyTrade.portfolioPnl")}</div>
              <div className={cn("text-lg font-black font-mono", totalPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                {totalPnl >= 0 ? "+" : ""}${(Math.abs(totalPnl) / 1000).toFixed(1)}K
              </div>
            </div>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Button
                className="relative overflow-hidden"
                onClick={handleFollowAll}
                disabled={following}
              >
                {following ? (
                  <motion.span className="flex items-center gap-1.5"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                    {t("copyTrade.followed")}
                  </motion.span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Rocket className="h-4 w-4" />
                    {t("copyTrade.followAll")}
                  </span>
                )}
                <span className="absolute inset-0 shimmer-bg opacity-0 hover:opacity-100 transition-opacity duration-500" />
              </Button>
            </motion.div>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto scrollbar-none">
          {(["all", ...groups] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all border",
                filter === f
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-white/3 text-muted-foreground border-border/30 hover:border-border/60"
              )}
            >
              {f === "all"
                ? `All (${entries.length})`
                : `${CATEGORY_CONFIG[f].label} (${entries.filter(e => e.riskCategory === f).length})`}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Grouped list */}
      {(filter === "all" ? groups : [filter as "conservative" | "stable" | "aggressive"]).map(cat => {
        const group = filtered.filter(e => e.riskCategory === cat);
        if (group.length === 0) return null;
        const cfg = CATEGORY_CONFIG[cat];

        return (
          <div key={cat}>
            <div className={cn("flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider", cfg.color)}>
              {cfg.icon}
              {cfg.label} ({group.length})
            </div>
            <div className="space-y-3">
              <AnimatePresence>
                {group.map((entry, i) => {
                  const tr = entry.trader;
                  const isPos = tr.openPnl >= 0;
                  return (
                    <motion.div
                      key={tr.address}
                      layout
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 16, height: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={cn(
                        "rounded-2xl border p-4 transition-all",
                        cfg.border, cfg.bg, cfg.glow,
                        entry.paused && "opacity-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Identity */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm">{tr.name}</span>
                            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", cfg.bg, cfg.color, `border ${cfg.border}`)}>
                              {cfg.label}
                            </span>
                            {entry.paused && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t("copyTrade.paused").toUpperCase()}</span>
                            )}
                          </div>
                          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                            {tr.address.slice(0, 8)}…{tr.address.slice(-6)}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-xs">
                            <span className="text-muted-foreground">Score <span className={cn("font-black", cfg.color)}>{tr.followScore}</span></span>
                            <span className="text-muted-foreground">Edge <span className="font-bold text-foreground">{tr.edge}</span></span>
                            <span className={cn("font-bold", isPos ? "text-emerald-400" : "text-red-400")}>
                              {isPos ? "+" : ""}${(tr.openPnl / 1000).toFixed(1)}K
                            </span>
                          </div>
                          <AllocationSlider
                            value={entry.allocation}
                            onChange={v => onSetAllocation(tr.address, v)}
                          />
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={`https://polymarket.com/profile/${tr.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-primary transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          <button
                            onClick={() => onToggle(tr.address)}
                            className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                            title={entry.paused ? t("copyTrade.resume") : t("copyTrade.pause")}
                          >
                            {entry.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => onRemove(tr.address)}
                            className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                            title={t("copyTrade.remove")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* AI reason */}
                      {tr.aiReason && (
                        <div className="mt-3 pt-3 border-t border-white/5 flex items-start gap-2">
                          <Zap className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                          <p className="text-[10px] text-muted-foreground italic">{tr.aiReason}</p>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        );
      })}

      {/* Allocation warning */}
      {totalAlloc > 80 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {t("copyTrade.allocationWarning", { totalAlloc })}
        </motion.div>
      )}
    </div>
  );
}
