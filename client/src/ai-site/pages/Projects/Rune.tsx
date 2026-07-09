import { useState, useMemo, useEffect } from "react";
import type { ReactNode, ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  BarChart, Bar, Line, AreaChart, Area, ComposedChart,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft, BarChart2, Coins, Flame, TrendingUp,
  Layers, BadgeCheck, ChevronRight, PieChart as PieIcon, Activity,
} from "lucide-react";
import { Link } from "wouter";
import {
  RUNE_OVERVIEW, STAGE_EN_LABELS, C, NODE_COLORS, PIE_COLORS,
  type RuneNode, type RunePriceStage, type RuneNodeLevel,
} from "./runeData";
import {
  subPriceAtTlp, buildFullSimulation, calcNodeReturns, fmt, fmtPrice,
  TARGET_TLP_WAN, LAUNCH_TLP_WAN, DAILY_PROTOCOL_BURN, TOTAL_NODE_WEIGHT, SIM_HORIZON_DAYS,
} from "./runeCalc";

// ── Bilingual helper (zh renders "中文 · ENG", en renders English only) ────────
function useBi() {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh") ?? true;
  const isEn = !isZh;
  return {
    isEn,
    isZh,
    /** zh literal + optional " · <ENG>" suffix, or English when en */
    bi: (zh: string, en: string) => (isEn ? en : `${zh} · ${en}`),
  };
}

// ── Light-theme chart tooltip style ───────────────────────────────────────────
const tooltipStyle = {
  contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: 4 },
  cursor: { fill: "hsl(var(--primary) / 0.06)" },
};

