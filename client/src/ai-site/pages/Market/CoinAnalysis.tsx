import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@ai/lib/utils";
import {
  TrendingUp, TrendingDown, Minus, Sparkles, Target, Zap, BrainCircuit, Scale,
} from "lucide-react";
import { CoinKlineChart } from "./CoinKlineChart";
import { aiFetch } from "@/lib/aiApi";

// ── Deterministic helpers ──────────────────────────────────────────────────────
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 10) return p.toFixed(2);
  return p.toFixed(4);
}

// ── Static meta ────────────────────────────────────────────────────────────────
const COINS: { key: string; symbol: string; glyph: string; color: string; base: number }[] = [
  { key: "BTC", symbol: "BTC/USDT", glyph: "₿", color: "#f7931a", base: 97400 },
  { key: "ETH", symbol: "ETH/USDT", glyph: "Ξ", color: "#627eea", base: 3620 },
  { key: "SOL", symbol: "SOL/USDT", glyph: "◎", color: "#9945ff", base: 212 },
  { key: "BNB", symbol: "BNB/USDT", glyph: "◆", color: "#f0b90b", base: 645 },
  { key: "XRP", symbol: "XRP/USDT", glyph: "✕", color: "#0a93c9", base: 2.31 },
  { key: "DOGE", symbol: "DOGE/USDT", glyph: "Ð", color: "#c2a633", base: 0.324 },
];

const MODELS: { name: string; icon: string; accent: string }[] = [
  { name: "GPT-4o",   icon: "G",  accent: "#10a37f" },
  { name: "Claude",   icon: "C",  accent: "#cc843f" },
  { name: "Gemini",   icon: "Ge", accent: "#4285f4" },
  { name: "DeepSeek", icon: "D",  accent: "#6366f1" },
  { name: "Grok",     icon: "Gr", accent: "#ef4444" },
  { name: "Qwen",     icon: "Q",  accent: "#734bd1" },
];

const EXCHANGES = ["Binance", "OKX", "Bybit", "Coinbase", "Kraken", "Bitget"];

// ── Data generation ────────────────────────────────────────────────────────────
type Direction = "BULLISH" | "BEARISH" | "NEUTRAL";

interface ModelForecast {
  model: string;
  icon: string;
  accent: string;
  direction: Direction;
  confidence: number;
  targetPrice: number;
  reasonKey: string;
}

interface CoinData {
  price: number;
  change24h: number;
  forecasts: ModelForecast[];
  longPct: number;
  exchangeDepth: { name: string; buy: number }[];
  fundingRate: number;
  openInterest: number;
}

function generateForecasts(coinKey: string, price: number, hourBucket: number): ModelForecast[] {
  const base = hashStr(coinKey) + hourBucket * 17;
  return MODELS.map((m, i) => {
    const seed = base + hashStr(m.name) + i * 7919;
    const roll = seed % 10;
    const direction: Direction = roll < 5 ? "BULLISH" : roll < 8 ? "BEARISH" : "NEUTRAL";
    const confidence = 58 + (seed % 37);
    const movePct = (0.8 + (seed % 30) / 10) / 100;
    const targetPrice =
      direction === "BULLISH" ? price * (1 + movePct) :
      direction === "BEARISH" ? price * (1 - movePct) :
      price * (1 + ((seed % 10) - 5) / 2000);
    const reasonKey =
      direction === "BULLISH" ? (seed % 2 === 0 ? "market.caReason1" : "market.caReason4") :
      direction === "BEARISH" ? "market.caReason3" : "market.caReason2";
    return {
      model: m.name,
      icon: m.icon,
      accent: m.accent,
      direction,
      confidence,
      targetPrice,
      reasonKey,
    };
  });
}

function recalcTargetPrice(price: number, direction: Direction, seed: number): number {
  const movePct = (0.8 + (seed % 30) / 10) / 100;
  if (direction === "BULLISH") return price * (1 + movePct);
  if (direction === "BEARISH") return price * (1 - movePct);
  return price * (1 + ((seed % 10) - 5) / 2000);
}

