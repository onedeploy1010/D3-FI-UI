import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@ai/lib/utils";
import {
  Search, TrendingUp, TrendingDown, Target, Zap, Activity,
  Copy, ExternalLink, CheckCircle, XCircle, Clock, BarChart2,
  Layers, RefreshCw, AtSign, AlertCircle, Calendar,
} from "lucide-react";
import type { Trader } from "./types";
import { fetchPolymarketPositions, resolvePolymarketUsername } from "@/lib/polymarketApi";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PolyPosition {
  id: string;
  market: string;
  outcome: string;
  side: "BUY" | "SELL";
  avgPrice: number;
  currentPrice: number;
  shares: number;
  value: number;
  cost: number;
  pnl: number;
  pnlPct: number;
  status: "active" | "closed";
  icon?: string;
  slug?: string;
  endDate?: string;
}

interface PolyData {
  source: "live" | "generated";
  positions: PolyPosition[];
  address: string;
  profileUrl: string;
  count: number;
}

interface ResolveResult {
  address: string;
  username: string;
  profileUrl: string;
  error?: string;
}

// ── Metric bar ─────────────────────────────────────────────────────────────────
function MetricBar({ label, value, color, delay = 0 }: { label: string; value: number; color: string; delay?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider w-[68px] shrink-0 font-medium">{label}</span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(value, 100)}%` }}
          transition={{ delay, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="text-[11px] font-mono font-bold w-6 text-right">{value}</span>
    </div>
  );
}

// ── Outcome badge color helper ────────────────────────────────────────────────
function outcomeBadgeClass(outcome: string) {
  const yes = ["Yes", "Up", "Higher", "Win", "More", "Above"].some(k => outcome.toLowerCase().includes(k.toLowerCase()));
  return yes
    ? "bg-emerald-500/10 text-emerald-400"
    : "bg-red-500/10 text-red-400";
}

// ── Polymarket positions table ────────────────────────────────────────────────
function PolyPositionsPanel({
  address,
  profileUrl,
  resolvedUsername,
}: {
  address: string;
  profileUrl: string;
  resolvedUsername?: string;
}) {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useQuery<PolyData>({
    queryKey: ["polymarket-positions", address],
    queryFn: () => fetchPolymarketPositions(address) as Promise<PolyData>,
    staleTime: 30000,
    enabled: address.length > 6,
  });

  const active = data?.positions.filter(p => p.status === "active") ?? [];
  const closed = data?.positions.filter(p => p.status === "closed") ?? [];
  const totalValue = active.reduce((s, p) => s + p.value, 0);
  const totalPnl = data?.positions.reduce((s, p) => s + p.pnl, 0) ?? 0;
  const winning = data?.positions.filter(p => p.pnl > 0).length ?? 0;

  const viewUrl = resolvedUsername
    ? `https://polymarket.com/@${resolvedUsername}`
    : profileUrl || `https://polymarket.com/profile/${address}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-2xl border border-primary/20 bg-card/60 overflow-hidden backdrop-blur-sm"
    >
      {/* Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-border/20 bg-gradient-to-r from-primary/5 to-purple-500/5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-primary/15 flex items-center justify-center">
            <Layers className="h-3 w-3 text-primary" />
          </div>
          <span className="text-sm font-bold">{t("copyTrade.polymarketPositions")}</span>
          {data?.source === "live" && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 flex items-center gap-1"
            >
              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              {t("copyTrade.liveData")}
            </motion.span>
          )}
          {data?.source === "generated" && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">{t("copyTrade.simulated")}</span>
          )}
          {resolvedUsername && (
            <span className="text-[10px] text-muted-foreground font-mono">@{resolvedUsername}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
            title="Refresh data"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary border border-primary/20 hover:border-primary/40 transition-all"
          >
            <ExternalLink className="h-3 w-3" />
            {resolvedUsername ? `@${resolvedUsername}` : t("copyTrade.viewOnPolymarket")}
          </a>
        </div>
      </div>

      {/* Summary row */}
      {data && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="grid grid-cols-3 gap-0 border-b border-border/10"
        >
          {[
            { label: t("copyTrade.portfolioValue"), value: `$${totalValue.toFixed(0)}`, color: "text-foreground", icon: <BarChart2 className="h-3 w-3" /> },
            { label: t("copyTrade.totalPnl"), value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(0)}`, color: totalPnl >= 0 ? "text-emerald-400" : "text-red-400", icon: <TrendingUp className="h-3 w-3" /> },
            { label: t("copyTrade.winTotal"), value: `${winning} / ${data.positions.length}`, color: "text-primary", icon: <Target className="h-3 w-3" /> },
          ].map(s => (
            <div key={s.label} className="px-4 py-3 border-r border-border/10 last:border-r-0">
              <div className={cn("flex items-center gap-1 text-[9px] text-muted-foreground mb-1")}>{s.icon} {s.label}</div>
              <div className={cn("text-base font-bold font-mono", s.color)}>{s.value}</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Tabs: active / closed */}
      {data && data.positions.length > 0 && (
        <div className="px-4 sm:px-5 pt-3 pb-1 flex items-center gap-3 text-[10px]">
          <span className="font-semibold text-emerald-400">{active.length} {t("copyTrade.open")}</span>
          <span className="text-border">·</span>
          <span className="text-muted-foreground">{closed.length} {t("copyTrade.closed")}</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="p-5 space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="p-8 text-center">
          <AlertCircle className="h-8 w-8 text-red-400/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{t("copyTrade.couldNotLoadPositions")}</p>
          <a href={viewUrl} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> {t("copyTrade.openPolymarketProfile")}
          </a>
        </div>
      )}

      {/* Empty state */}
      {data && data.positions.length === 0 && (
        <div className="p-8 text-center">
          <BarChart2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{t("copyTrade.noPositionsFound")}</p>
          <a href={viewUrl} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> View on Polymarket
          </a>
        </div>
      )}

      {/* Positions list */}
      {data && data.positions.length > 0 && !isLoading && (
        <div className="divide-y divide-border/10">
          <AnimatePresence>
            {data.positions.map((pos, i) => {
              const isPositive = pos.pnl >= 0;
              const marketUrl = pos.slug
                ? `https://polymarket.com/event/${pos.slug}`
                : viewUrl;

              return (
                <motion.div
                  key={pos.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.035 }}
                  className="px-4 sm:px-5 py-3.5 hover:bg-white/3 transition-colors"
                >
                  {/* Top row: icon + market title + status */}
                  <div className="flex items-start gap-2.5 mb-2">
                    {pos.icon && (
                      <img
                        src={pos.icon}
                        alt=""
                        className="w-7 h-7 rounded-lg object-cover shrink-0 mt-0.5 bg-white/5"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <a
                        href={marketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] sm:text-sm font-semibold text-foreground hover:text-primary transition-colors leading-tight line-clamp-2 group flex items-start gap-1"
                      >
                        <span>{pos.market}</span>
                        <ExternalLink className="h-2.5 w-2.5 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                      {pos.endDate && (
                        <div className="flex items-center gap-1 mt-0.5 text-[9px] text-muted-foreground">
                          <Calendar className="h-2.5 w-2.5" />
                          <span>Ends {pos.endDate}</span>
                        </div>
                      )}
                    </div>
                    <span className={cn(
                      "shrink-0 text-[9px] font-black px-2 py-1 rounded-lg",
                      pos.status === "active" ? "bg-blue-500/10 text-blue-400" : "bg-muted/50 text-muted-foreground"
                    )}>
                      {pos.status === "active" ? t("copyTrade.open").toUpperCase() : t("copyTrade.closed").toUpperCase()}
                    </span>
                  </div>

                  {/* Bottom row: metrics */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-wrap ml-0">
                    {/* Outcome badge */}
                    <span className={cn(
                      "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg",
                      outcomeBadgeClass(pos.outcome)
                    )}>
                      {pos.outcome}
                    </span>

                    {/* Price: avg → current */}
                    <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                      <span>{(pos.avgPrice * 100).toFixed(0)}¢</span>
                      <span className="text-white/20">→</span>
                      <span className={pos.currentPrice > pos.avgPrice ? "text-emerald-400" : pos.currentPrice === pos.avgPrice ? "text-muted-foreground" : "text-red-400"}>
                        {(pos.currentPrice * 100).toFixed(0)}¢
                      </span>
                    </div>

                    {/* Shares */}
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {pos.shares.toFixed(1)} shares
                    </span>

                    {/* Value */}
                    <span className="text-[10px] font-mono text-muted-foreground">${pos.value.toFixed(2)}</span>

                    {/* PnL */}
                    <div className={cn("ml-auto flex items-center gap-1 font-bold font-mono text-xs")}>
                      {isPositive
                        ? <TrendingUp className="h-3 w-3 text-emerald-400" />
                        : <TrendingDown className="h-3 w-3 text-red-400" />}
                      <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
                        {isPositive ? "+" : ""}{pos.pnl.toFixed(2)}
                      </span>
                      <span className={cn("text-[9px]", isPositive ? "text-emerald-400/70" : "text-red-400/70")}>
                        ({isPositive ? "+" : ""}{pos.pnlPct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 sm:px-5 py-3 border-t border-border/10 bg-white/2 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground">
          {data?.source === "live"
            ? `${data.positions.length} ${t("copyTrade.positions")} · ${t("copyTrade.liveFromPolymarket")}`
            : data?.source === "generated"
            ? t("copyTrade.simulatedPositions")
            : "—"}
        </span>
        <a href={viewUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-primary hover:underline font-semibold">
          <ExternalLink className="h-2.5 w-2.5" />
          {resolvedUsername ? `polymarket.com/@${resolvedUsername}` : t("copyTrade.fullProfile")}
        </a>
      </div>
    </motion.div>
  );
}

// ── Trader profile panel ───────────────────────────────────────────────────────
function TraderProfile({
  trader,
  onCopy,
  username,
}: {
  trader: Trader;
  onCopy: () => void;
  username?: string;
}) {
  const { t } = useTranslation();
  const isPositive = trader.openPnl >= 0;
  const [copied, setCopied] = useState(false);

  const handleCopyAddr = () => {
    navigator.clipboard?.writeText(trader.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const polyUrl = username
    ? `https://polymarket.com/@${username}`
    : `https://polymarket.com/profile/${trader.address}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 22 }}
      className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-blue-500/3 p-4 sm:p-6 backdrop-blur-sm"
    >
      {/* Identity */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="font-black text-xl tracking-tight">
              {username ? `@${username}` : trader.name}
            </motion.span>
            {trader.badges.map((b, i) => (
              <motion.span key={b} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 * i }}
                className={cn("text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wide",
                  b === "Qualified" ? "bg-blue-500/15 text-blue-400"
                  : b === "Proven" ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-muted text-muted-foreground"
                )}>
                {b}
              </motion.span>
            ))}
          </div>
          <button onClick={handleCopyAddr}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono hover:text-primary transition-colors group">
            <span>{trader.address.slice(0, 10)}…{trader.address.slice(-8)}</span>
            {copied
              ? <CheckCircle className="h-3 w-3 text-emerald-400" />
              : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
          </button>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {trader.tags.map((tag, i) => (
              <motion.span key={tag} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.04 * i }}
                className="text-[10px] bg-white/5 border border-white/8 px-2 py-0.5 rounded-full text-muted-foreground">
                {tag}
              </motion.span>
            ))}
          </div>
        </div>

        {/* Score + actions */}
        <div className="text-right shrink-0">
          <div className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">{t("copyTrade.followScore")}</div>
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="text-4xl sm:text-5xl font-black text-primary glow-score">
            {trader.followScore}
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}>
            <Button className="mt-2.5 h-8 text-xs relative overflow-hidden group/btn" onClick={onCopy}>
              <span className="relative z-10">{t("copyTrade.copyThisTrader")}</span>
              <span className="absolute inset-0 shimmer-bg opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />
            </Button>
          </motion.div>
          <a href={polyUrl} target="_blank" rel="noopener noreferrer"
            className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors">
            <ExternalLink className="h-2.5 w-2.5" />
            {username ? `@${username}` : "Polymarket"}
          </a>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2.5">
          <MetricBar label="Edge" value={trader.edge} color="bg-emerald-500" delay={0.1} />
          <MetricBar label="Copyability" value={trader.copyability} color="bg-amber-400" delay={0.2} />
          <MetricBar label="Confidence" value={trader.confidence} color="bg-blue-500" delay={0.3} />
          <MetricBar label="Lag Tol." value={trader.lagTolerance} color="bg-red-500" delay={0.4} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            {
              icon: <TrendingUp className="h-3.5 w-3.5" />,
              label: t("copyTrade.openPnl"),
              value: `${isPositive ? "+" : ""}$${(Math.abs(trader.openPnl) / 1000).toFixed(1)}K`,
              sub: `${trader.openPnlPct}%`,
              color: isPositive ? "text-emerald-400" : "text-red-400",
            },
            {
              icon: <Activity className="h-3.5 w-3.5" />,
              label: t("copyTrade.portfolio"),
              value: trader.currentValue >= 1e6
                ? `$${(trader.currentValue / 1e6).toFixed(1)}M`
                : `$${(trader.currentValue / 1000).toFixed(0)}K`,
              sub: `${trader.activePositions} positions`,
              color: "text-foreground",
            },
            {
              icon: <Target className="h-3.5 w-3.5" />,
              label: t("copyTrade.edgeStats"),
              value: `PF ${trader.profitFactor}`,
              sub: `DD ${trader.drawdown}%`,
              color: "text-primary",
            },
            {
              icon: <Zap className="h-3.5 w-3.5" />,
              label: t("copyTrade.activity"),
              value: trader.activity.toLocaleString(),
              sub: `${trader.activitySample} sample`,
              color: "text-foreground",
            },
          ].map((s, i) => (
            <motion.div key={s.label}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 * i + 0.15 }}
              whileHover={{ scale: 1.03 }}
              className="bg-white/4 hover:bg-white/7 rounded-xl p-3 transition-colors">
              <div className={cn("flex items-center gap-1.5 text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5", s.color)}>{s.icon} {s.label}</div>
              <div className={cn("text-sm font-bold font-mono", s.color)}>{s.value}</div>
              <div className="text-[9px] text-muted-foreground mt-0.5">{s.sub}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Featured traders ──────────────────────────────────────────────────────────
const EXAMPLES = [
  { label: "car-ayatollahversion", addr: "0x8c74b4eef9a894433b8126aa11d1345efb2b0488", username: "car-ayatollahversion", score: 88 },
  { label: "denizz", addr: "0x04283f2fef49d70d8c55ab240450d17a65bf85a", score: 85 },
  { label: "almost-never", addr: "0xbaa2bcb5439e985ce4ccf815b4700027d1b92c73", score: 83 },
  { label: "geniusMC", addr: "0x7a3c9b2f1d4e5a8f2b1c3d5e7f9a2b4c6d8e1f3", score: 83 },
  { label: "Erasmus.", addr: "0x2e4f6a8c1d3b5e7f9a2c4e6f8b1d3f5a7c9e2f4", score: 82 },
  { label: "alpha_whale", addr: "0x9f1c3e5a7b2d4f6a8c1e3f5a7b9d2f4a6c8e1f3", score: 79 },
];

// ── Main export ───────────────────────────────────────────────────────────────
export function AddressLookup({ onCopyTrader }: { onCopyTrader: (trader: Trader) => void }) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(""); // resolved wallet address
  const [resolvedUsername, setResolvedUsername] = useState<string | undefined>();
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | undefined>();

  const { data: trader, isLoading: traderLoading } = useQuery<Trader>({
    queryKey: ["copytrade-trader", query],
    queryFn: () => fetch(`/api/copytrade/trader/${encodeURIComponent(query)}`).then(r => r.json()) as Promise<Trader>,
    enabled: query.length > 3,
    staleTime: 30000,
  });

  const isLoading = resolving || traderLoading;

  // Detect if input is a username (starts with @, or doesn't start with 0x)
  const isUsername = (val: string) => {
    const trimmed = val.trim();
    if (trimmed.startsWith("@")) return true;
    if (trimmed.startsWith("0x") && trimmed.length >= 40) return false;
    // polymarket.com/@username URL
    if (trimmed.includes("polymarket.com/@")) return true;
    // no spaces, no 0x, looks like a slug
    return trimmed.length > 0 && !trimmed.startsWith("0x") && /^[a-zA-Z0-9_\-@.]+$/.test(trimmed);
  };

  const extractUsername = (val: string) => {
    // polymarket.com/@foo → foo
    const urlMatch = val.match(/polymarket\.com\/@([a-zA-Z0-9_\-.]+)/);
    if (urlMatch) return urlMatch[1];
    return val.startsWith("@") ? val.slice(1) : val;
  };

  const handleSearch = async () => {
    const val = input.trim();
    if (!val || val.length < 2) return;
    setResolveError(undefined);

    if (isUsername(val)) {
      const uname = extractUsername(val);
      setResolving(true);
      setResolvedUsername(undefined);
      try {
        const data: ResolveResult = await resolvePolymarketUsername(uname);
        if (data.address) {
          setResolvedUsername(data.username || uname);
          setQuery(data.address);
        } else {
          setResolveError(data.error ?? "Username not found");
        }
      } catch {
        setResolveError("Network error — could not resolve username");
      } finally {
        setResolving(false);
      }
    } else {
      setResolvedUsername(undefined);
      setQuery(val);
    }
  };

  const handleSelectExample = (e: typeof EXAMPLES[0]) => {
    setInput(e.username ? `@${e.username}` : e.addr);
    setQuery(e.addr);
    setResolvedUsername(e.username);
    setResolveError(undefined);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h3 className="font-black text-xl tracking-tight bg-gradient-to-r from-foreground via-primary to-blue-400 bg-clip-text text-transparent">
          {t("copyTrade.traderAddressLookup")}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {t("copyTrade.traderAddressLookupDesc")}
        </p>
      </motion.div>

      {/* Search bar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex gap-2">
        <div className="relative flex-1">
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
            className="absolute left-3 top-1/2 -translate-y-1/2"
          >
            {input.trim().startsWith("@") || (input.trim().length > 0 && isUsername(input))
              ? <AtSign className="h-4 w-4 text-primary" />
              : <Search className="h-4 w-4 text-muted-foreground" />
            }
          </motion.div>
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="@username or 0x... wallet address"
            className="pl-9 font-mono text-sm bg-white/4 border-border/30 focus:border-primary/40"
          />
        </div>
        <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
          <Button onClick={handleSearch} disabled={input.trim().length < 2 || isLoading} className="relative overflow-hidden group/btn">
            <span className="relative z-10">
              {resolving ? t("copyTrade.resolving") : traderLoading ? t("copyTrade.loading") : t("copyTrade.search")}
            </span>
            <span className="absolute inset-0 shimmer-bg opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />
          </Button>
        </motion.div>
      </motion.div>

      {/* Resolve error */}
      <AnimatePresence>
        {resolveError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400"
          >
            <XCircle className="h-4 w-4 shrink-0" />
            <span>{resolveError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resolved username hint */}
      <AnimatePresence>
        {resolving && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-xs text-muted-foreground">
            <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity }}>
              ● {t("copyTrade.resolvingUsername")}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Featured addresses */}
      {!query && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <p className="text-[11px] text-muted-foreground mb-2 font-medium flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> {t("copyTrade.featuredTraders")}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {EXAMPLES.map((e, i) => (
              <motion.button
                key={e.addr}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
                whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.97 }}
                className="flex flex-col items-start gap-2 p-3.5 rounded-xl border border-border/40 hover:border-primary/30 bg-white/3 hover:bg-primary/5 transition-all text-left"
                onClick={() => handleSelectExample(e)}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-sm">
                    {e.username ? (
                      <span className="flex items-center gap-1">
                        <AtSign className="h-3 w-3 text-primary/60" />
                        {e.username}
                      </span>
                    ) : e.label}
                  </span>
                  <a
                    href={e.username ? `https://polymarket.com/@${e.username}` : `https://polymarket.com/profile/${e.addr}`}
                    target="_blank" rel="noopener noreferrer"
                    onClick={ev => ev.stopPropagation()}
                    className="text-muted-foreground/40 hover:text-primary transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground truncate w-full">{e.addr.slice(0, 14)}…</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Score</span>
                  <span className="text-sm font-black text-primary glow-score">{e.score}</span>
                  <span className="ml-auto text-[9px] text-emerald-400 font-medium flex items-center gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> Active
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </motion.div>
      )}

      {/* Results */}
      <AnimatePresence mode="wait">
        {trader && !isLoading && (
          <motion.div key={trader.address} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <TraderProfile trader={trader} onCopy={() => onCopyTrader(trader)} username={resolvedUsername} />
            <PolyPositionsPanel
              address={trader.address}
              profileUrl={`https://polymarket.com/profile/${trader.address}`}
              resolvedUsername={resolvedUsername}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
