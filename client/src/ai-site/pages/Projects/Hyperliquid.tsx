import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  ComposedChart, Bar, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, TrendingUp, TrendingDown, BarChart2,
  Wallet, Activity, Clock, Users, ExternalLink, AlertTriangle,
} from "lucide-react";
import { Link, useRoute } from "wouter";
import { useHLVault, useHLCandles, HL_TRACKED_VAULTS } from "./useHyperliquid";

function useShowZh() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("zh") ?? true;
}

const VAULT_LABELS: Record<string, { zh: string; en: string }> = {
  "0xc179e03922afe8fa9533d3f896338b9fb87ce0c8": { zh: "金库 A · Alpha", en: "Vault A · Alpha" },
  "0xd6e56265890b76413d1d527eb9b75e334c0c5b42": { zh: "金库 B · Beta", en: "Vault B · Beta" },
};

const INTERVAL_OPTIONS = [
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
];

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtM(n: number) {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtDate(ts: number, withTime = false) {
  const d = new Date(ts);
  return withTime
    ? d.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" });
}
function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const TT = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: 4 },
  cursor: { fill: "hsl(var(--primary) / 0.06)" },
};

const UP = "hsl(150,60%,36%)";
const DOWN = "hsl(0,72%,48%)";

export default function HyperLiquid() {
  const showZh = useShowZh();
  const [, params] = useRoute<{ address?: string }>("/projects/hyperliquid/:address");
  const routeAddr = params?.address?.toLowerCase();
  const VAULT_ADDRESS =
    routeAddr && HL_TRACKED_VAULTS.includes(routeAddr as (typeof HL_TRACKED_VAULTS)[number])
      ? routeAddr
      : HL_TRACKED_VAULTS[0];
  const vaultLabel = VAULT_LABELS[VAULT_ADDRESS] ?? { zh: "金库", en: "Vault" };
  const { data: vault, isLoading: vaultLoading, isError: vaultError } = useHLVault(VAULT_ADDRESS);
  const [interval, setInterval] = useState("1d");
  const { data: candleData, isLoading: candleLoading } = useHLCandles(interval);

  const candles = candleData?.candles ?? [];

  const chartCandles = candles.map(c => ({
    ...c,
    date: fmtDate(c.ts, interval === "1h" || interval === "4h"),
    isUp: c.close >= c.open,
    bodySize: Math.abs(c.close - c.open),
  }));

  const equityChart = (vault?.equityHistory ?? []).map(h => ({
    date: fmtDate(h.ts),
    equity: h.value,
  }));

  const pnlChart = (vault?.pnlHistory ?? []).map(h => ({
    date: fmtDate(h.ts),
    pnl: h.value,
  }));

  const aprPct = vault ? vault.apr * 100 : 0;

  const currentPrice = candles.at(-1)?.close ?? 0;
  const prevPrice = candles.at(-2)?.close ?? 0;
  const priceChange = prevPrice ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

  return (
    <div className="container mx-auto px-4 py-8 space-y-10">

      {/* Back link + vault switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />{showZh && <span>返回项目库 · </span>}Back to Projects
        </Link>
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 text-xs self-start sm:self-auto">
          {HL_TRACKED_VAULTS.map((addr) => {
            const active = addr === VAULT_ADDRESS;
            const label = VAULT_LABELS[addr];
            return (
              <Link
                key={addr}
                href={`/projects/hyperliquid/${addr}`}
                className={`rounded-full px-3 py-1 font-mono tabular-nums transition-all ${
                  active
                    ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {showZh ? label.zh : label.en}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Error state */}
      {vaultError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">
                {showZh ? "无法连接 Hyperliquid 公开 API" : "Unable to reach the Hyperliquid public API"}
              </p>
              <p className="text-sm text-muted-foreground">
                {showZh
                  ? "请稍后重试，或检查网络连接。金库数据将在恢复后自动刷新。"
                  : "Please try again later or check your connection. Vault data will refresh automatically once available."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Hero Banner ── */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-8 md:px-10 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10">
          {/* Logo + title */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-16 h-16 rounded-xl border border-emerald-500/30 bg-emerald-500/10 shrink-0 flex items-center justify-center">
              <span className="text-2xl font-black text-emerald-600 tracking-tighter">HL</span>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-600/80 block mb-1">
                {showZh && <span>金库实时数据 · </span>}Live Vault Intelligence
              </span>
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
                {vault?.name || (showZh ? vaultLabel.zh : vaultLabel.en)}
              </h1>
              <p className="text-sm text-muted-foreground mt-1 tracking-wide">
                Hyperliquid Vault{showZh && <span> · 链上永续合约做市金库</span>}
              </p>
              {/* Vault address */}
              <div className="mt-2 inline-flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-muted border border-border rounded-lg px-3 py-1">
                  <Wallet className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs text-muted-foreground hidden sm:block">{VAULT_ADDRESS}</span>
                  <span className="font-mono text-xs text-muted-foreground sm:hidden">{shortAddr(VAULT_ADDRESS)}</span>
                  <a href={`https://app.hyperliquid.xyz/vaults/${VAULT_ADDRESS}`} target="_blank" rel="noopener noreferrer"
                    className="text-emerald-600/80 hover:text-emerald-600 transition-colors ml-1">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <Badge variant="outline" className="text-[11px] border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                  {vault?.isClosed ? (showZh ? "已关闭" : "Closed") : (showZh ? "运行中" : "Active")}
                </Badge>
              </div>
            </div>
          </div>

          {/* Stat strip */}
          {vaultLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-border">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : vault ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-border">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">TVL{showZh && <span> / 总锁仓</span>}</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-foreground">{fmtM(vault.latestEquity)}</div>
                {showZh && <div className="text-[11px] text-muted-foreground">金库总价值</div>}
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">APR{showZh && <span> / 年化</span>}</div>
                <div className={`text-2xl font-bold ${aprPct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {aprPct >= 0 ? "+" : ""}{fmt(aprPct, 2)}%
                </div>
                {showZh && <div className="text-[11px] text-muted-foreground">实时年化收益率</div>}
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">All-Time PnL</div>
                <div className={`text-2xl font-bold font-mono tabular-nums ${vault.allTimePnl >= 0 ? "text-primary" : "text-red-500"}`}>
                  {vault.allTimePnl >= 0 ? "+" : ""}{fmtM(vault.allTimePnl)}
                </div>
                {showZh && <div className="text-[11px] text-muted-foreground">历史累计盈亏</div>}
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">Followers</div>
                <div className="text-2xl font-bold text-foreground">{vault.followers.toLocaleString()}</div>
                {showZh && <div className="text-[11px] text-muted-foreground">跟单用户数</div>}
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>

      {/* ── PnL Summary Cards ── */}
      {vault && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "今日盈亏", labelEn: "Day PnL", value: vault.dayPnl },
            { label: "本周盈亏", labelEn: "Week PnL", value: vault.weekPnl },
            { label: "本月盈亏", labelEn: "Month PnL", value: vault.monthPnl },
            { label: "历史盈亏", labelEn: "All-Time", value: vault.allTimePnl },
          ].map(({ label, labelEn, value }) => {
            const up = value >= 0;
            return (
              <div key={labelEn} className={`p-4 rounded-xl border ${up ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{labelEn}{showZh && ` · ${label}`}</p>
                <p className={`font-mono text-lg font-bold ${up ? "text-emerald-600" : "text-red-500"}`}>
                  {up ? "+" : ""}{fmtM(value)}
                </p>
                <div className={`flex items-center gap-1 mt-1 ${up ? "text-emerald-600" : "text-red-500"}`}>
                  {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {showZh && <span className="text-[11px]">{up ? "盈利" : "亏损"}</span>}
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* ── Analysis Section ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.15 }}
        className="space-y-8">

        <div className="border-b border-border pb-4">
          <div className="border-l-[3px] border-emerald-500 pl-4">
            {showZh && <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600/70 block mb-0.5">市场数据</span>}
            <h2 className="text-xl font-bold tracking-tight text-foreground">Market Intelligence</h2>
            {showZh && <p className="text-xs text-muted-foreground mt-0.5">HYPE价格K线 · 金库规模 · 累计盈亏走势</p>}
          </div>
        </div>

        {/* Row 1: HYPE K-line chart */}
        <Card className="bg-card border-border shadow-sm overflow-hidden border-t-2 border-t-emerald-500/50">
          <CardHeader className="pb-2 border-b border-border">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                <BarChart2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>HYPE{showZh && <span> 价格走势</span>}</span>
                <span className="text-xs text-muted-foreground font-normal">Price Chart</span>
                {currentPrice > 0 && (
                  <span className="font-mono font-bold text-foreground">${fmt(currentPrice)}</span>
                )}
                {priceChange !== 0 && (
                  <span className={`text-xs font-mono ${priceChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {priceChange >= 0 ? "+" : ""}{fmt(priceChange, 2)}%
                  </span>
                )}
              </CardTitle>
              <div className="flex gap-1 self-start sm:self-auto">
                {INTERVAL_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setInterval(opt.value)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-all ${interval === opt.value ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/40" : "text-muted-foreground hover:text-foreground border border-transparent hover:border-border"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 pb-2">
            {candleLoading ? (
              <Skeleton className="h-[220px] sm:h-[300px] w-full" />
            ) : chartCandles.length > 0 ? (
              <ResponsiveContainer width="100%" height={typeof window !== "undefined" && window.innerWidth < 640 ? 220 : 300}>
                <ComposedChart data={chartCandles} margin={{ top: 4, right: 12, left: -8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="hlCloseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={UP} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={UP} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false}
                    domain={["auto", "auto"]} tickFormatter={v => `$${v}`} width={52} />
                  <Tooltip {...TT}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.[0]) return null;
                      const d = payload[0].payload as typeof chartCandles[0];
                      return (
                        <div style={TT.contentStyle} className="space-y-1 p-3">
                          <p style={TT.labelStyle} className="mb-2">{label}</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                            <span className="text-muted-foreground">{showZh && <span>开盘 · </span>}Open</span><span className="font-mono font-medium">${fmt(d.open)}</span>
                            <span className="text-muted-foreground">{showZh && <span>收盘 · </span>}Close</span>
                            <span className={`font-mono font-bold ${d.isUp ? "text-emerald-600" : "text-red-500"}`}>${fmt(d.close)}</span>
                            <span className="text-muted-foreground">{showZh && <span>最高 · </span>}High</span><span className="font-mono font-medium text-emerald-600">${fmt(d.high)}</span>
                            <span className="text-muted-foreground">{showZh && <span>最低 · </span>}Low</span><span className="font-mono font-medium text-red-500">${fmt(d.low)}</span>
                            <span className="text-muted-foreground">{showZh && <span>成交量 · </span>}Vol</span><span className="font-mono">{(d.volume / 1e6).toFixed(2)}M</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="close" stroke={UP} strokeWidth={2}
                    fill="url(#hlCloseGrad)" dot={false} name={showZh ? "收盘价" : "Close"} />
                  <Bar dataKey="volume" yAxisId="vol" name={showZh ? "成交量" : "Volume"} maxBarSize={8} opacity={0.35}
                    radius={[2, 2, 0, 0]}>
                    {chartCandles.map((c, i) => (
                      <Cell key={i} fill={c.isUp ? UP : DOWN} />
                    ))}
                  </Bar>
                  <YAxis yAxisId="vol" hide domain={[0, (max: number) => max * 8]} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">{showZh ? "暂无数据" : "No data"}</div>
            )}
          </CardContent>
        </Card>

        {/* Row 2: Vault Equity + PnL */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Vault Equity over time */}
          <Card className="bg-card border-border shadow-sm overflow-hidden border-t-2 border-t-blue-500/50">
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                {showZh && <span>金库规模走势</span>}
                <span className="text-xs text-muted-foreground font-normal">Vault Equity</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 pb-2">
              {vaultLoading ? <Skeleton className="h-[220px] w-full" /> : equityChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={equityChart} margin={{ top: 4, right: 12, left: -8, bottom: 4 }}>
                    <defs>
                      <linearGradient id="hlEquityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(217,80%,55%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(217,80%,55%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={v => `$${(v / 1e6).toFixed(0)}M`} width={52} />
                    <Tooltip {...TT} formatter={(v: number) => [fmtM(v), showZh ? "金库规模" : "Vault Size"]} />
                    <Area type="monotone" dataKey="equity" stroke="hsl(217,80%,55%)" strokeWidth={2}
                      fill="url(#hlEquityGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">{showZh ? "暂无数据" : "No data"}</div>}
            </CardContent>
          </Card>

          {/* All-time PnL */}
          <Card className="bg-card border-border shadow-sm overflow-hidden border-t-2 border-t-primary/50">
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                {showZh && <span>历史累计盈亏</span>}
                <span className="text-xs text-muted-foreground font-normal">All-Time PnL</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 pb-2">
              {vaultLoading ? <Skeleton className="h-[220px] w-full" /> : pnlChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={pnlChart} margin={{ top: 4, right: 12, left: -8, bottom: 4 }}>
                    <defs>
                      <linearGradient id="hlPnlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={v => `$${(v / 1e6).toFixed(0)}M`} width={52} />
                    <Tooltip {...TT} formatter={(v: number) => [fmtM(v), showZh ? "累计盈亏" : "Cumulative PnL"]} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="pnl" stroke="hsl(var(--primary))" strokeWidth={2}
                      fill="url(#hlPnlGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">{showZh ? "暂无数据" : "No data"}</div>}
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* ── Vault Info Table ── */}
      {vault && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.25 }}
          className="space-y-6">

          <div className="border-b border-border pb-4">
            <div className="border-l-[3px] border-emerald-500 pl-4">
              {showZh && <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600/70 block mb-0.5">基本信息</span>}
              <h2 className="text-xl font-bold tracking-tight text-foreground">Vault Details</h2>
              {showZh && <p className="text-xs text-muted-foreground mt-0.5">合约地址 · 管理员 · 参数配置</p>}
            </div>
          </div>

          <Card className="bg-card border-border shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    { label: "合约地址", labelEn: "Vault Address", value: VAULT_ADDRESS, mono: true, isAddr: true, link: `https://app.hyperliquid.xyz/vaults/${VAULT_ADDRESS}` },
                    { label: "管理员地址", labelEn: "Leader", value: vault.leader, mono: true, isAddr: true, link: `https://app.hyperliquid.xyz/profile/${vault.leader}` },
                    { label: "管理员份额", labelEn: "Leader Fraction", value: `${(vault.leaderFraction * 100).toFixed(1)}%`, mono: false },
                    { label: "管理员佣金", labelEn: "Commission", value: `${(vault.leaderCommission * 100).toFixed(1)}%`, mono: false },
                    { label: "年化收益率", labelEn: "APR", value: `${aprPct >= 0 ? "+" : ""}${fmt(aprPct, 3)}%`, mono: false, highlight: true },
                    { label: "接受存款", labelEn: "Allow Deposits", value: vault.allowDeposits ? "是 Yes" : "否 No", mono: false },
                    { label: "跟单人数", labelEn: "Followers", value: vault.followers.toLocaleString(), mono: false },
                    { label: "今日盈亏", labelEn: "Day PnL", value: (vault.dayPnl >= 0 ? "+" : "") + fmtM(vault.dayPnl), mono: true, highlight: true },
                    { label: "历史累计盈亏", labelEn: "All-Time PnL", value: (vault.allTimePnl >= 0 ? "+" : "") + fmtM(vault.allTimePnl), mono: true, highlight: true },
                  ].map(({ label, labelEn, value, mono, link, highlight, isAddr }, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-3 sm:px-5 text-muted-foreground w-28 sm:w-40 shrink-0">
                        <span className="hidden sm:inline">{labelEn}</span>
                        <span className="sm:hidden text-[11px]">{showZh ? label : labelEn}</span>
                        {showZh && <span className="ml-1.5 text-[11px] opacity-50 hidden sm:inline">{label}</span>}
                      </td>
                      <td className="py-3 px-3 sm:px-5 text-right">
                        {link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1 hover:underline ${mono ? "font-mono" : ""} ${highlight ? "text-emerald-600 font-semibold" : "text-foreground"}`}>
                            {isAddr ? (
                              <>
                                <span className="hidden sm:inline text-xs">{value}</span>
                                <span className="sm:hidden text-xs">{shortAddr(value)}</span>
                              </>
                            ) : (
                              <span>{value}</span>
                            )}
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                          </a>
                        ) : (
                          <span className={`${mono ? "font-mono" : ""} ${highlight ? "font-semibold" + (value.startsWith("+") ? " text-emerald-600" : " text-red-500") : "font-medium"}`}>
                            {value}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Description */}
          {vault.description && (
            <div className="p-5 rounded-xl border border-border bg-muted/30 space-y-2">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-1.5">
                <Clock className="h-3 w-3" />{showZh && <span>项目简介 · </span>}Description
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">{vault.description}</p>
            </div>
          )}

          {/* Live data note */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {showZh && <span>数据实时同步自 HyperLiquid 公开 API · 每 2 分钟自动刷新</span>}
            <Users className="h-3 w-3 ml-auto" />
            <span>{vault.followers} {showZh ? "跟单用户" : "followers"}</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
