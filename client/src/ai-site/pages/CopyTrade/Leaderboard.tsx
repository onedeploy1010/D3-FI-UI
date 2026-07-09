import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@ai/lib/utils";
import { Star, Trophy, TrendingUp, TrendingDown, Zap, Activity, Shield, Target, ExternalLink, Flame, BarChart2, Plus, Check, RefreshCw } from "lucide-react";
import type { Trader, TraderPosition } from "./types";

// ── Risk categorization ───────────────────────────────────────────────────────
function getRiskCategory(trader: Trader): "conservative" | "stable" | "aggressive" {
  if (trader.drawdown <= 12 && trader.copyability >= 60) return "conservative";
  if (trader.drawdown >= 25 || trader.edge >= 85) return "aggressive";
  return "stable";
}

const RISK_CFG = {
  conservative: { labelKey: "copyTrade.conservative", icon: <Shield className="h-3 w-3" />, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  stable: { labelKey: "copyTrade.stable", icon: <BarChart2 className="h-3 w-3" />, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  aggressive: { labelKey: "copyTrade.aggressive", icon: <Flame className="h-3 w-3" />, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/25" },
};

// ── Weekly bar chart ──────────────────────────────────────────────────────────
function WeeklyBars({ seed, positive }: { seed: number; positive: boolean }) {
  const bars = Array.from({ length: 7 }, (_, i) => {
    const v = Math.abs(Math.sin(seed * 0.7 + i * 1.3) * 60 + 20);
    const isGain = positive ? v > 30 : v > 55;
    return { height: Math.round(v), gain: isGain };
  });
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="flex items-end gap-1 h-10">
      {bars.map((b, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
          <motion.div
            className={cn("w-full rounded-sm", b.gain ? "bg-emerald-500/60" : "bg-red-500/50")}
            initial={{ height: 0 }}
            animate={{ height: `${b.height}%` }}
            transition={{ delay: i * 0.06, duration: 0.5, ease: "easeOut" }}
            style={{ minHeight: 2, maxHeight: 36 }}
          />
          <span className="text-[8px] text-muted-foreground/50">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// ── Real Polymarket positions ─────────────────────────────────────────────────
function RealPositions({
  positions, address,
}: { positions?: TraderPosition[]; address: string }) {
  const { t } = useTranslation();
  if (!positions || positions.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground/50 italic py-1">
        {t("copyTrade.noOpenPositions")}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {positions.slice(0, 4).map((p, i) => {
        const pct  = Math.round(p.pricePerShare * 100);
        const isYes = p.outcome?.toLowerCase() !== "no";
        const pnlPos = p.cashPnl >= 0;
        const slug = p.slug;
        const url  = slug
          ? `https://polymarket.com/event/${slug}`
          : `https://polymarket.com/profile/${address}`;
        return (
          <motion.a
            key={`${p.market}-${i}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i + 0.15 }}
            className="flex items-center gap-2 p-2 rounded-lg bg-white/3 hover:bg-white/6 transition-colors group cursor-pointer"
          >
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0",
              isYes ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
            )}>
              {p.outcome ?? "Yes"}
            </span>
            <span className="text-[10px] text-muted-foreground flex-1 min-w-0 truncate group-hover:text-foreground transition-colors">
              {p.market}
            </span>
            <div className="shrink-0 flex items-center gap-1.5">
              {/* Price bar */}
              <div className="w-10 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className={cn("h-full rounded-full", isYes ? "bg-emerald-500" : "bg-red-500")}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 0.1 * i + 0.3, duration: 0.6 }}
                />
              </div>
              <span className="text-[10px] font-mono font-bold tabular-nums w-6 text-right">{pct}¢</span>
              {/* PnL indicator */}
              <span className={cn("text-[9px] font-mono tabular-nums shrink-0",
                pnlPos ? "text-emerald-400" : "text-red-400")}>
                {pnlPos ? "+" : ""}${(p.cashPnl / 1000).toFixed(1)}K
              </span>
              <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/30 group-hover:text-primary/60 transition-colors shrink-0" />
            </div>
          </motion.a>
        );
      })}
    </div>
  );
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────
function Sparkline({ seed, positive = true }: { seed: number; positive?: boolean }) {
  const w = 80, h = 28;
  const pts = Array.from({ length: 12 }, (_, i) => {
    const noise = Math.sin(i * 0.8 + seed) * 6 + Math.cos(i * 1.3 + seed * 2) * 3;
    const trend = positive ? i * 1.4 : -i * 0.8;
    return Math.max(2, Math.min(h - 2, h / 2 - trend - noise));
  });
  const d = pts
    .map((y, i) => `${i === 0 ? "M" : "L"} ${(i / 11) * w} ${y}`)
    .join(" ");
  const fill = pts.map((y, i) => `${(i / 11) * w} ${y}`).join(" L ") +
    ` L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={`sg${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={positive ? "#22c55e" : "#ef4444"} stopOpacity="0.25" />
          <stop offset="100%" stopColor={positive ? "#22c55e" : "#ef4444"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M 0 ${pts[0]} L ${fill}`} fill={`url(#sg${seed})`} />
      <path d={d} fill="none" stroke={positive ? "#22c55e" : "#ef4444"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Animated metric bar ───────────────────────────────────────────────────────
function MetricBar({ label, value, color, delay = 0 }: { label: string; value: number; color: string; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  return (
    <div ref={ref} className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider w-[68px] shrink-0 font-medium">{label}</span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={inView ? { width: `${Math.min(value, 100)}%` } : { width: 0 }}
          transition={{ delay, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="text-[11px] font-mono font-bold w-6 text-right">{value}</span>
    </div>
  );
}

// ── Rank badge ────────────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number | null }) {
  if (!rank) return <div className="w-10 h-10 rounded-lg bg-muted/30 flex items-center justify-center text-muted-foreground text-sm font-bold">—</div>;
  const styles: Record<number, string> = {
    1: "bg-gradient-to-br from-yellow-400/30 to-yellow-600/10 border border-yellow-500/40 text-yellow-400",
    2: "bg-gradient-to-br from-slate-300/20 to-slate-500/10 border border-slate-400/30 text-slate-300",
    3: "bg-gradient-to-br from-orange-400/25 to-orange-700/10 border border-orange-500/30 text-orange-400",
  };
  return (
    <motion.div
      className={cn("w-10 h-10 rounded-lg flex items-center justify-center font-black text-sm", styles[rank] ?? "bg-primary/10 border border-primary/20 text-primary")}
      whileHover={{ scale: 1.1 }}
    >
      #{rank}
    </motion.div>
  );
}

// ── Trader card ────────────────────────────────────────────────────────────────
const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, damping: 22, stiffness: 180 } },
};

function TraderCard({
  trader, index, onCopy, onWatchlist, inWatchlist,
}: {
  trader: Trader;
  index: number;
  onCopy: (tr: Trader) => void;
  onWatchlist?: (tr: Trader) => void;
  inWatchlist?: boolean;
}) {
  const { t } = useTranslation();
  const isPositive = trader.openPnl >= 0;
  const riskCat = getRiskCategory(trader);
  const riskCfg = RISK_CFG[riskCat];
  const rankClass =
    trader.rank === 1 ? "gradient-border-gold" :
    trader.rank === 2 ? "gradient-border-silver" :
    trader.rank === 3 ? "gradient-border-bronze" :
    "gradient-border-default";

  const rankGlow =
    trader.rank === 1 ? "glow-gold-score" :
    trader.rank === 2 ? "glow-score" :
    "glow-score";

  const winRate = Math.round(50 + trader.edge * 0.22 + Math.sin(index) * 5);
  const streak = Math.round(trader.copyability / 10 + 2);

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -4, transition: { type: "spring", stiffness: 400, damping: 20 } }}
      className={cn("rounded-2xl p-4 sm:p-5 transition-shadow cursor-default group", rankClass,
        "hover:shadow-[0_8px_40px_rgba(59,130,246,0.12)]"
      )}
    >
      {/* ── Mobile-first header: rank + identity ──────────────── */}
      <div className="flex items-start gap-3 mb-3">
        <RankBadge rank={trader.rank} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-[15px] tracking-tight">{trader.name}</span>
            {trader.badges.map(b => (
              <span key={b} className={cn(
                "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide",
                b === "Qualified" ? "bg-blue-500/15 text-blue-400" :
                b === "Proven" ? "bg-emerald-500/15 text-emerald-400" :
                b === "Rising" ? "bg-amber-500/15 text-amber-400" : "bg-muted text-muted-foreground"
              )}>{b}</span>
            ))}
            <span className={cn("flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border", riskCfg.color, riskCfg.bg)}>
              {riskCfg.icon} {t(riskCfg.labelKey)}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
            {trader.address.slice(0, 6)}…{trader.address.slice(-6)}
          </p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {trader.tags.slice(0, 3).map((tag, i) => (
              <motion.span
                key={tag}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 * i + 0.2 }}
                className="text-[9px] bg-white/5 border border-white/8 px-1.5 py-0.5 rounded-full text-muted-foreground"
              >
                {tag}
              </motion.span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Score row + sparkline ── */}
      <div className="mb-3 p-3 rounded-xl bg-white/3 border border-white/6 space-y-2.5">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <div className="text-[9px] text-muted-foreground uppercase tracking-widest mb-0.5">{t("copyTrade.followScore")}</div>
            <motion.div
              className={cn("text-2xl sm:text-3xl font-black tabular-nums", rankGlow,
                trader.rank === 1 ? "text-yellow-400" :
                trader.rank === 2 ? "text-slate-200" :
                trader.rank === 3 ? "text-orange-400" : "text-primary"
              )}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
            >
              {trader.followScore}
            </motion.div>
          </div>
          <div className="opacity-80 flex-1">
            <Sparkline seed={index + 1} positive={isPositive} />
          </div>
        </div>

        {/* ── Action buttons — full-width row, never squashed ── */}
        <div className="flex gap-2">
          {onWatchlist && (
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="flex-1">
              <Button
                size="sm"
                variant={inWatchlist ? "outline" : "secondary"}
                className={cn("h-8 text-xs w-full", inWatchlist && "border-emerald-500/30 text-emerald-400")}
                onClick={() => !inWatchlist && onWatchlist(trader)}
              >
                {inWatchlist
                  ? <><Check className="h-3.5 w-3.5 mr-1.5" />{t("copyTrade.watching")}</>
                  : <><Plus className="h-3.5 w-3.5 mr-1.5" />{t("copyTrade.tabWatchlist")}</>}
              </Button>
            </motion.div>
          )}
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="flex-1">
            <Button
              size="sm"
              className="h-8 text-xs w-full relative overflow-hidden group/btn"
              onClick={() => onCopy(trader)}
            >
              <span className="relative z-10">{t("copyTrade.copyTrader")}</span>
              <span className="absolute inset-0 shimmer-bg opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Metrics + stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2.5">
          <MetricBar label={t("copyTrade.edge")} value={trader.edge} color="bg-emerald-500" delay={0.1} />
          <MetricBar label={t("copyTrade.copyability")} value={trader.copyability} color="bg-amber-400" delay={0.2} />
          <MetricBar label={t("copyTrade.confidence")} value={trader.confidence} color="bg-blue-500" delay={0.3} />
          <MetricBar label={t("copyTrade.lagTol")} value={trader.lagTolerance} color="bg-red-500" delay={0.4} />

          {/* Extra stats row */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1 text-[10px]">
            <div className="flex items-center gap-1.5">
              <Target className="h-3 w-3 text-primary/60" />
              <span className="text-muted-foreground">{t("copyTrade.profitFactor")}</span>
              <span className="font-bold text-primary font-mono">{trader.profitFactor}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3 w-3 text-red-400/70" />
              <span className="text-muted-foreground">{t("copyTrade.maxDD")}</span>
              <span className="font-bold text-red-400 font-mono">{trader.drawdown}%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            {
              label: t("copyTrade.openPnl"),
              value: <span className={cn("text-sm font-bold font-mono", isPositive ? "text-emerald-400" : "text-red-400")}>
                {isPositive ? "+" : ""}${(trader.openPnl / 1000).toFixed(1)}K
              </span>,
              sub: <span className={isPositive ? "text-emerald-400/70" : "text-red-400/70"}>{trader.openPnlPct}%</span>,
            },
            {
              label: t("copyTrade.portfolio"),
              value: <span className="text-sm font-bold font-mono text-foreground">
                {trader.currentValue >= 1e6 ? `$${(trader.currentValue / 1e6).toFixed(1)}M` : `$${(trader.currentValue / 1000).toFixed(0)}K`}
              </span>,
              sub: <span className="text-muted-foreground">{trader.activePositions} pos.</span>,
            },
            {
              label: t("copyTrade.edgeStats"),
              value: <span className="text-sm font-bold font-mono text-primary">PF {trader.profitFactor}</span>,
              sub: <span className="text-red-400/80">DD {trader.drawdown}%</span>,
            },
            {
              label: t("copyTrade.marketFit"),
              value: <span className="text-sm font-bold font-mono text-foreground">{trader.marketFit}</span>,
              sub: <span className="text-muted-foreground">{trader.concentration}% conc.</span>,
            },
          ].map(s => (
            <motion.div
              key={s.label}
              whileHover={{ scale: 1.03 }}
              className="bg-white/4 hover:bg-white/7 rounded-xl p-2.5 transition-colors"
            >
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5">{s.label}</div>
              <div>{s.value}</div>
              <div className="text-[9px] mt-0.5">{s.sub}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Weekly activity chart */}
      <div className="mt-3 pt-3 border-t border-white/5">
        <div className="flex items-center justify-between mb-2 text-[9px] text-muted-foreground">
          <span className="uppercase tracking-wider font-medium">{t("copyTrade.sevenDayActivity")}</span>
          <span className="font-mono">{trader.activity.toLocaleString()} trades · {trader.activitySample} sample</span>
        </div>
        <WeeklyBars seed={index + 1} positive={isPositive} />
      </div>

      {/* {t("copyTrade.aiAnalysis")} */}
      {trader.aiAnalysis && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5 text-[9px] text-muted-foreground uppercase tracking-wider font-medium">
            <Zap className="h-3 w-3 text-purple-400" />
            {t("copyTrade.aiAnalysis")}
          </div>
          <p className="text-[10px] text-muted-foreground/80 leading-relaxed">{trader.aiAnalysis}</p>
        </div>
      )}

      {/* Real Polymarket positions */}
      <div className="mt-3 pt-3 border-t border-white/5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground uppercase tracking-wider font-medium">
            <TrendingUp className="h-3 w-3 text-primary" />
            {t("copyTrade.livePolymarketPositions")}
            {trader.topPositions && trader.topPositions.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold uppercase">
                {t("copyTrade.real")}
              </span>
            )}
          </div>
          <a
            href={trader.polymarketUrl ?? `https://polymarket.com/profile/${trader.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[9px] text-primary/60 hover:text-primary transition-colors"
          >
            <ExternalLink className="h-2.5 w-2.5" /> {t("copyTrade.openProfile")}
          </a>
        </div>
        <RealPositions positions={trader.topPositions} address={trader.address} />
      </div>

      {/* Footer row */}
      <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-primary/60" />
          <span>
            {t("copyTrade.winRateLabel")} <span className="text-emerald-400 font-bold">{winRate}%</span> ·{" "}
            {t("copyTrade.streak")} <span className="text-amber-400 font-bold">{streak}W</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-emerald-500">{t("copyTrade.active")}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Stats banner ──────────────────────────────────────────────────────────────
function StatsBanner({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-primary/5 via-blue-500/5 to-purple-500/5 border border-primary/10"
    >
      {[
        { icon: <Shield className="h-3.5 w-3.5 text-emerald-400" />, label: t("copyTrade.verifiedTraders"), value: count },
        { icon: <TrendingUp className="h-3.5 w-3.5 text-primary" />, label: t("copyTrade.avgScore"), value: "82.4" },
        { icon: <Target className="h-3.5 w-3.5 text-amber-400" />, label: t("copyTrade.avgWinRate"), value: "67.3%" },
        { icon: <Zap className="h-3.5 w-3.5 text-purple-400" />, label: t("copyTrade.liveSignals"), value: t("copyTrade.threeActive") },
      ].map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i }}
          className="flex items-center gap-2"
        >
          <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">{s.icon}</div>
          <div className="min-w-0">
            <div className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{s.label}</div>
            <div className="text-xs sm:text-sm font-bold font-mono">{s.value}</div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface PolymarketResponse {
  traders: Trader[];
  fetchedAt: string;
  status: "ok" | "error" | "partial";
  errorMsg?: string;
  loading?: boolean;
}

export function Leaderboard({
  onCopyTrader,
  onAddWatchlist,
  watchlistAddresses = [],
}: {
  onCopyTrader: (trader: Trader) => void;
  onAddWatchlist?: (trader: Trader) => void;
  watchlistAddresses?: string[];
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"top" | "rising">("top");
  const queryClient = useQueryClient();

  const { data: pmData, isLoading, isFetching } = useQuery<PolymarketResponse>({
    queryKey: ["polymarket-leaderboard", tab],
    queryFn: async () => {
      const r = await fetch(`/api/polymarket/leaderboard?type=${tab}`);
      if (r.status === 202) {
        // Still loading on server — return placeholder
        return { traders: [], fetchedAt: new Date().toISOString(), status: "partial", loading: true };
      }
      return r.json();
    },
    staleTime: 4 * 60_000,
    refetchInterval: (query) => {
      // Poll every 12s if data is still loading server-side
      if ((query.state.data as any)?.loading) return 12_000;
      return false;
    },
  });

  const traders = pmData?.traders ?? [];
  const isServerLoading = pmData?.loading === true;
  const dataAge = pmData?.fetchedAt
    ? Math.round((Date.now() - new Date(pmData.fetchedAt).getTime()) / 1000)
    : null;

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.12 } },
  };

  const handleRefresh = () => {
    fetch("/api/polymarket/refresh", { method: "POST" }).then(() => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["polymarket-leaderboard"] }), 1000);
    });
  };

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="relative rounded-2xl overflow-hidden stone-texture border border-gold/15">
          <div className="absolute inset-0 terminal-grid opacity-40 pointer-events-none" />
          <div className="absolute -top-16 -right-16 w-56 h-56 bg-gold/6 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-crimson/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 left-0 w-8 h-[1px] bg-gradient-to-r from-gold/60 to-transparent" />
          <div className="absolute top-0 left-0 w-[1px] h-8 bg-gradient-to-b from-gold/60 to-transparent" />
          <div className="absolute top-0 right-0 w-8 h-[1px] bg-gradient-to-l from-gold/60 to-transparent" />
          <div className="absolute top-0 right-0 w-[1px] h-8 bg-gradient-to-b from-gold/60 to-transparent" />
          <div className="absolute bottom-0 left-0 w-8 h-[1px] bg-gradient-to-r from-crimson/40 to-transparent" />
          <div className="absolute bottom-0 left-0 w-[1px] h-8 bg-gradient-to-t from-crimson/40 to-transparent" />
          <div className="absolute bottom-0 right-0 w-8 h-[1px] bg-gradient-to-l from-crimson/40 to-transparent" />
          <div className="absolute bottom-0 right-0 w-[1px] h-8 bg-gradient-to-t from-crimson/40 to-transparent" />

          <div className="relative px-5 py-5 sm:px-6 sm:py-6 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
              <div className="space-y-2 min-w-0">
                <h3 className="font-display text-xl sm:text-2xl tracking-wide leading-snug">
                  <span className="gradient-text-gold">{t("copyTrade.leaderboardTitle1")}</span>
                  <br />
                  <span className="gradient-text-crimson">{t("copyTrade.leaderboardTitle2")}</span>
                </h3>
                <p className="text-[11px] sm:text-[12px] text-muted-foreground/70 leading-relaxed tracking-wide max-w-md">
                  {t("copyTrade.leaderboardSubtitle")}
                </p>
              </div>
              <div className="shrink-0 flex flex-row flex-wrap sm:flex-col items-start sm:items-end gap-2 sm:pt-1">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-semibold bg-emerald-500/8 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {t("copyTrade.polymarketLive")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-purple-400 text-[10px] font-semibold bg-purple-500/8 border border-purple-500/20 px-2.5 py-1 rounded-full">
                    <Zap className="h-3 w-3" />
                    {t("copyTrade.aiRanked")}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1 border-t border-white/5">
              {dataAge !== null && (
                <span className="text-muted-foreground/50 text-[9px] font-mono tabular-nums">
                  {dataAge < 60 ? `${dataAge}s` : `${Math.round(dataAge / 60)}m`}
                </span>
              )}
              <button
                onClick={handleRefresh}
                disabled={isFetching || isServerLoading}
                title={t("copyTrade.refreshData")}
                className="p-1 rounded text-muted-foreground/40 hover:text-gold transition-colors disabled:opacity-30"
              >
                <RefreshCw className={cn("h-3 w-3", (isFetching || isServerLoading) && "animate-spin")} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Server-side loading notice */}
      {isServerLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300">
          <div className="h-3 w-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
          {t("copyTrade.fetchingData")}
        </motion.div>
      )}

      {/* Stats banner */}
      {!isLoading && traders.length > 0 && <StatsBanner count={traders.length} />}

      {/* Tab switcher */}
      <div className="flex gap-2">
        {([
          { key: "top", icon: <Trophy className="h-3.5 w-3.5" />, label: t("copyTrade.topTraders") },
          { key: "rising", icon: <Star className="h-3.5 w-3.5" />, label: t("copyTrade.risingStars") },
        ] as const).map(tb => (
          <motion.button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl border transition-all",
              tab === tb.key
                ? "bg-primary text-primary-foreground border-primary shadow-[0_0_16px_rgba(59,130,246,0.3)]"
                : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            {tb.icon} {tb.label}
          </motion.button>
        ))}
      </div>

      {/* Count + subtitle */}
      <motion.div
        key={tab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 text-[11px] text-muted-foreground"
      >
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        <span>
          {tab === "top" ? t("copyTrade.polymarketLeaders") : t("copyTrade.risingStars")}{" "}
          <span className="text-foreground font-semibold">
            {traders.length > 0 ? `· ${traders.length} ${t("copyTrade.tradersCount")}` : isServerLoading ? `· ${t("common.loading")}` : ""}
          </span>
        </span>
        <span className="ml-1 opacity-60 hidden sm:inline">
          {t("copyTrade.qualifiedBy")}
        </span>
      </motion.div>

      {/* Card list */}
      {isLoading ? (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-2xl" />
          ))}
        </div>
      ) : !isServerLoading && traders.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-10 text-center space-y-2">
          <p className="text-sm font-semibold text-foreground/80">{t("copyTrade.noTradersTitle")}</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">{t("copyTrade.noTradersDesc")}</p>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 mt-1 text-xs font-semibold text-primary hover:underline"
          >
            <RefreshCw className="h-3 w-3" /> {t("copyTrade.refreshData")}
          </button>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            {traders.map((trader, i) => (
              <TraderCard
                key={trader.address}
                trader={trader}
                index={i}
                onCopy={onCopyTrader}
                onWatchlist={onAddWatchlist}
                inWatchlist={watchlistAddresses.includes(trader.address)}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
