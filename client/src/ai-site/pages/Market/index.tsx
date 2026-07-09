import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useGetMarketSentiment, useGetWatchlistSymbols, useGetMarketNews } from "@ai/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, formatCompactNumber, formatDateTime } from "@ai/lib/format";
import { cn } from "@ai/lib/utils";
import {
  Activity, TrendingUp, TrendingDown, Newspaper, Gauge,
  ArrowUpRight, ArrowDownRight, Minus,
  Crown, CircleDot, BarChart3, Flame, DollarSign,
} from "lucide-react";
import { CoinAnalysis } from "./CoinAnalysis";

const COIN_ICONS: Record<string, { icon: ReactNode; color: string; glow: string }> = {
  "BTC/USDT":  { icon: <span className="text-[12px] sm:text-[13px] font-black">₿</span>, color: "text-amber-400", glow: "shadow-[0_0_12px_rgba(251,191,36,0.2)]" },
  "ETH/USDT":  { icon: <span className="text-[12px] sm:text-[13px] font-black">Ξ</span>, color: "text-blue-400",  glow: "shadow-[0_0_12px_rgba(59,130,246,0.2)]" },
  "BNB/USDT":  { icon: <span className="text-[12px] sm:text-[13px] font-black">◆</span>, color: "text-yellow-400", glow: "shadow-[0_0_12px_rgba(250,204,21,0.2)]" },
  "SOL/USDT":  { icon: <span className="text-[12px] sm:text-[13px] font-black">◎</span>, color: "text-violet-400", glow: "shadow-[0_0_12px_rgba(139,92,246,0.2)]" },
  "AVAX/USDT": { icon: <span className="text-[12px] sm:text-[13px] font-black">▲</span>, color: "text-red-400",    glow: "shadow-[0_0_12px_rgba(248,113,113,0.2)]" },
  "ARB/USDT":  { icon: <span className="text-[12px] sm:text-[13px] font-black">⬡</span>, color: "text-sky-400",    glow: "shadow-[0_0_12px_rgba(56,189,248,0.2)]" },
};

// ── Generic fetch hook for new API endpoints ──────────────────────────────────
function useMarketEndpoint<T>(path: string, refreshMs = 0): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(path);
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as T;
        if (!cancelled) { setData(j); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    if (refreshMs > 0) {
      const id = setInterval(load, refreshMs);
      return () => { cancelled = true; clearInterval(id); };
    }
    return () => { cancelled = true; };
  }, [path, refreshMs]);
  return { data, loading };
}

type TrendingCoin = { id: string; symbol: string; name: string; thumb: string; marketCapRank: number | null; change24h: number | null };
type Mover = { id: string; symbol: string; name: string; image: string; price: number; change24h: number; volume: number; marketCap: number };

function GaugeChart({ value, label }: { value: number; label: string }) {
  const angle = (value / 100) * 180 - 90;
  const isGreed = value > 60;
  const isFear = value < 40;
  const color = isGreed ? "#22c55e" : isFear ? "#ef4444" : "#eab308";
  const glowColor = isGreed ? "rgba(34,197,94,0.3)" : isFear ? "rgba(239,68,68,0.3)" : "rgba(234,179,8,0.3)";
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-20 overflow-hidden">
        <svg viewBox="0 0 160 80" className="w-full h-full">
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="25%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="75%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <path d="M 15 75 A 65 65 0 0 1 145 75" fill="none" stroke="url(#gaugeGrad)" strokeWidth="8" strokeLinecap="round" opacity="0.3" />
          <path d="M 15 75 A 65 65 0 0 1 145 75" fill="none" stroke="url(#gaugeGrad)" strokeWidth="4" strokeLinecap="round" opacity="0.8" strokeDasharray={`${(value / 100) * 204} 204`} />
          <motion.line x1="80" y1="75" x2="80" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round" filter="url(#glow)"
            initial={{ rotate: -90 }} animate={{ rotate: angle }} transition={{ duration: 1.5, ease: "easeOut" }} style={{ transformOrigin: "80px 75px" }} />
          <circle cx="80" cy="75" r="5" fill="currentColor" className="text-background" stroke={color} strokeWidth="2" />
        </svg>
      </div>
      <motion.div className="text-center -mt-1" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }}>
        <div className="text-4xl font-black font-mono stat-value" style={{ color, filter: `drop-shadow(0 0 8px ${glowColor})` }}>{value}</div>
        <div className="text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.2em] mt-0.5" style={{ color }}>{label}</div>
      </motion.div>
    </div>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
    </span>
  );
}