/** Re-anchor API targets to the displayed spot when they drift from live price. */
function normalizeForecastTargets(forecasts: ModelForecast[], price: number): ModelForecast[] {
  return forecasts.map((f, i) => {
    const ratio = f.targetPrice / price;
    const misaligned =
      f.targetPrice <= 0 ||
      ratio < 0.3 ||
      ratio > 3 ||
      (f.direction === "BULLISH" && f.targetPrice < price * 0.995) ||
      (f.direction === "BEARISH" && f.targetPrice > price * 1.005);
    if (!misaligned) return f;
    return {
      ...f,
      targetPrice: recalcTargetPrice(price, f.direction, hashStr(f.model) + i * 7919),
    };
  });
}

function generateCoinData(coinKey: string, hourBucket: number, priceOverride?: number, change24hOverride?: number): CoinData {
  const coin = COINS.find(c => c.key === coinKey)!;
  const base = hashStr(coin.key) + hourBucket * 17;

  const price = priceOverride ?? coin.base * (1 + ((base % 500) - 250) / 20000);
  const change24h = change24hOverride ?? ((base % 900) - 400) / 100;

  const forecasts = generateForecasts(coinKey, price, hourBucket);

  const longPct = 34 + (base % 33);
  const exchangeDepth = EXCHANGES.map((name, i) => ({
    name,
    buy: 30 + ((base + hashStr(name) + i * 131) % 41),
  }));
  const fundingRate = ((base % 61) - 25) / 1000;
  const openInterest = (coin.base > 10000 ? 18 : coin.base > 1000 ? 7 : 2) + (base % 40) / 10;

  return { price, change24h, forecasts, longPct, exchangeDepth, fundingRate, openInterest };
}