// ── Simplified light-theme "Tech" chart card (no scan-lines / brackets / glow) ─
function TechChartCard({
  icon: Icon, title, subtitle, className = "", children,
}: {
  icon: ElementType;
  title: string;
  subtitle?: string;
  accent?: string;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden shadow-sm ${className}`}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground tracking-tight leading-tight truncate">{title}</h3>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight font-mono tabular-nums">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 animate-ping" />
            <span className="relative inline-flex h-full w-full rounded-full bg-primary" />
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60 font-medium hidden sm:inline">LIVE</span>
        </div>
      </div>
      <div className="px-3 pt-4 pb-3">{children}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, zh, en }: { icon: ElementType; zh: string; en: string }) {
  const { isEn, isZh } = useBi();
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
      <Icon className="h-4 w-4 text-primary" />
      {isEn ? en : zh}
      {isZh && <> · <span className="text-muted-foreground/60">{en}</span></>}
    </h2>
  );
}

type V2Tab = "calc" | "node" | "pkg" | "dual";

export default function Rune() {
  const { isEn, isZh, bi } = useBi();
  const overview = RUNE_OVERVIEW;

  const stageLabel = (s: RunePriceStage, i: number) => (isZh ? s.labelCn : (STAGE_EN_LABELS[i] ?? s.labelCn));
  const nodeName = (n: RuneNode) => (isZh ? n.nameCn : n.nameEn);

  const [nodeLevel, setNodeLevel] = useState<RuneNodeLevel>("initial");
  const [seats] = useState(1);
  const [durationDays, setDurationDays] = useState(180);
  const [priceStageIndex, setPriceStageIndex] = useState(3);
  const [trendScale, setTrendScale] = useState<"log" | "linear">("log");
  const [simTokenView, setSimTokenView] = useState<"mother" | "sub">("mother");

  const [v2Tab, setV2Tab] = useState<V2Tab>("calc");

  // Trading-dividend inputs
  const [motherDailyVolume, setMotherDailyVolume] = useState(1_000_000);
  const [subDailyVolume, setSubDailyVolume] = useState(500_000);
  const [avgSellProfitPct, setAvgSellProfitPct] = useState(20);

  // Activity-driven price simulation inputs
  const [monthlyActiveUsers, setMonthlyActiveUsers] = useState(1500);
  const [avgPackageUsdt, setAvgPackageUsdt] = useState(3600);

  // 质押 (pkg) tab
  const [pkgUsdt, setPkgUsdt] = useState(1000);
  const [pkgDays, setPkgDays] = useState<30 | 90 | 180 | 360 | 540>(540);
  const [pkgRatePct, setPkgRatePct] = useState(0.7);
  const PKG_SUB_LAUNCH_PRICE = 0.038;

  // 双币联动 (dual) tab
  const [burnTokens, setBurnTokens] = useState(1000);
  const [burnDays, setBurnDays] = useState(360);
  const [stakeStage, setStakeStage] = useState(3);
  const [globalSubStaked, setGlobalSubStaked] = useState(100_000);
  const [aiPoolMonthly, setAiPoolMonthly] = useState(1_000_000);
  const [idosPerMonth, setIdosPerMonth] = useState(1.5);
  const [idoAvgMultiplier, setIdoAvgMultiplier] = useState(50);
  const [idoAllocFactor, setIdoAllocFactor] = useState(0.003);

  useEffect(() => {
    const next = burnDays <= 30 ? 1 : burnDays <= 90 ? 2 : burnDays <= 180 ? 3 : burnDays <= 360 ? 4 : 5;
    setStakeStage(next);
  }, [burnDays]);

  const selectedNode = overview.nodes.find(n => n.level === nodeLevel);
  const selectedStagePreview = overview.priceStages[priceStageIndex];

  const monthSuffix = isEn ? "mo" : "月";

  // ── AMM simulation ──────────────────────────────────────────────────────────
  const fullSimulation = useMemo(
    () => buildFullSimulation(monthlyActiveUsers, avgPackageUsdt),
    [monthlyActiveUsers, avgPackageUsdt],
  );

  const priceSimulation = useMemo(() =>
    fullSimulation.filter((_, i) => i % 10 === 0).map(s => ({
      day: s.day,
      tlp: s.tlpUsdt / 10000,
      lpRune: Math.round(s.lpRune),
      price: s.lpRune > 0 ? Math.round((s.tlpUsdt / s.lpRune) * 1e6) / 1e6 : 0,
      subPrice: Math.round(subPriceAtTlp(s.tlpUsdt) * 1e4) / 1e4,
    })), [fullSimulation]);

  const dayWhenTlpReaches = (targetWan: number): number => {
    const target = targetWan * 10000;
    const found = fullSimulation.find(s => s.tlpUsdt >= target);
    return found ? found.day : SIM_HORIZON_DAYS;
  };
  const lpRuneAt = (d: number): number => fullSimulation[Math.min(d, SIM_HORIZON_DAYS)]?.lpRune ?? 1e8;
  const tlpAt = (d: number): number => (fullSimulation[Math.min(d, SIM_HORIZON_DAYS)]?.tlpUsdt ?? 0) / 10000;

  const priceMilestones = useMemo(() => {
    return [
      { tlpTarget: 700, label: "TLP 700万" },
      { tlpTarget: 1750, label: "TLP 1750万" },
      { tlpTarget: 3500, label: "TLP 3500万" },
    ].map(({ tlpTarget, label }) => {
      const day = dayWhenTlpReaches(tlpTarget);
      const lpRune = lpRuneAt(day);
      const tlp = tlpAt(day);
      const price = lpRune > 0 ? (tlp * 10000) / lpRune : 0;
      const subPrice = subPriceAtTlp(tlp * 10000);
      return { day, label, data: { tlp, lpRune: Math.round(lpRune), price, subPrice } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullSimulation]);

  const dynamicMotherPriceByStage = useMemo(() => {
    const stageTlp: Record<number, number> = { 0: LAUNCH_TLP_WAN, 1: 700, 2: 1750, 3: TARGET_TLP_WAN };
    const out: Record<number, number> = {};
    for (const [idx, tlp] of Object.entries(stageTlp)) {
      const d = dayWhenTlpReaches(tlp);
      const lp = lpRuneAt(d);
      const t = tlpAt(d);
      out[Number(idx)] = lp > 0 ? (t * 10000) / lp : 0;
    }
    const finalState = fullSimulation[fullSimulation.length - 1];
    if (finalState) {
      for (const [idx, day] of [[4, 540], [5, 720]] as const) {
        const extraDays = Math.max(0, day - finalState.day);
        const lpRune = finalState.lpRune * Math.pow(1 - DAILY_PROTOCOL_BURN, extraDays);
        out[idx] = lpRune > 0 ? finalState.tlpUsdt / lpRune : 0;
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullSimulation]);

  const motherPriceForStage = (idx: number, fallback: number): number =>
    dynamicMotherPriceByStage[idx] ?? fallback;

  // ── Chart datasets ────────────────────────────────────────────────────────
  const deflationData = useMemo(() => {
    const total = overview.subToken.totalSupply;
    const baseRate = overview.subToken.dailyBurnRate;
    const dailyInflowU = (monthlyActiveUsers * avgPackageUsdt) / 30;
    const activityFactor = Math.min(dailyInflowU / 180_000, 5);
    const effectiveRate = baseRate * (1 + activityFactor);
    const months = [0, 1, 2, 3, 4, 5, 6, 9, 12, 15, 18, 21, 24];
    return months.map(m => ({
      month: `${m}${monthSuffix}`,
      circulating: Math.round(total * Math.pow(1 - effectiveRate, m * 30)),
      burned: Math.round(total - total * Math.pow(1 - effectiveRate, m * 30)),
    }));
  }, [overview, monthSuffix, monthlyActiveUsers, avgPackageUsdt]);

  const nodeCompareData = useMemo(() => {
    return overview.priceStages.map((stage, i) => {
      const dynPrice = motherPriceForStage(i, stage.motherPrice);
      const row: Record<string, string | number> = { label: stageLabel(stage, i) };
      overview.nodes.forEach(n => {
        row[n.level] = Math.round(n.motherTokensPerSeat * dynPrice + n.airdropPerSeat * dynPrice + n.dailyUsdt * 180);
      });
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, isEn, dynamicMotherPriceByStage]);

  const priceStageChartData = useMemo(() => {
    const launchPrice = overview.motherToken.launchPrice;
    return overview.priceStages.map((s, i) => {
      const dynMother = motherPriceForStage(i, s.motherPrice);
      return {
        label: stageLabel(s, i),
        mother: Math.round(dynMother * 1e4) / 1e4,
        sub: s.subPrice,
        mult: launchPrice > 0 ? Math.round((dynMother / launchPrice) * 100) / 100 : s.multiplier,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, isEn, dynamicMotherPriceByStage]);

  const fundAllocData = useMemo(() => {
    const f = overview.fundraising;
    return [
      { name: isZh ? "TLP流动池" : "TLP Pool", value: f.tlpPool },
      { name: isZh ? "运营资金" : "Operations", value: f.operations },
      { name: isZh ? "国库资金" : "Treasury", value: f.treasury },
      { name: isZh ? "子TOKEN LP" : "Sub-Token LP", value: f.subTokenLP },
    ];
  }, [overview, isZh]);

  // ── Node returns calculator ──────────────────────────────────────────────
  const dynamicCalc = useMemo(() => {
    if (!selectedNode) return null;
    const staticPrice = overview.priceStages[priceStageIndex]?.motherPrice ?? 0;
    const dynamicPrice = motherPriceForStage(priceStageIndex, staticPrice);
    const subPrice = overview.priceStages[priceStageIndex]?.subPrice ?? 0;
    const r = calcNodeReturns(selectedNode, durationDays, dynamicPrice, subPrice, seats);
    return { ...r, dynamicPrice, staticPrice };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode, durationDays, priceStageIndex, dynamicMotherPriceByStage, seats]);

  const resultPieData = dynamicCalc ? [
    { name: isEn ? "Mother Token Value" : "母币价值", value: dynamicCalc.motherTokenValue },
    { name: isEn ? "Mother Airdrop" : "母币空投", value: dynamicCalc.airdropTokenValue },
    { name: isEn ? "Sub-Token (35% dyn)" : "子币 (动态35%)", value: dynamicCalc.subTokenValue },
    { name: isEn ? "USDT Income (65% static)" : "USDT 收益 (65%静态)", value: dynamicCalc.totalUsdtIncome },
  ] : [];
  const RESULT_COLORS = [C.mother, "hsl(38,85%,50%)", C.sub, C.usdt];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto px-4 py-8 space-y-10">

      {/* Back link */}
      <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />{isEn ? "Back to Projects" : "返回项目列表"}
      </Link>

      {/* ── Header Banner ── */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-8 md:px-10 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-xl flex items-center justify-center border border-primary/25 shrink-0 bg-primary/10 text-primary font-bold text-2xl">
              R
            </div>
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/60 mb-1">
                {isEn ? "Deep Node Analysis" : "深度节点分析 · Deep Node Analysis"}
              </span>
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight gradient-text-gold leading-tight">
                RUNE Protocol
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground tracking-wide">
                {isEn
                  ? "Node ROI · Dual-token deflation · Burn-stake · IDO allocation"
                  : "节点收益 · 双币通缩 · 销毁质押 · IDO 打新"}
              </p>
            </div>
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-border/60">
            {[
              { labelEn: "USDT APY", labelZh: "USDT 年化", value: "170.82%", highlight: true },
              { labelEn: "TVL", labelZh: "总锁仓", value: "$312M", highlight: true },
              { labelEn: "Node Tiers", labelZh: "节点档位", value: "5", highlight: false },
              { labelEn: "Price Stages", labelZh: "价格阶段", value: "6", highlight: false },
            ].map(({ labelEn, labelZh, value, highlight }) => (
              <div key={labelEn} className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 font-medium">{labelEn}</div>
                <div className={`text-2xl leading-none font-mono tabular-nums ${highlight ? "text-primary font-semibold" : "text-foreground"}`}>
                  {value}
                </div>
                {!isEn && <div className="text-[11px] text-muted-foreground/70">{labelZh}</div>}
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Token Info ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {([
          {
            kind: "mother", labelZh: "母币", labelEn: "Mother Token", symbol: overview.motherToken.symbol,
            color: "text-sky-600", Icon: Flame,
            rows: [
              { kZh: "开盘", kEn: "Open", v: `$${overview.motherToken.launchPrice}`, accent: false },
              { kZh: "供应", kEn: "Supply", v: `${(overview.motherToken.totalSupply / 1e8).toFixed(1)}${isEn ? "B" : "枚"}`, accent: false },
              { kZh: "日烧", kEn: "Daily Burn", v: `${(overview.motherToken.dailyBurnRate * 100).toFixed(1)}%`, accent: false },
              { kZh: "24月目标", kEn: "24M Target", v: `$${overview.motherToken.targetPriceLow}~${overview.motherToken.targetPriceHigh}`, accent: true },
            ],
          },
          {
            kind: "sub", labelZh: "子币", labelEn: "Sub Token", symbol: overview.subToken.symbol,
            color: "text-orange-600", Icon: TrendingUp,
            rows: [
              { kZh: "开盘", kEn: "Initial", v: `$${overview.subToken.launchPrice}`, accent: false },
              { kZh: "供应", kEn: "Supply", v: `${(overview.subToken.totalSupply / 1e6).toFixed(1)}M`, accent: false },
              { kZh: "日烧", kEn: "Daily Burn", v: `${(overview.subToken.dailyBurnRate * 100).toFixed(1)}%`, accent: false },
              { kZh: "24月目标", kEn: "24M Target", v: `$${overview.subToken.targetPriceLow}~${overview.subToken.targetPriceHigh}`, accent: true },
            ],
          },
        ] as const).map(({ kind, labelZh, labelEn, symbol, color, Icon, rows }) => (
          <div key={kind} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className={`text-[11px] uppercase tracking-[0.22em] font-semibold ${color}`}>
                {isEn ? labelEn : labelZh}{isZh && <> · <span className="opacity-70">{labelEn}</span></>}
              </span>
              <Icon className={`h-4 w-4 ${color} opacity-70`} />
            </div>
            <p className={`font-mono tabular-nums text-4xl sm:text-5xl leading-none mb-4 font-bold ${color}`}>{symbol}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {rows.map(r => (
                <div key={r.kEn} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">{isEn ? r.kEn : r.kZh}</span>
                  <span className={r.accent ? "font-mono tabular-nums text-primary font-semibold text-base" : "font-mono tabular-nums text-foreground text-base"}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </motion.div>

      {/* ═══ ANALYSIS SECTION ═══ */}
      <div className="space-y-8">
        <div className="border-b border-border pb-4">
          <div className="border-l-[3px] border-primary pl-4">
            {!isEn && <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/60 block mb-0.5">深度分析</span>}
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {isEn ? "Market Analysis" : "市场分析 · Market Analysis"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEn ? "Protocol-level dashboards — price stages, fund allocation, deflation." : "协议级仪表盘 — 价格阶段、资金分配、通缩曲线。"}
            </p>
          </div>
        </div>

        {/* Row 1: Price Stages + Fund Allocation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <TechChartCard
            icon={BarChart2}
            title={isEn ? "Six-Stage Dual Line" : "六阶段双币曲线 · Six-Stage Dual Line"}
            subtitle="$0.028 → $4.56 · 163×"
            className="lg:col-span-2"
          >
            <div className="relative">
              <div className="absolute top-0 right-2 z-10 inline-flex items-center gap-1 rounded-full border border-primary/25 bg-background/50 p-1 text-[11px] uppercase tracking-[0.18em]">
                {(["log", "linear"] as const).map(s => (
                  <button key={s} type="button" onClick={() => setTrendScale(s)}
                    className={`rounded-full px-3 py-0.5 font-mono tabular-nums transition-all ${trendScale === s ? "bg-primary/15 text-primary" : "text-muted-foreground/60 hover:text-primary/80"}`}>
                    {s === "log" ? (isEn ? "Log" : "对数") : (isEn ? "Linear" : "线性")}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={priceStageChartData} margin={{ top: 28, right: 18, left: 0, bottom: 6 }}>
                  <defs>
                    <linearGradient id="areaMotherGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.mother} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={C.mother} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="mother" orientation="left" tick={{ fill: C.mother, fontSize: 10 }} axisLine={false} tickLine={false}
                    scale={trendScale} domain={trendScale === "log" ? [0.02, "auto"] : [0, "auto"]} allowDataOverflow
                    tickFormatter={v => v >= 1 ? `$${(+v).toFixed(1)}` : `$${(+v).toFixed(2)}`} />
                  <YAxis yAxisId="sub" orientation="right" tick={{ fill: C.sub, fontSize: 10 }} axisLine={false} tickLine={false}
                    scale={trendScale} domain={trendScale === "log" ? [0.04, "auto"] : [0, "auto"]} allowDataOverflow
                    tickFormatter={v => v >= 1 ? `$${(+v).toFixed(0)}` : `$${(+v).toFixed(2)}`} />
                  <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`$${fmt(v, v < 1 ? 4 : 2)}`, name]} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.muted, paddingTop: 8 }} iconType="circle" />
                  <Line yAxisId="mother" type="monotone" dataKey="mother" name={isEn ? "Mother (RUNE)" : "母币 RUNE"}
                    stroke={C.mother} strokeWidth={2.8} dot={{ r: 3, fill: C.mother, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  <Line yAxisId="sub" type="monotone" dataKey="sub" name={isEn ? "Sub (FIRE)" : "子币 FIRE"}
                    stroke={C.sub} strokeWidth={2.8} dot={{ r: 3, fill: C.sub, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-6 gap-1 mt-2 px-1">
                {priceStageChartData.map((d, i) => (
                  <div key={i} className="text-center">
                    <span className={`text-[11px] font-mono tabular-nums ${d.mult >= 80 ? "text-primary font-semibold" : d.mult > 1 ? "text-primary/60" : "text-muted-foreground/50"}`}>
                      {d.mult > 1 ? `${d.mult}×` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </TechChartCard>

          <TechChartCard icon={PieIcon} title={isEn ? "Fund Allocation" : "资金分配 · Fund Allocation"}>
            {(() => {
              const total = fundAllocData.reduce((s, x) => s + x.value, 0) || 1;
              return (
                <div className="px-2 pb-1">
                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground/60 mb-1">{isEn ? "Total Raised" : "总融资规模"}</p>
                      <div className="text-3xl leading-none text-primary font-mono tabular-nums font-semibold">${(total / 1e6).toFixed(1)}M</div>
                    </div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60">{fundAllocData.length} {isEn ? "Allocations" : "项分配"}</span>
                  </div>
                  <div className="relative h-3 rounded-full bg-muted overflow-hidden flex gap-[2px] mb-4">
                    {fundAllocData.map((d, i) => (
                      <div key={i} className="h-full flex-none rounded-full" style={{ width: `${(d.value / total) * 100}%`, background: PIE_COLORS[i] }} />
                    ))}
                  </div>
                  <div className="space-y-3">
                    {fundAllocData.map((d, i) => {
                      const pct = (d.value / total) * 100;
                      return (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 w-2 h-2 rounded-sm" style={{ background: PIE_COLORS[i] }} />
                              <span className="text-xs text-foreground/90 font-medium truncate">{d.name}</span>
                            </div>
                            <span className="font-mono tabular-nums text-xs font-semibold" style={{ color: PIE_COLORS[i] }}>${(d.value / 1e6).toFixed(1)}M</span>
                          </div>
                          <div className="h-[3px] rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PIE_COLORS[i] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </TechChartCard>
        </div>

        {/* Row 2: Node Comparison + Deflation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TechChartCard icon={TrendingUp} title={isEn ? "Node Returns / Stage" : "节点收益 / 阶段 · Node Returns"} subtitle={isEn ? "Total returns per tier across stages" : "各档位各阶段总收益"}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={nodeCompareData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <defs>
                  {overview.nodes.map((n, i) => (
                    <linearGradient key={n.level} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={NODE_COLORS[n.level]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={NODE_COLORS[n.level]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`} />
                <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`$${fmt(v, 0)}`, name]} />
                <Legend wrapperStyle={{ fontSize: 11, color: C.muted, paddingTop: 4 }} iconType="circle" />
                {overview.nodes.map((n, i) => (
                  <Area key={n.level} type="monotone" dataKey={n.level} name={nodeName(n)}
                    stroke={NODE_COLORS[n.level]} strokeWidth={2.2} fill={`url(#grad-${i})`} dot={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </TechChartCard>

          <TechChartCard icon={Flame} title={isEn ? "Deflation Curve" : "通缩曲线 · Deflation Curve"} subtitle={isEn ? "Sub-token circulating vs burned" : "子币流通 vs 销毁"}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={deflationData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="gradCirc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.sub} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={C.sub} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradBurn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0,72%,55%)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="hsl(0,72%,55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1e6).toFixed(1)}M`} />
                <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`${(v / 1e6).toFixed(3)}M ${isEn ? "tokens" : "枚"}`, name]} />
                <Legend wrapperStyle={{ fontSize: 11, color: C.muted, paddingTop: 4 }} iconType="circle" />
                <Area type="monotone" dataKey="circulating" name={isEn ? "Circulating" : "流通"} stroke={C.sub} strokeWidth={2.4} fill="url(#gradCirc)" dot={false} />
                <Area type="monotone" dataKey="burned" name={isEn ? "Burned" : "销毁"} stroke="hsl(0,72%,55%)" strokeWidth={1.8} fill="url(#gradBurn)" dot={false} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </TechChartCard>
        </div>
      </div>

      {/* ── Dynamic price simulation ── */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
            <TrendingUp className="h-4 w-4 text-primary shrink-0" />
            <span>{isEn ? "Dynamic RUNE + FIRE Price Simulation" : "动态母币 + 子币价格模拟"}</span>
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase shrink-0">{isEn ? "Estimated" : "预估"}</span>
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
            {isEn
              ? "Bottom-up activity model. Two ground-truth knobs: monthly burn-stake users × avg package USDT drive TLP growth and AMM-drain LP RUNE."
              : "自底向上活动模型。两个基本面输入：月度活跃 burn-staker 人数 × 平均套餐 USDT，驱动 TLP 增长并按 AMM 抽走 LP RUNE。"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{isEn ? "Monthly active burn-stakers" : "月度活跃 burn-staker 人数"}</Label>
                <span className="font-mono tabular-nums text-xs text-primary">{monthlyActiveUsers.toLocaleString()}</span>
              </div>
              <Slider value={[monthlyActiveUsers]} min={100} max={5000} step={50} onValueChange={v => setMonthlyActiveUsers(v[0] ?? 1500)} className="py-1" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{isEn ? "Avg package (USDT)" : "平均套餐 (USDT)"}</Label>
                <span className="font-mono tabular-nums text-xs text-primary">${avgPackageUsdt.toLocaleString()}</span>
              </div>
              <Slider value={[avgPackageUsdt]} min={300} max={14000} step={100} onValueChange={v => setAvgPackageUsdt(v[0] ?? 3600)} className="py-1" />
            </div>
          </div>

          <div className="text-[10px] text-muted-foreground/70 text-center">
            {isEn
              ? `Derived: ${monthlyActiveUsers.toLocaleString()} users × $${avgPackageUsdt.toLocaleString()} = $${((monthlyActiveUsers * avgPackageUsdt) / 10000).toFixed(1)}万 USDT / mo into TLP.`
              : `推导：${monthlyActiveUsers.toLocaleString()} 人 × $${avgPackageUsdt.toLocaleString()} = ${((monthlyActiveUsers * avgPackageUsdt) / 10000).toFixed(1)}万 USDT / 月 进入 TLP。`}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {priceMilestones.map(({ day, label, data }) => {
              const reached = day < SIM_HORIZON_DAYS;
              const tokenPrice = simTokenView === "mother" ? data.price : data.subPrice;
              return (
                <div key={label} className="p-3 rounded-xl border border-border bg-muted/30">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                  <p className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">
                    {reached ? (isEn ? `≈ Day ${Math.round(day)}` : `≈ 第 ${Math.round(day)} 天`) : (isEn ? "Out of horizon" : "超出窗口")}
                  </p>
                  <p className="font-mono tabular-nums text-base text-foreground mt-1">${tokenPrice.toFixed(tokenPrice < 1 ? 4 : 2)}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono tabular-nums">
                    {simTokenView === "mother" ? `LP ${fmt(data.lpRune / 1e6, 1)}M` : (isEn ? "FIRE price" : "FIRE 价格")}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="relative">
            <div className="absolute top-0 right-0 z-10 inline-flex items-center gap-1 rounded-full border border-primary/25 bg-background/50 p-1 text-[11px] uppercase tracking-[0.18em]">
              {(["mother", "sub"] as const).map(s => (
                <button key={s} type="button" onClick={() => setSimTokenView(s)}
                  className={`rounded-full px-3 py-0.5 font-mono tabular-nums transition-all ${simTokenView === s ? "bg-primary/15 text-primary" : "text-muted-foreground/60 hover:text-primary/80"}`}>
                  {s === "mother" ? (isEn ? "RUNE" : "母币") : (isEn ? "FIRE" : "子币")}
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={priceSimulation} margin={{ top: 28, right: 12, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="gradPriceSim" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={simTokenView === "mother" ? C.mother : C.sub} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={simTokenView === "mother" ? C.mother : C.sub} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}d`} />
                <YAxis tick={{ fill: simTokenView === "mother" ? C.mother : C.sub, fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 100 ? `$${v.toFixed(0)}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(3)}`} />
                <Tooltip {...tooltipStyle}
                  formatter={(v: number) => [`$${v.toFixed(v < 1 ? 4 : 2)}`, simTokenView === "mother" ? (isEn ? "RUNE Price" : "RUNE 价格") : (isEn ? "FIRE Price" : "FIRE 价格")]}
                  labelFormatter={(d: number) => isEn ? `Day ${d}` : `第 ${d} 天`} />
                <Area type="monotone" dataKey={simTokenView === "mother" ? "price" : "subPrice"} stroke={simTokenView === "mother" ? C.mother : C.sub} strokeWidth={2.4} fill="url(#gradPriceSim)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ── v2 tab nav ── */}
      <div className="rounded-xl border border-border bg-card p-1 overflow-x-auto">
        <div className="flex gap-0.5 min-w-max relative">
          {[
            { id: "calc" as const, labelEn: "CALC", labelZh: "节点收益计算器" },
            { id: "node" as const, labelEn: "NODES", labelZh: "节点" },
            { id: "pkg" as const, labelEn: "STAKE", labelZh: "质押" },
            { id: "dual" as const, labelEn: "BURN STAKE", labelZh: "销毁质押" },
          ].map(({ id, labelEn, labelZh }) => {
            const active = v2Tab === id;
            return (
              <button key={id} onClick={() => setV2Tab(id)}
                className={`relative z-10 flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {active && <motion.span layoutId="runeV2TabPill" className="absolute inset-0 rounded-lg bg-primary/10 border border-primary/25" transition={{ type: "spring", stiffness: 340, damping: 32 }} />}
                <span className="relative tracking-wider">{isEn ? labelEn : labelZh}</span>
                {!isEn && <span className="relative text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/60">{labelEn}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ CALC TAB ═══ */}
      {v2Tab === "calc" && (
        <div className="space-y-6">
          <div className="border-b border-border pb-4">
            <div className="border-l-[3px] border-primary pl-4">
              {!isEn && <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/60 block mb-0.5">节点收益模拟器</span>}
              <h2 className="text-xl font-bold tracking-tight text-foreground">{isEn ? "Node Yield Simulator" : "节点收益模拟器 · Node Yield Simulator"}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{isEn ? "Pick a tier, set params, view projected returns." : "选择档位、设置参数、查看预估收益。"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Left: node cards + params */}
            <div className="lg:col-span-2 space-y-6">
              <div>
                <SectionTitle icon={Coins} zh="选择节点档位" en="Select Node Tier" />
                <div className="grid grid-cols-2 gap-3">
                  {overview.nodes.map(node => {
                    const color = NODE_COLORS[node.level];
                    const isOn = nodeLevel === node.level;
                    const apy = ((node.dailyUsdt * 365) / node.investment * 100).toFixed(2);
                    return (
                      <button key={node.level} onClick={() => setNodeLevel(node.level)}
                        style={isOn ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : undefined}
                        className={`relative text-left p-4 rounded-xl border bg-card transition-all duration-200 ${isOn ? "-translate-y-0.5" : "border-border opacity-70 hover:opacity-100"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] uppercase tracking-widest font-bold" style={{ color }}>{nodeName(node)}</span>
                          {isOn ? <BadgeCheck className="h-3.5 w-3.5" style={{ color }} /> : <span className="text-[11px] uppercase tracking-widest text-muted-foreground/40 font-medium">{node.nameEn}</span>}
                        </div>
                        <p className="font-mono tabular-nums text-xl mt-0.5 text-foreground">${node.investment.toLocaleString()}</p>
                        <div className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs border" style={{ color, borderColor: `${color}40`, background: `${color}12` }}>
                          APY {apy}%
                        </div>
                        <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-x-2 gap-y-0.5">
                          <p className="text-[11px] text-muted-foreground">{isEn ? "Daily USDT" : "日 USDT"} <span className="font-mono tabular-nums" style={{ color }}>${node.dailyUsdt}</span></p>
                          <p className="text-[11px] text-muted-foreground">{isEn ? "Seats" : "席位"} <span className="font-mono tabular-nums text-foreground">{node.seats}</span></p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />{isEn ? "Parameters" : "参数 · Parameters"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label className="text-base font-medium text-foreground">{isEn ? "Duration" : "周期"}</Label>
                      <span className="font-mono tabular-nums text-lg text-foreground">{durationDays}{isEn ? "d" : "天"} / ≈{Math.round(durationDays / 30)}{isEn ? "mo" : "月"}</span>
                    </div>
                    <Slider value={[durationDays]} min={30} max={720} step={30} onValueChange={v => setDurationDays(v[0])} className="py-2" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-base font-medium text-foreground">{isEn ? "Target Stage" : "目标阶段"}</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {overview.priceStages.map((s, i) => {
                        const dynPrice = motherPriceForStage(i, s.motherPrice);
                        const dynMult = dynPrice / overview.motherToken.launchPrice;
                        return (
                          <button key={i} onClick={() => setPriceStageIndex(i)}
                            className={`text-left p-2.5 rounded-lg border transition-all active:scale-[0.98] ${priceStageIndex === i ? "border-primary bg-primary/10" : "border-border hover:-translate-y-[1px]"}`}>
                            <p className="text-xs text-muted-foreground leading-tight mb-0.5">{stageLabel(s, i)}</p>
                            <p className="font-mono tabular-nums text-sm text-foreground">${fmtPrice(dynPrice)}</p>
                            {dynMult > 1.05 && <p className="text-emerald-600 font-mono tabular-nums text-xs">{dynMult.toFixed(dynMult >= 10 ? 0 : 1)}×</p>}
                          </button>
                        );
                      })}
                    </div>
                    {selectedStagePreview && isZh && <p className="text-xs text-muted-foreground px-1">{selectedStagePreview.trigger}</p>}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: results */}
            <div className="lg:col-span-3 space-y-6">
              <AnimatePresence mode="wait">
                {dynamicCalc && (
                  <motion.div key="results" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }} className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="col-span-2 md:col-span-3 p-5 rounded-xl border border-primary/30 bg-primary/5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-[11px] text-primary uppercase tracking-widest font-semibold">{isEn ? "Total Returns" : "总收益 · Total Returns"}</p>
                          <span className="text-[10px] bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase">{isEn ? "Estimated" : "预估"}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-2">
                          {isEn ? "Returns only — principal is redeemable after the breakeven window." : "仅含收益。本金达到回本周期后可赎回。"}
                        </p>
                        <div className="flex items-end gap-4 flex-wrap">
                          <p className="text-4xl text-primary font-mono tabular-nums font-bold">${fmt(dynamicCalc.totalAssets)}</p>
                          <div className="mb-1 flex gap-3 flex-wrap">
                            <span className="text-sm bg-primary/10 text-primary border border-primary/30 px-2.5 py-0.5 rounded-full font-mono tabular-nums">ROI {fmt(dynamicCalc.roi)}%</span>
                            <span className="text-sm bg-muted text-foreground border border-border px-2.5 py-0.5 rounded-full font-mono tabular-nums">{fmt(dynamicCalc.roiMultiplier)}× {isEn ? "Principal" : "本金"}</span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                          <span className="font-mono tabular-nums text-foreground/70">${fmt(dynamicCalc.totalAssetsLow)}</span>
                          <span className="opacity-60">— {isEn ? "monthly 15% (conservative)" : "月化 15% 保守"} ↔ {isEn ? "35% (optimistic)" : "35% 乐观"} —</span>
                          <span className="font-mono tabular-nums text-foreground/70">${fmt(dynamicCalc.totalAssetsHigh)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {stageLabel(overview.priceStages[priceStageIndex], priceStageIndex)} {isEn ? "stage" : "阶段"} · {isEn ? "price" : "价格"} <span className="font-mono tabular-nums text-primary">${fmtPrice(dynamicCalc.dynamicPrice)}</span> · {isEn ? "investment" : "投入"} <span className="font-mono tabular-nums text-foreground">${fmt(dynamicCalc.investment)}</span>
                        </p>
                      </div>
                      {[
                        { label: isEn ? "Mother Token Value" : "母币价值", value: dynamicCalc.motherTokenValue, sub: <>{dynamicCalc.motherTokens.toLocaleString()} {isEn ? "tokens" : "枚"} × ${fmtPrice(dynamicCalc.dynamicPrice)}</> },
                        { label: isEn ? "Mother Token Airdrop" : "母币空投", value: dynamicCalc.airdropTokenValue, sub: <>{dynamicCalc.airdropTokens.toLocaleString()} {isEn ? "tokens" : "枚"} × ${fmtPrice(dynamicCalc.dynamicPrice)}</> },
                        { label: isEn ? "Static USDT (65%)" : "静态 USDT (65%)", value: dynamicCalc.totalUsdtIncome, sub: <>${fmt(dynamicCalc.dailyUsdt)}{isEn ? "/day" : "/日"} × {dynamicCalc.durationDays}{isEn ? "d" : "天"}</> },
                        { label: isEn ? "Sub-Token (35% dyn)" : "动态子币 (35%)", value: dynamicCalc.subTokenValue, sub: <>{fmt(dynamicCalc.subTokenAccumulated)} {isEn ? "tokens accumulated" : "枚累计"}</> },
                      ].map(kpi => (
                        <div key={kpi.label} className="p-4 rounded-xl border border-border bg-card">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{kpi.label}</p>
                          <p className="font-mono tabular-nums text-lg text-foreground">${fmt(kpi.value)}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.sub}</p>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <TechChartCard icon={PieIcon} title={isEn ? "Asset Breakdown" : "资产构成 · Asset Breakdown"}>
                        <div className="relative">
                          <ResponsiveContainer width="100%" height={170}>
                            <PieChart>
                              <Pie data={resultPieData} cx="50%" cy="50%" innerRadius={48} outerRadius={75} dataKey="value" nameKey="name" paddingAngle={4} stroke="hsl(var(--card))" strokeWidth={2}>
                                {resultPieData.map((_, i) => <Cell key={i} fill={RESULT_COLORS[i]} />)}
                              </Pie>
                              <Tooltip contentStyle={tooltipStyle.contentStyle} formatter={(v: number, name: string) => [`$${fmt(v, 0)}`, name]} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                              <div className="text-[11px] uppercase tracking-widest text-muted-foreground/60">Total</div>
                              <div className="font-mono tabular-nums text-sm text-foreground/90">${fmt(resultPieData.reduce((s, d) => s + d.value, 0), 0)}</div>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1.5 mt-3">
                          {resultPieData.map((d, i) => {
                            const total = resultPieData.reduce((s, x) => s + x.value, 0) || 1;
                            const pct = (d.value / total) * 100;
                            return (
                              <div key={i} className="flex items-center justify-between text-xs gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: RESULT_COLORS[i] }} />
                                  <span className="text-muted-foreground truncate">{d.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] text-muted-foreground/60 font-mono tabular-nums">{pct.toFixed(0)}%</span>
                                  <span className="font-mono tabular-nums font-semibold text-foreground/90">${fmt(d.value, 0)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </TechChartCard>

                      <TechChartCard icon={BarChart2} title={isEn ? "Stage Forecast" : "阶段预测 · Stage Forecast"}>
                        {selectedNode && (
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={overview.priceStages.map((s, i) => {
                              const dynPrice = motherPriceForStage(i, s.motherPrice);
                              return {
                                label: stageLabel(s, i),
                                totalAssets: Math.round(selectedNode.motherTokensPerSeat * seats * dynPrice + selectedNode.airdropPerSeat * seats * dynPrice + selectedNode.dailyUsdt * seats * durationDays),
                              };
                            })} margin={{ top: 8, right: 8, left: -10, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                              <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 9 }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fill: C.muted, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`} />
                              <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${fmt(v, 0)}`, isEn ? "Total Returns" : "总收益"]} />
                              <Bar dataKey="totalAssets" name={isEn ? "Total Returns" : "总收益"} radius={[6, 6, 0, 0]} maxBarSize={40}>
                                {overview.priceStages.map((_, i) => <Cell key={i} fill={i === priceStageIndex ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.35)"} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </TechChartCard>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Node parameters table */}
          <Card className="border-border overflow-hidden">
            <div className="bg-muted/40 border-b border-border px-5 py-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />{isEn ? "Node Parameters" : "节点参数 · Node Parameters"}
              </h3>
            </div>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    {[
                      { zh: "节点", en: "Node", align: "left" as const },
                      { zh: "投入", en: "Investment", align: "right" as const },
                      { zh: "私募价", en: "Private", align: "right" as const },
                      { zh: "母币", en: "Mother Token", align: "right" as const },
                      { zh: "空投", en: "Airdrop", align: "right" as const },
                      { zh: "日 USDT", en: "Daily USDT", align: "right" as const },
                      { zh: "席位", en: "Seats", align: "right" as const },
                    ].map(h => (
                      <th key={h.en} className={`py-2.5 px-4 text-muted-foreground font-medium tracking-wider text-[11px] uppercase ${h.align === "left" ? "text-left" : "text-right"}`}>{isEn ? h.en : h.zh}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overview.nodes.map(node => {
                    const color = NODE_COLORS[node.level];
                    return (
                      <tr key={node.level} onClick={() => setNodeLevel(node.level)}
                        className={`border-b border-border/60 last:border-0 cursor-pointer transition-colors ${nodeLevel === node.level ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: color }} />
                            <span className="font-medium" style={{ color }}>{nodeName(node)}</span>
                            <span className="text-muted-foreground text-[11px]">{node.nameEn}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold">${node.investment.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono">${node.privatePrice}</td>
                        <td className="py-3 px-4 text-right font-mono">{node.motherTokensPerSeat.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono">{node.airdropPerSeat.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold" style={{ color }}>${node.dailyUsdt}</td>
                        <td className="py-3 px-4 text-right font-mono text-muted-foreground">{node.seats}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ NODES TAB ═══ */}
      {v2Tab === "node" && (() => {
        const stagesUnlock = [
          { idx: 0, label: isEn ? "Stage 1 · Launch (20%)" : "阶段 1 · 启动 (20%)", release: 0.20 },
          { idx: 1, label: isEn ? "Stage 2 · TLP 700万 (30%)" : "阶段 2 · TLP 700万 (30%)", release: 0.30 },
          { idx: 2, label: isEn ? "Stage 3 · TLP 1750万 (30%)" : "阶段 3 · TLP 1750万 (30%)", release: 0.30 },
          { idx: 3, label: isEn ? "Stage 4 · TLP 3500万 (20%)" : "阶段 4 · TLP 3500万 (20%)", release: 0.20 },
        ];
        const stages4 = [
          { idx: 0, tlp: 280 }, { idx: 1, tlp: 700 }, { idx: 2, tlp: 1750 }, { idx: 3, tlp: 3500 },
        ];
        const MOTHER_BUY_TAX = 0.05, MOTHER_SELL_TAX = 0.05, SUB_BUY_TAX = 0.05, SUB_SELL_TAX = 0.05;
        const MOTHER_BURN_DAILY = 0.002, MOTHER_BURN_NODE = 0.01, SUB_BURN_DAILY = 0.001, SUB_BURN_NODE = 0.02;
        const nodes = overview.nodes;
        return (
          <div className="space-y-6">
            {/* Airdrop release table */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                  <Layers className="h-4 w-4 text-primary shrink-0" />{isEn ? "Mother-Token Airdrop · 4-Stage Release Per Tier" : "节点空投 · 4 阶段释放表"}
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-1">{isEn ? "Tokens unlock at TLP milestones (20/30/30/20%)." : "按 TLP 里程碑解锁释放（20/30/30/20%）。"}</p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground uppercase tracking-wider">
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-2 sticky left-0 bg-card">{isEn ? "Tier" : "档位"}</th>
                        <th className="text-right py-2 px-2">{isEn ? "Total" : "总额"}</th>
                        {stagesUnlock.map(s => <th key={s.idx} className="text-right py-2 px-2 whitespace-nowrap">{s.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.map(n => (
                        <tr key={n.level} className="border-b border-border/50">
                          <td className="py-2 px-2 sticky left-0 bg-card">
                            <div className="text-foreground">{nodeName(n)}</div>
                            <div className="text-[10px] text-muted-foreground">${n.investment.toLocaleString()}</div>
                          </td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums">{n.airdropPerSeat.toLocaleString()}</td>
                          {stagesUnlock.map(s => {
                            const tokens = n.airdropPerSeat * s.release;
                            const stage = overview.priceStages[s.idx];
                            const dynPrice = motherPriceForStage(s.idx, stage?.motherPrice ?? 0);
                            return (
                              <td key={s.idx} className="py-2 px-2 text-right">
                                <div className="font-mono tabular-nums text-foreground">{tokens.toLocaleString()}</div>
                                <div className="text-[10px] text-primary/80 font-mono tabular-nums">${fmt(tokens * dynPrice, 0)}</div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Trading dividend */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap text-foreground">
                  <Activity className="h-4 w-4 text-primary shrink-0" />{isEn ? "Trading Dividend · Daily Per Tier" : "交易分红 · 每档每日"}
                  <span className="text-[10px] bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase shrink-0">{isEn ? "Estimated" : "预估"}</span>
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {isEn ? "Trade tax + daily burn share into node pool, split by weight (2880 total)." : "交易税 + 每日燃烧分红入节点池，按权重 2880 分配。"}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: isEn ? "Mother daily volume (USDT)" : "母币日交易额 (USDT)", value: motherDailyVolume, setter: setMotherDailyVolume, min: 100_000, max: 10_000_000, step: 50_000, vfmt: (v: number) => `$${(v / 10000).toFixed(0)}万` },
                    { label: isEn ? "Sub daily volume (USDT)" : "子币日交易额 (USDT)", value: subDailyVolume, setter: setSubDailyVolume, min: 50_000, max: 5_000_000, step: 25_000, vfmt: (v: number) => `$${(v / 10000).toFixed(0)}万` },
                    { label: isEn ? "Avg sell profit %" : "平均卖出盈利率 (%)", value: avgSellProfitPct, setter: setAvgSellProfitPct, min: 5, max: 50, step: 1, vfmt: (v: number) => `${v}%` },
                  ].map(({ label, value, setter, min, max, step, vfmt }) => (
                    <div key={label} className="space-y-2">
                      <div className="flex justify-between items-baseline">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
                        <span className="font-mono tabular-nums text-xs text-primary">{vfmt(value)}</span>
                      </div>
                      <Slider value={[value]} min={min} max={max} step={step} onValueChange={v => setter(v[0] ?? value)} className="py-1" />
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground uppercase tracking-wider">
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-2 sticky left-0 bg-card">{isEn ? "Stage" : "阶段"}</th>
                        <th className="text-right py-2 px-2 whitespace-nowrap">{isEn ? "Trade tax/day" : "交易税/日"}</th>
                        <th className="text-right py-2 px-2 whitespace-nowrap">{isEn ? "Burn share/day" : "燃烧分红/日"}</th>
                        <th className="text-right py-2 px-2 whitespace-nowrap">{isEn ? "Pool/day" : "节点池/日"}</th>
                        {nodes.map(n => <th key={n.level} className="text-right py-2 px-2 whitespace-nowrap">{nodeName(n)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {stages4.map(s => {
                        const subActive = s.tlp >= 500;
                        const profit = avgSellProfitPct / 100;
                        const motherTradeShare = motherDailyVolume * (0.5 * MOTHER_BUY_TAX + 0.5 * MOTHER_SELL_TAX * profit);
                        const subTradeShare = subActive ? subDailyVolume * (0.5 * SUB_BUY_TAX + 0.5 * SUB_SELL_TAX * profit) : 0;
                        const stageDay = dayWhenTlpReaches(s.tlp);
                        const motherLp = lpRuneAt(stageDay);
                        const motherPriceN = motherPriceForStage(s.idx, overview.priceStages[s.idx]?.motherPrice ?? 0);
                        const motherBurnSh = motherLp * MOTHER_BURN_DAILY * MOTHER_BURN_NODE * motherPriceN;
                        const subSupplyEst = subActive ? overview.subToken.totalSupply : 0;
                        const subPriceN = overview.priceStages[s.idx]?.subPrice ?? 0;
                        const subBurnSh = subSupplyEst * SUB_BURN_DAILY * SUB_BURN_NODE * subPriceN;
                        const tradeTax = motherTradeShare + subTradeShare;
                        const burnShare = motherBurnSh + subBurnSh;
                        const nodePoolDay = tradeTax + burnShare;
                        return (
                          <tr key={s.idx} className="border-b border-border/50">
                            <td className="py-2 px-2 sticky left-0 bg-card whitespace-nowrap">
                              <div className="text-foreground">{isEn ? `Stage ${s.idx + 1}` : `阶段 ${s.idx + 1}`}</div>
                              <div className="text-[10px] text-muted-foreground">TLP {s.tlp}万{!subActive && (isEn ? " · sub paused" : " · 子币未开")}</div>
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums text-foreground/80 whitespace-nowrap">${fmt(tradeTax, 0)}</td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums text-foreground/80 whitespace-nowrap">${fmt(burnShare, 0)}</td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums text-primary whitespace-nowrap">${fmt(nodePoolDay, 0)}</td>
                            {nodes.map(n => (
                              <td key={n.level} className="py-2 px-2 text-right font-mono tabular-nums text-foreground whitespace-nowrap">${fmt((nodePoolDay * n.weight) / TOTAL_NODE_WEIGHT, 2)}</td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Node weights */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                  <BarChart2 className="h-4 w-4 text-primary shrink-0" />{isEn ? "Node Weights & Seats" : "节点权重 / 席位"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground uppercase tracking-wider">
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-2">{isEn ? "Tier" : "档位"}</th>
                        <th className="text-right py-2 px-2">{isEn ? "Price" : "单价"}</th>
                        <th className="text-right py-2 px-2">{isEn ? "Seats" : "席位"}</th>
                        <th className="text-right py-2 px-2">{isEn ? "Weight" : "权重"}</th>
                        <th className="text-right py-2 px-2">{isEn ? "Total weight" : "总权重"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.map(n => (
                        <tr key={n.level} className="border-b border-border/50">
                          <td className="py-2 px-2">{nodeName(n)}</td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums">${n.investment.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums">{n.seats}</td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums">{(n.weight * 100).toFixed(0)}%</td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums text-primary">{(n.weight * n.seats).toFixed(0)}</td>
                        </tr>
                      ))}
                      <tr className="bg-primary/5">
                        <td className="py-2 px-2 font-semibold">{isEn ? "Total" : "合计"}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums">$800万</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums">2420</td>
                        <td className="py-2 px-2 text-right">—</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-primary font-bold">{TOTAL_NODE_WEIGHT}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ═══ 质押 TAB ═══ */}
      {v2Tab === "pkg" && (() => {
        const bracket =
          pkgDays === 30 ? { min: 0.3, max: 0.5, bonus: 0 }
          : pkgDays === 90 ? { min: 0.5, max: 0.7, bonus: 0 }
          : pkgDays === 180 ? { min: 0.5, max: 0.9, bonus: 0.10 }
          : pkgDays === 360 ? { min: 0.5, max: 0.9, bonus: 0.20 }
          : { min: 0.5, max: 0.9, bonus: 0.30 };
        const stageForDuration = pkgDays === 30 ? 1 : pkgDays === 90 ? 2 : pkgDays === 180 ? 3 : pkgDays === 360 ? 4 : 5;
        const stageData = overview.priceStages[stageForDuration];
        const subPriceAtEnd = stageData?.subPrice ?? PKG_SUB_LAUNCH_PRICE;
        const baseRate = Math.min(Math.max(pkgRatePct, bracket.min), bracket.max);
        const effDailyPct = baseRate * (1 + bracket.bonus);
        const dailyYieldU = pkgUsdt * (effDailyPct / 100);
        const totalYieldU = dailyYieldU * pkgDays;
        const staticUsdt = totalYieldU * 0.65;
        const dynamicTotal = totalYieldU * 0.35;
        const dynamicSubBuy = dynamicTotal * 0.5;
        const dynamicUsdtSide = dynamicTotal * 0.5;
        const subTokens = dynamicSubBuy / PKG_SUB_LAUNCH_PRICE;
        void (subTokens * subPriceAtEnd);
        const totalValue = staticUsdt;
        const roi = pkgUsdt > 0 ? (totalValue / pkgUsdt) * 100 : 0;
        const roiX = pkgUsdt > 0 ? totalValue / pkgUsdt : 0;
        return (
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap text-foreground">
                <Activity className="h-4 w-4 text-primary shrink-0" />{isEn ? "Stake Package · USDT → RUNE → Daily Yield" : "质押套餐 · USDT 买 RUNE 激活套餐"}
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase shrink-0">{isEn ? "Estimated" : "预估"}</span>
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                {isEn ? "30/90d no bonus, 180d +10%, 360d +20%, 540d +30%. Daily yield: 65% USDT direct + 35% pool injection." : "30/90 天无加成；180 天 +10%；360 天 +20%；540 天 +30%。日化 65% USDT 直发 + 35% 底池注入。"}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{isEn ? "Principal (USDT)" : "本金 (USDT)"}</Label>
                  <select value={pkgUsdt} onChange={e => setPkgUsdt(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-background border border-border font-mono tabular-nums text-sm text-foreground">
                    {[100, 200, 500, 1000, 2000, 5000, 10000].map(v => <option key={v} value={v}>${v.toLocaleString()}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{isEn ? "Duration" : "套餐期限"}</Label>
                  <select value={pkgDays} onChange={e => setPkgDays(Number(e.target.value) as typeof pkgDays)} className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground">
                    <option value={30}>30 {isEn ? "days · no bonus" : "天 · 无加成"}</option>
                    <option value={90}>90 {isEn ? "days · no bonus" : "天 · 无加成"}</option>
                    <option value={180}>180 {isEn ? "days · +10%" : "天 · +10%"}</option>
                    <option value={360}>360 {isEn ? "days · +20%" : "天 · +20%"}</option>
                    <option value={540}>540 {isEn ? "days · +30%" : "天 · +30%"}</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground/70">{isEn ? `Yield bracket: ${bracket.min}%-${bracket.max}% daily` : `日化区间：${bracket.min}%-${bracket.max}%`}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{isEn ? "Base daily rate" : "基础日化"}</Label>
                    <span className="font-mono tabular-nums text-xs text-primary">{baseRate.toFixed(2)}%</span>
                  </div>
                  <Slider value={[baseRate]} min={bracket.min} max={bracket.max} step={0.05} onValueChange={v => setPkgRatePct(v[0] ?? baseRate)} className="py-1" />
                  <div className="flex justify-between text-[9px] text-muted-foreground/60"><span>{bracket.min}%</span><span>{bracket.max}%</span></div>
                </div>
              </div>

              <div className="p-4 sm:p-5 rounded-xl border border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <p className="text-[11px] text-primary uppercase tracking-widest font-semibold">{isEn ? "User Cash Income (65% Static USDT)" : "用户实得收益（65% 静态 USDT）"}</p>
                  <span className="text-[10px] bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">{isEn ? "Estimated" : "预估"}</span>
                </div>
                <div className="flex items-end gap-3 flex-wrap">
                  <p className="text-3xl sm:text-4xl text-primary font-mono tabular-nums font-bold">${fmt(totalValue, 0)}</p>
                  <div className="flex gap-2 flex-wrap mb-1">
                    <span className="text-xs bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-mono tabular-nums">ROI {fmt(roi, 1)}%</span>
                    <span className="text-xs bg-muted text-foreground border border-border px-2 py-0.5 rounded-full font-mono tabular-nums">{fmt(roiX, 2)}×</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  {isEn
                    ? `${baseRate.toFixed(2)}% × (1+${(bracket.bonus * 100).toFixed(0)}% bonus) = ${effDailyPct.toFixed(3)}%/day · ${pkgDays}d total yield $${fmt(totalYieldU, 0)}`
                    : `${baseRate.toFixed(2)}% × (1+${(bracket.bonus * 100).toFixed(0)}% 加成) = ${effDailyPct.toFixed(3)}%/日 · ${pkgDays} 天总收益 $${fmt(totalYieldU, 0)}`}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-border bg-card">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{isEn ? "Static USDT (65%)" : "静态 USDT（65%）"}</p>
                  <p className="font-mono tabular-nums text-lg text-foreground">${fmt(staticUsdt, 2)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{isEn ? "Direct to wallet, daily settled" : "直发钱包，每日结算"}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">${fmt(dailyYieldU * 0.65, 2)}{isEn ? "/day" : "/日"} × {pkgDays}{isEn ? "d" : "天"}</p>
                </div>
                <div className="p-4 rounded-xl border border-dashed border-border bg-muted/20">
                  <p className="text-[11px] text-muted-foreground/80 uppercase tracking-wider mb-1">{isEn ? "Pool Injection (35%)" : "底池注入（35%）"}</p>
                  <p className="font-mono tabular-nums text-base text-muted-foreground/80">${fmt(dynamicTotal, 2)}</p>
                  <div className="text-[11px] text-muted-foreground/70 mt-1 space-y-0.5">
                    <p>{fmt(subTokens, 0)} {isEn ? "sub × " : "枚子币 × "}${PKG_SUB_LAUNCH_PRICE} = ${fmt(dynamicSubBuy, 2)}</p>
                    <p>${fmt(dynamicUsdtSide, 2)} USDT</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground uppercase tracking-wider">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2">{isEn ? "Term" : "套餐"}</th>
                      <th className="text-right py-2 px-2">{isEn ? "Daily" : "日化"}</th>
                      <th className="text-right py-2 px-2">{isEn ? "Bonus" : "加成"}</th>
                      <th className="text-right py-2 px-2">{isEn ? "Cap" : "单单上限"}</th>
                      <th className="text-right py-2 px-2">{isEn ? "Day Cap" : "日额度"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { d: 30, rate: "0.3-0.5%", bonus: "—", cap: "$1,000", dayCap: "20万U" },
                      { d: 90, rate: "0.5-0.7%", bonus: "—", cap: "$1,000", dayCap: "30万U" },
                      { d: 180, rate: "0.5-0.9%", bonus: "+10%", cap: "$1,000", dayCap: isEn ? "unlimited" : "不限" },
                      { d: 360, rate: "0.5-0.9%", bonus: "+20%", cap: "$1,000", dayCap: isEn ? "unlimited" : "不限" },
                      { d: 540, rate: "0.5-0.9%", bonus: "+30%", cap: "$1,000", dayCap: isEn ? "unlimited" : "不限" },
                    ].map(r => (
                      <tr key={r.d} className={`border-b border-border/50 ${r.d === pkgDays ? "bg-primary/5" : ""}`}>
                        <td className="py-2 px-2 text-foreground">{r.d} {isEn ? "days" : "天"}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-foreground/80">{r.rate}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-primary">{r.bonus}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-foreground/70">{r.cap}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-foreground/70">{r.dayCap}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                {isEn ? "Estimated. Daily yield splits 65% USDT direct + 35% auto-buys sub-token. Sub valued at $0.038 launch price." : "预估。日化收益 65% USDT 直发 + 35% 自动买子币。子币按 $0.038 开盘估值。"}
              </p>
            </CardContent>
          </Card>
        );
      })()}

      {/* ═══ 销毁质押 TAB ═══ */}
      {v2Tab === "dual" && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
              <Flame className="h-4 w-4 text-primary shrink-0" />
              <span>{isEn ? "Burn-Stake Chain · Mother → Sub → AI + IDO" : "完整链路 · 销毁母币 → 子币 → AI 分红 + IDO"}</span>
              <span className="text-[10px] bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase shrink-0">{isEn ? "Estimated" : "预估"}</span>
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              {isEn
                ? "Burn N mother (permanent deflation) → daily 1.0-1.5% × N sub-tokens → auto-stake → AI monthly revenue + IDO allocations (~50× avg)."
                : "销毁 N 枚母币（永久通缩，本金不归还）→ 每日产 1.0-1.5%×N 子币 → 自动入质押池 → 享 AI 月分红 + IDO 打新（平均 50×）"}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{isEn ? "Package principal (USDT)" : "购买配套金额（USDT）"}</Label>
                <select value={Math.round(burnTokens * 0.028)} onChange={e => setBurnTokens(Number(e.target.value) / 0.028)} className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border font-mono tabular-nums text-sm text-foreground">
                  {[100, 200, 500, 1000, 2000, 5000, 10000, 30000, 50000, 100000].map(usdt => (
                    <option key={usdt} value={usdt}>${usdt.toLocaleString()} → {fmt(usdt / 0.028, 0)} {isEn ? "RUNE" : "枚"}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground/70 mt-1">{isEn ? "USDT → buys RUNE @ $0.028 → permanently burned" : "USDT → 按开盘价 $0.028 买 RUNE → 永久销毁"}</p>
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{isEn ? "Duration (days)" : "周期 (天)"}</Label>
                <select value={burnDays} onChange={e => setBurnDays(Number(e.target.value))} className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground">
                  {[30, 90, 180, 360, 540, 1080, 3600].map(d => <option key={d} value={d}>{d}{d >= 1080 ? (d === 1080 ? " (3yr)" : " (10yr)") : ""}</option>)}
                </select>
                <p className="text-[10px] text-muted-foreground/70 mt-1">{isEn ? "Yield is permanent on-chain — pick a window for valuation." : "链上永久产出，仅取窗口估值"}</p>
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{isEn ? "Price Stage" : "价格阶段"}</Label>
                <select value={stakeStage} onChange={e => setStakeStage(Number(e.target.value))} className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground">
                  {overview.priceStages.map((s, i) => <option key={i} value={i}>{stageLabel(s, i)}</option>)}
                </select>
                <p className="text-[10px] text-muted-foreground/70 mt-1">{isEn ? "Affects only the sub-token valuation card." : "仅影响下方子币持仓估值参考卡。"}</p>
              </div>
            </div>

            <details className="group">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">{isEn ? "Assumptions (advanced)" : "假设参数 (高级)"} ▾</summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                {[
                  { label: isEn ? "Global sub-stake (tokens)" : "全网子币质押 (枚)", value: globalSubStaked, setter: setGlobalSubStaked, min: 10_000, max: 5_000_000, step: 10_000, display: globalSubStaked.toLocaleString() },
                  { label: isEn ? "AI pool / month (USDT)" : "AI 月度池 (USDT)", value: aiPoolMonthly, setter: setAiPoolMonthly, min: 100_000, max: 5_000_000, step: 100_000, display: `$${aiPoolMonthly.toLocaleString()}` },
                  { label: isEn ? "IDOs / month" : "每月 IDO 次数", value: idosPerMonth, setter: setIdosPerMonth, min: 0.5, max: 3, step: 0.5, display: `${idosPerMonth}×` },
                  { label: isEn ? "IDO avg multiplier" : "IDO 平均涨幅", value: idoAvgMultiplier, setter: setIdoAvgMultiplier, min: 10, max: 100, step: 5, display: `${idoAvgMultiplier}×` },
                  { label: isEn ? "IDO alloc factor (USDT/sub)" : "IDO 配额系数 (U/枚)", value: idoAllocFactor, setter: setIdoAllocFactor, min: 0.001, max: 0.01, step: 0.0005, display: idoAllocFactor.toFixed(4) },
                ].map(({ label, value, setter, min, max, step, display }) => (
                  <div key={label} className="space-y-2">
                    <div className="flex justify-between items-baseline">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
                      <span className="font-mono tabular-nums text-xs text-primary">{display}</span>
                    </div>
                    <Slider value={[value]} min={min} max={max} step={step} onValueChange={v => setter(v[0] ?? value)} className="py-1" />
                  </div>
                ))}
              </div>
            </details>

            {(() => {
              const stage = overview.priceStages[stakeStage];
              if (!stage) return null;
              const launchMotherPrice = overview.priceStages[0]?.motherPrice ?? 0.028;
              const tierRate = burnTokens >= 100_000 ? 1.5 : burnTokens >= 10_000 ? 1.4 : burnTokens >= 1_000 ? 1.3 : burnTokens >= 100 ? 1.2 : 1.0;
              const dailySubYield = burnTokens * (tierRate / 100);
              const totalSubTokens = dailySubYield * burnDays;
              const tlpAtBurnEnd = tlpAt(burnDays) * 10000;
              const subPriceAtBurnEnd = subPriceAtTlp(tlpAtBurnEnd);
              const subTokenValue = totalSubTokens * subPriceAtBurnEnd;
              const burnCostUsd = burnTokens * launchMotherPrice;
              const months = burnDays / 30;
              const avgSubStake = totalSubTokens / 2;
              const idoCount = idosPerMonth * months;
              const idoAllocPerEvent = avgSubStake * idoAllocFactor;
              const idoGains = idoCount * idoAllocPerEvent * (idoAvgMultiplier - 1);
              // AI monthly dividend by weight share of the global sub-stake pool
              const aiShare = globalSubStaked > 0 ? avgSubStake / globalSubStaked : 0;
              const aiDividend = aiPoolMonthly * aiShare * months;
              const totalIncome = subTokenValue + idoGains + aiDividend;
              const roi = burnCostUsd > 0 ? (totalIncome / burnCostUsd) * 100 : 0;
              const roiX = burnCostUsd > 0 ? totalIncome / burnCostUsd : 0;
              return (
                <div className="space-y-4">
                  <div className="p-5 sm:p-6 rounded-2xl border-2 border-primary/50 bg-primary/5 relative overflow-hidden">
                    <div className="relative">
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <p className="text-[12px] text-primary uppercase tracking-widest font-bold">{isEn ? "Total Estimated Returns" : "总估算收益"}</p>
                        <span className="text-[10px] bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">{isEn ? "Estimated" : "预估"}</span>
                      </div>
                      <div className="flex items-end gap-3 flex-wrap">
                        <p className="text-4xl sm:text-5xl text-primary font-mono tabular-nums font-bold">${fmt(totalIncome, 0)}</p>
                        <div className="flex gap-2 flex-wrap mb-1.5">
                          <span className="text-xs bg-primary/15 text-primary border border-primary/30 px-2.5 py-0.5 rounded-full font-mono tabular-nums font-semibold">ROI {fmt(roi, 0)}%</span>
                          <span className="text-xs bg-muted text-foreground border border-border px-2.5 py-0.5 rounded-full font-mono tabular-nums">{fmt(roiX, 1)}×</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        {isEn
                          ? `Burned ${Math.round(burnTokens).toLocaleString()} mother · cost $${fmt(burnCostUsd, 2)} @ launch · ${tierRate}% daily = ${fmt(dailySubYield, 0)} sub/day · ${burnDays}d`
                          : `销毁 ${Math.round(burnTokens).toLocaleString()} 枚母币 · 成本 $${fmt(burnCostUsd, 2)} 开盘价 · 日化 ${tierRate}% = ${fmt(dailySubYield, 0)} 子币/天 · ${burnDays} 天`}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">{isEn ? "⚠ Mother burn is permanent — principal not redeemable." : "⚠ 销毁母币本金不归还（永久通缩）。"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl border border-orange-500/40 bg-orange-500/5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[11px] text-orange-600 uppercase tracking-wider font-semibold">{isEn ? "Sub-Token Value" : "子币价值（销毁产出）"}</p>
                        <span className="text-[10px] font-mono tabular-nums text-orange-600/80">{totalIncome > 0 ? fmt((subTokenValue / totalIncome) * 100, 0) : 0}%</span>
                      </div>
                      <p className="font-mono tabular-nums text-2xl text-orange-600">${fmt(subTokenValue, 0)}</p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">{fmt(totalSubTokens, 0)} {isEn ? "sub × " : "枚 × "}${subPriceAtBurnEnd.toFixed(subPriceAtBurnEnd < 1 ? 4 : 2)} {isEn ? "(dynamic)" : "（动态）"}</p>
                    </div>
                    <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[11px] text-emerald-600 uppercase tracking-wider font-semibold">{isEn ? "IDO Allocation Gains" : "IDO 打新收益"}</p>
                        <span className="text-[10px] font-mono tabular-nums text-emerald-600/80">{totalIncome > 0 ? fmt((idoGains / totalIncome) * 100, 0) : 0}%</span>
                      </div>
                      <p className="font-mono tabular-nums text-2xl text-emerald-600">${fmt(idoGains, 0)}</p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">{fmt(idoCount, 1)} {isEn ? "IDOs" : "次打新"} × ${fmt(idoAllocPerEvent, 0)} × {(idoAvgMultiplier - 1).toFixed(0)}×</p>
                    </div>
                    <div className="p-4 rounded-xl border border-primary/40 bg-primary/5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[11px] text-primary uppercase tracking-wider font-semibold">{isEn ? "AI Monthly Dividend" : "AI 月度分红"}</p>
                        <span className="text-[10px] font-mono tabular-nums text-primary/80">{totalIncome > 0 ? fmt((aiDividend / totalIncome) * 100, 0) : 0}%</span>
                      </div>
                      <p className="font-mono tabular-nums text-2xl text-primary">${fmt(aiDividend, 0)}</p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">{fmt(aiShare * 100, 2)}% {isEn ? "pool share × " : "池占比 × "}{fmt(months, 1)}{isEn ? "mo" : "月"}</p>
                    </div>
                  </div>

                  <Link href="/tools" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                    {isEn ? "Open calculation tools" : "打开计算工具"} <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