function MiniSparkline({ positive }: { positive: boolean }) {
  const pts = Array.from({ length: 12 }, (_, i) => {
    const y = 12 + (positive ? -1 : 1) * (Math.sin(i * 0.8 + (positive ? 0 : 2)) * 6 + (positive ? -i * 0.5 : i * 0.3));
    return `${i * 4},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 44 24" className="w-11 h-6">
      <polyline points={pts} fill="none" stroke={positive ? "#22c55e" : "#ef4444"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Mover row (gainer/loser) ──────────────────────────────────────────────────
function MoverRow({ m, i, gainer }: { m: Mover; i: number; gainer: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-primary/5 transition-all">
      <span className="text-[10px] font-mono text-muted-foreground/40 w-4">{i + 1}</span>
      <img src={m.image} alt={m.symbol} className="w-7 h-7 rounded-full bg-muted" loading="lazy" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-foreground truncate">{m.symbol}</div>
        <div className="text-[10px] text-muted-foreground/50 font-mono truncate">{m.name}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[12px] font-mono font-bold text-foreground">{formatCurrency(m.price, m.price < 1 ? 4 : 2)}</div>
        <div className={cn("text-[11px] font-bold font-mono flex items-center justify-end gap-0.5",
          gainer ? "text-emerald-400" : "text-red-400")}>
          {gainer ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {(m.change24h ?? 0).toFixed(2)}%
        </div>
      </div>
    </motion.div>
  );
}

export default function Market() {
  const { t } = useTranslation();
  const { data: sentiment, isLoading: isLoadingSentiment } = useGetMarketSentiment();
  const { data: symbols, isLoading: isLoadingSymbols } = useGetWatchlistSymbols();
  const { data: news, isLoading: isLoadingNews } = useGetMarketNews({ limit: 10 });

  const { data: trending } = useMarketEndpoint<{ coins: TrendingCoin[] }>("/api/market/trending", 5 * 60_000);
  const { data: movers } = useMarketEndpoint<{ gainers: Mover[]; losers: Mover[] }>("/api/market/top-movers", 60_000);

  const totalVol = (sentiment as { totalVolume24h?: number } | undefined)?.totalVolume24h;
  const mcapChange = (sentiment as { marketCapChange24h?: number } | undefined)?.marketCapChange24h;

  return (
    <div className="space-y-5 pb-24 sm:pb-12 min-h-[calc(100dvh-80px)]">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight gradient-text-gold font-display">
            {t("market.title")}
          </h2>
          <p className="text-[12px] sm:text-[13px] text-muted-foreground/70 mt-1">
            {t("market.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="glass rounded-xl px-3 py-2 flex items-center gap-2">
            <LiveDot />
            <span className="text-[11px] sm:text-[12px] font-bold text-emerald-400 glow-text-green">{t("market.liveFeed")}</span>
          </div>
        </div>
      </div>

      {/* ── Quick stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: t("market.globalMcap"),   value: sentiment?.totalMarketCap != null ? `$${formatCompactNumber(sentiment.totalMarketCap)}` : "—",
            sub: mcapChange != null ? `${mcapChange >= 0 ? "+" : ""}${mcapChange.toFixed(2)}% ${t("market.last24h")}` : "",
            icon: <DollarSign className="h-4 w-4" />, color: (mcapChange ?? 0) >= 0 ? "text-emerald-400" : "text-red-400" },
          { label: t("market.globalVolume"), value: totalVol ? `$${formatCompactNumber(totalVol)}` : "—", sub: t("market.last24h"),
            icon: <BarChart3 className="h-4 w-4" />, color: "text-primary" },
          { label: t("market.btcDominance"), value: sentiment?.btcDominance != null ? `${sentiment.btcDominance.toFixed(1)}%` : "—", sub: "BTC",
            icon: <Crown className="h-4 w-4" />, color: "text-amber-400" },
          { label: t("market.fearGreed"),    value: sentiment?.fearGreedIndex ?? "—", sub: sentiment?.fearGreedLabel ?? "",
            icon: <Gauge className="h-4 w-4" />, color: (sentiment?.fearGreedIndex ?? 50) > 60 ? "text-emerald-400" : (sentiment?.fearGreedIndex ?? 50) < 40 ? "text-red-400" : "text-amber-400" },
        ].map((s, i) => (
          <motion.div key={s.label}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            whileHover={{ y: -2, scale: 1.02 }}
            className="rounded-2xl card-premium glass px-3 sm:px-4 py-3">
            <div className={cn("mb-1.5", s.color)}>{s.icon}</div>
            <div className={cn("text-[20px] sm:text-[22px] font-black font-mono stat-value", s.color)}>{s.value}</div>
            <div className="text-[9px] sm:text-[10px] text-muted-foreground/70 mt-1 uppercase tracking-wider font-semibold">{s.label}</div>
            {s.sub ? <div className="text-[9px] sm:text-[10px] font-mono text-muted-foreground/50 mt-0.5">{s.sub}</div> : null}
          </motion.div>
        ))}
      </div>

      {/* ── Mainstream coin AI analysis ── */}
      <CoinAnalysis />

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Watchlist + Model Signals + Movers + DeFi */}
        <div className="lg:col-span-2 space-y-5">

          {/* ── Watchlist ── */}
          <div className="rounded-2xl card-premium glass overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-[11px] sm:text-[12px] font-bold text-foreground/70 uppercase tracking-widest font-mono">{t("market.marketWatchlist")}</span>
              <LiveDot />
              <span className="ml-auto text-[9px] sm:text-[10px] font-mono text-muted-foreground/60">{symbols?.length ?? 0} {t("market.assets")}</span>
            </div>
            {isLoadingSymbols ? (
              <div className="p-4 space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
            ) : symbols && symbols.length > 0 ? (
              <div className="divide-y divide-border/40">
                {symbols.map((sym, i) => {
                  const cfg = COIN_ICONS[sym.symbol] ?? { icon: <CircleDot className="h-3.5 w-3.5" />, color: "text-muted-foreground", glow: "" };
                  const isPos = (sym.changePercent24h ?? 0) > 0;
                  return (
                    <motion.div key={sym.symbol}
                      initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-primary/5 transition-all group cursor-default">
                      <div className={cn("w-9 h-9 rounded-xl border border-border/50 flex items-center justify-center glass shrink-0", cfg.glow)}>
                        <span className={cfg.color}>{cfg.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[14px] sm:text-[15px] font-bold text-foreground">{sym.symbol}</span>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] sm:text-[11px] text-muted-foreground/60 font-mono">Vol: {formatCompactNumber(sym.volume24h)}</span>
                          <span className="text-[10px] text-muted-foreground/40">·</span>
                          <span className="text-[10px] sm:text-[11px] text-muted-foreground/60 font-mono">MCap: {formatCompactNumber(sym.marketCap)}</span>
                        </div>
                      </div>
                      <MiniSparkline positive={isPos} />
                      <div className="text-right shrink-0">
                        <div className="text-[14px] sm:text-[15px] font-black font-mono stat-value text-foreground">
                          {formatCurrency(sym.price, sym.price < 1 ? 4 : 2)}
                        </div>
                        <div className={cn("text-[11px] sm:text-[12px] font-bold font-mono flex items-center justify-end gap-0.5",
                          isPos ? "text-emerald-400" : "text-red-400")}>
                          {isPos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {formatPercent(sym.changePercent24h, 2)}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">{t("market.noWatchlistData")}</div>
            )}
          </div>

          {/* ── Top Gainers / Top Losers ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl card-premium glass overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span className="text-[11px] sm:text-[12px] font-bold text-foreground/70 uppercase tracking-widest font-mono">{t("market.topGainers")}</span>
              </div>
              {!movers ? (
                <div className="p-4 space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
              ) : (
                <div className="divide-y divide-border/40">
                  {movers.gainers.slice(0, 8).map((m, i) => <MoverRow key={m.id} m={m} i={i} gainer />)}
                </div>
              )}
            </div>
            <div className="rounded-2xl card-premium glass overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                <TrendingDown className="h-4 w-4 text-red-400" />
                <span className="text-[11px] sm:text-[12px] font-bold text-foreground/70 uppercase tracking-widest font-mono">{t("market.topLosers")}</span>
              </div>
              {!movers ? (
                <div className="p-4 space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
              ) : (
                <div className="divide-y divide-border/40">
                  {movers.losers.slice(0, 8).map((m, i) => <MoverRow key={m.id} m={m} i={i} gainer={false} />)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* ── Fear & Greed ── */}
          <div className="rounded-2xl card-premium glass p-5 relative overflow-hidden glow-primary">
            <div className="absolute top-0 right-0 w-28 h-28 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <Gauge className="h-4 w-4 text-primary" />
                <span className="text-[11px] sm:text-[12px] font-bold text-foreground/70 uppercase tracking-widest font-mono">{t("market.fearGreedIndex")}</span>
              </div>
              {isLoadingSentiment ? (
                <Skeleton className="h-40 w-full rounded-xl" />
              ) : sentiment ? (
                <div className="space-y-4">
                  <GaugeChart value={sentiment.fearGreedIndex} label={sentiment.fearGreedLabel} />
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/40">
                    <div className="text-center glass rounded-xl py-2.5">
                      <div className="text-[9px] sm:text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1">{t("market.bullishModels")}</div>
                      <div className="text-[16px] sm:text-[18px] font-black font-mono stat-value text-emerald-400">
                        {sentiment.bullishModels} <span className="text-muted-foreground/40 text-[11px]">/ {sentiment.totalModels}</span>
                      </div>
                    </div>
                    <div className="text-center glass rounded-xl py-2.5">
                      <div className="text-[9px] sm:text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1">{t("market.btcDominance")}</div>
                      <div className="text-[16px] sm:text-[18px] font-black font-mono stat-value text-amber-400">
                        {formatPercent(sentiment.btcDominance, 1, false)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm text-center py-6">{t("market.noSentimentData")}</div>
              )}
            </div>
          </div>

          {/* ── Trending Coins ── */}
          <div className="rounded-2xl card-premium glass overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
              <Flame className="h-4 w-4 text-orange-400" />
              <span className="text-[11px] sm:text-[12px] font-bold text-foreground/70 uppercase tracking-widest font-mono">{t("market.trendingCoins")}</span>
              {trending && <span className="ml-auto text-[9px] sm:text-[10px] font-mono text-muted-foreground/60">{trending.coins.length} {t("market.coins")}</span>}
            </div>
            {!trending ? (
              <div className="p-4 space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}</div>
            ) : (
              <div className="divide-y divide-border/40">
                {trending.coins.slice(0, 8).map((c, i) => (
                  <motion.div key={c.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-primary/5 transition-all">
                    <span className="text-[10px] font-mono text-orange-400/60 w-4">#{i + 1}</span>
                    <img src={c.thumb} alt={c.symbol} className="w-6 h-6 rounded-full bg-muted" loading="lazy" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold text-foreground truncate">{c.symbol}</div>
                      <div className="text-[10px] text-muted-foreground/50 font-mono truncate">{c.name}</div>
                    </div>
                    {c.change24h != null && (
                      <span className={cn("text-[11px] font-mono font-bold shrink-0",
                        c.change24h >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {c.change24h >= 0 ? "+" : ""}{c.change24h.toFixed(1)}%
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* ── News ── */}
          <div className="rounded-2xl card-premium glass overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
              <Newspaper className="h-4 w-4 text-violet-400" />
              <span className="text-[11px] sm:text-[12px] font-bold text-foreground/70 uppercase tracking-widest font-mono">{t("market.aiNewsSentiment")}</span>
              <span className="ml-auto text-[9px] sm:text-[10px] font-mono text-muted-foreground/60">{news?.length ?? 0} {t("market.articles")}</span>
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y divide-border/40">
              {isLoadingNews ? (
                <div className="p-4 space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
              ) : news && news.length > 0 ? (
                news.map((item, i) => {
                  const isBullish = item.sentiment === "positive";
                  const isBearish = item.sentiment === "negative";
                  const sentimentColor = isBullish ? "border-l-emerald-500/60" : isBearish ? "border-l-red-500/60" : "border-l-amber-400/40";
                  const score = Math.round((item.sentimentScore ?? 0) * 100);
                  return (
                    <motion.div key={item.id}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      className={cn("px-4 py-3.5 hover:bg-primary/5 transition-all group border-l-2", sentimentColor)}>
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-1.5">
                          {item.symbol && (
                            <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/15 font-mono">
                              {item.symbol}
                            </span>
                          )}
                          <span className="text-[9px] sm:text-[10px] text-muted-foreground/40 uppercase tracking-wider font-mono">{item.source}</span>
                        </div>
                        <span className="text-[9px] sm:text-[10px] text-muted-foreground/30 font-mono shrink-0">{formatDateTime(item.publishedAt)}</span>
                      </div>
                      <a href={item.url} target="_blank" rel="noreferrer"
                        className="block group-hover:text-primary transition-colors mt-1">
                        <h4 className="text-[13px] sm:text-[14px] font-semibold leading-snug line-clamp-2 text-foreground/90">{item.title}</h4>
                      </a>
                      <div className="flex items-center justify-between mt-2.5 gap-2">
                        <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] sm:text-[10px] font-bold glass",
                          isBullish ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                          isBearish ? "bg-red-500/10 border-red-500/20 text-red-400" :
                          "bg-amber-500/10 border-amber-500/20 text-amber-400")}>
                          {isBullish ? <TrendingUp className="h-2.5 w-2.5" /> : isBearish ? <TrendingDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                          {isBullish ? t("market.bullish") : isBearish ? t("market.bearish") : t("market.neutral")}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] sm:text-[10px] text-muted-foreground/40">{t("market.score")}:</span>
                          <span className={cn("text-[12px] sm:text-[13px] font-black font-mono",
                            score > 60 ? "text-emerald-400" : score < 40 ? "text-red-400" : "text-amber-400")}>
                            {score}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">{t("market.noRecentNews")}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