// ── Confidence gauge ───────────────────────────────────────────────────────────
function Gauge({ value, accent, size = 56 }: { value: number; accent: string; size?: number }) {
  const sw = 4;
  const r = (size - sw) / 2 - 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" style={{ width: size, height: size }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(94,26,60,0.08)" strokeWidth={sw} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent}
          strokeWidth={sw} strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: "easeOut" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[15px] font-black tabular-nums leading-none" style={{ color: accent }}>{value}</span>
        <span className="text-[6px] font-semibold text-muted-foreground/60 mt-0.5 tracking-widest">CONF</span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function CoinAnalysis() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState("BTC");

  const coin = COINS.find(c => c.key === selected)!;

  const { data: liveData, isLoading } = useQuery({
    queryKey: ["coin-analysis", selected],
    queryFn: () => aiFetch(`/market/coin-analysis/${selected}`),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const hourBucket = Math.floor(Date.now() / 3_600_000);

  const mapForecasts = (raw: { model: string; direction: string; confidence: number; targetPrice: number; reason: string }[]) =>
    raw.map((f) => {
      const meta = MODELS.find((m) => m.name === f.model);
      return {
        model: f.model,
        icon: meta?.icon ?? f.model[0],
        accent: meta?.accent ?? "#8A2B57",
        direction: f.direction as Direction,
        confidence: f.confidence,
        targetPrice: f.targetPrice,
        reasonKey: f.reason,
      };
    });

  const data = useMemo(() => {
    const spotPrice = liveData?.price;
    const spotChange = liveData?.change24h;
    const generated = generateCoinData(selected, hourBucket, spotPrice, spotChange);
    if (!liveData) return generated;

    const price = liveData.price ?? generated.price;
    const apiForecasts = liveData.forecasts?.length ? mapForecasts(liveData.forecasts) : null;
    return {
      price,
      change24h: liveData.change24h ?? generated.change24h,
      longPct: liveData.longPct ?? generated.longPct,
      fundingRate: liveData.fundingRate ?? generated.fundingRate,
      openInterest: liveData.openInterest ?? generated.openInterest,
      exchangeDepth: generated.exchangeDepth,
      forecasts: apiForecasts?.length
        ? normalizeForecastTargets(apiForecasts, price)
        : generated.forecasts,
      summary: liveData.summary as string | undefined,
    };
  }, [liveData, selected, hourBucket]);

  const fallback = useMemo(() => generateCoinData(selected, hourBucket), [selected, hourBucket]);

  const bullish = data.forecasts.filter((f) => f.direction === "BULLISH").length;
  const bearish = data.forecasts.filter((f) => f.direction === "BEARISH").length;
  const avgConf = data.forecasts.length
    ? Math.round(data.forecasts.reduce((s, f) => s + f.confidence, 0) / data.forecasts.length)
    : 0;
  const bestModel =
    data.forecasts.length > 0
      ? [...data.forecasts].sort((a, b) => b.confidence - a.confidence)[0]
      : fallback.forecasts[0];
  const consensus: Direction = bullish > bearish ? "BULLISH" : bearish > bullish ? "BEARISH" : "NEUTRAL";
  const isPos = data.change24h >= 0;

  const dirMeta = (d: Direction) => d === "BULLISH"
    ? { label: t("market.bullish"), color: "text-emerald-600", bg: "bg-emerald-500/10 border-emerald-500/25", icon: <TrendingUp className="h-3 w-3" /> }
    : d === "BEARISH"
      ? { label: t("market.bearish"), color: "text-red-500", bg: "bg-red-500/10 border-red-500/25", icon: <TrendingDown className="h-3 w-3" /> }
      : { label: t("market.neutral"), color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/25", icon: <Minus className="h-3 w-3" /> };

  return (
    <div className="rounded-2xl card-premium glass overflow-hidden">
      {/* Header + coin tabs */}
      <div className="px-4 pt-4 pb-3 border-b border-border/40">
        <div className="flex items-center gap-2 mb-3">
          <BrainCircuit className="h-4 w-4 text-primary" />
          <span className="text-[12px] font-bold text-foreground/80 uppercase tracking-widest">{t("market.caTitle")}</span>
          <span className="hidden sm:inline text-[10px] text-muted-foreground/70">{t("market.caSubtitle")}</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {COINS.map(c => (
            <button key={c.key} onClick={() => setSelected(c.key)}
              className={cn("shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-bold transition-all",
                selected === c.key
                  ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                  : "border-border/40 bg-card/50 text-muted-foreground hover:text-foreground hover:border-border")}>
              <span style={{ color: selected === c.key ? undefined : c.color }} className="font-black">{c.glyph}</span>
              {c.key}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={selected}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="p-4 space-y-4">

          {/* Price + consensus row */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-black text-[13px]" style={{ color: coin.color }}>{coin.glyph}</span>
                <span className="text-[11px] text-muted-foreground font-mono">{coin.symbol}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[26px] font-black font-mono stat-value tracking-tight">${fmtPrice(data.price)}</span>
                <span className={cn("text-[12px] font-bold font-mono flex items-center gap-0.5",
                  isPos ? "text-emerald-600" : "text-red-500")}>
                  {isPos ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {isPos ? "+" : ""}{data.change24h.toFixed(2)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              {(() => { const m = dirMeta(consensus); return (
                <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black", m.bg, m.color)}>
                  <Scale className="h-3.5 w-3.5" />
                  {t("market.caConsensus")}: {m.label}
                </div>
              ); })()}
              <div className="px-3 py-1.5 rounded-xl border border-border/40 bg-card/50 text-[11px] font-bold text-foreground/80">
                {bullish}/{data.forecasts.length} {t("market.bullish")} · {t("market.caAvgConf")} <span className="text-primary font-black">{avgConf}%</span>
              </div>
            </div>
          </div>

          {/* K-line chart with AI forecast overlay */}
          <CoinKlineChart
            coinKey={selected}
            price={data.price}
            seed={hashStr(selected) + hourBucket * 17}
            forecastDirection={bestModel.direction}
            forecastTarget={bestModel.targetPrice}
            forecastModel={bestModel.model}
            forecastConfidence={bestModel.confidence}
          />

          {/* Model forecast cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {data.forecasts.map((f, i) => {
              const m = dirMeta(f.direction);
              const diffPct = ((f.targetPrice - data.price) / data.price) * 100;
              const isBest = f.model === bestModel.model;
              return (
                <motion.div key={f.model}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={cn("rounded-xl border p-3 bg-card/60 transition-all hover:shadow-md",
                    isBest ? "border-amber-400/50" : "border-border/40")}>
                  <div className="flex items-start gap-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="h-6 w-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0"
                          style={{ background: f.accent }}>
                          {f.icon}
                        </div>
                        <span className="text-[12px] font-bold truncate">{f.model}</span>
                        {isBest && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-amber-400/15 text-amber-600 border border-amber-400/30">
                            <Zap className="h-2 w-2" /> {t("market.caBest")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-black", m.bg, m.color)}>
                          {m.icon}{m.label}
                        </span>
                        <span className={cn("text-[11px] font-mono font-bold", diffPct >= 0 ? "text-emerald-600" : "text-red-500")}>
                          {diffPct >= 0 ? "+" : ""}{diffPct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Target className="h-3 w-3" />
                        {t("market.caTarget")}
                        <span className="font-mono font-bold text-foreground text-[11px]">${fmtPrice(f.targetPrice)}</span>
                      </div>
                    </div>
                    <Gauge value={f.confidence} accent={f.accent} />
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/30 text-[10px] text-muted-foreground leading-snug line-clamp-2">
                    <Sparkles className="inline h-2.5 w-2.5 mr-1 text-amber-500/70" />
                    {f.reasonKey.startsWith("market.") ? t(f.reasonKey) : f.reasonKey}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Long/short + exchange depth */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border/40 bg-card/60 p-3.5">
              <div className="flex items-center justify-between mb-2 text-[11px]">
                <span className="font-bold text-foreground/80">{t("market.caLongShort")}</span>
                <div className="flex items-center gap-3 font-mono font-bold">
                  <span className="text-emerald-600">{t("market.longs")} {data.longPct.toFixed(1)}%</span>
                  <span className="text-red-500">{t("market.shorts")} {(100 - data.longPct).toFixed(1)}%</span>
                </div>
              </div>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
                <motion.div className="bg-gradient-to-r from-emerald-600 to-emerald-400"
                  initial={{ width: 0 }} animate={{ width: `${data.longPct}%` }} transition={{ duration: 0.7 }} />
                <motion.div className="bg-gradient-to-r from-red-400 to-red-600"
                  initial={{ width: 0 }} animate={{ width: `${100 - data.longPct}%` }} transition={{ duration: 0.7 }} />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-semibold">{t("market.caFunding")}</div>
                  <div className={cn("text-[13px] font-black font-mono mt-0.5", data.fundingRate >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {data.fundingRate >= 0 ? "+" : ""}{data.fundingRate.toFixed(4)}%
                  </div>
                </div>
                <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-semibold">{t("market.caOpenInterest")}</div>
                  <div className="text-[13px] font-black font-mono mt-0.5 text-foreground">
                    ${data.openInterest.toFixed(1)}B
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/40 bg-card/60 p-3.5">
              <div className="text-[11px] font-bold text-foreground/80 mb-2">{t("market.caExchDepth")}</div>
              <div className="space-y-1.5">
                {data.exchangeDepth.map((ex, i) => (
                  <div key={ex.name} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[10px] font-semibold text-muted-foreground truncate">{ex.name}</span>
                    <div className="flex-1 flex h-[10px] rounded-sm overflow-hidden bg-muted">
                      <motion.div style={{ background: "linear-gradient(90deg, rgba(16,185,129,0.55), rgba(16,185,129,0.85))" }}
                        initial={{ width: 0 }} animate={{ width: `${ex.buy}%` }} transition={{ duration: 0.5, delay: i * 0.05 }} />
                      <motion.div style={{ background: "linear-gradient(90deg, rgba(239,68,68,0.85), rgba(239,68,68,0.55))" }}
                        initial={{ width: 0 }} animate={{ width: `${100 - ex.buy}%` }} transition={{ duration: 0.5, delay: i * 0.05 }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-[10px] font-mono font-bold text-emerald-600">{ex.buy}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
