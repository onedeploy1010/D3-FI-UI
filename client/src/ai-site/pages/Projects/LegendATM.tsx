import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Copy, Check } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend as RechartsLegend,
} from "recharts";

function useShowZh() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("zh") ?? true;
}

/* ── contract addresses ── */
const CONTRACTS = [
  { labelZh: "代币合约", labelEn: "Token", addr: "0x986058ec93756E57b4e55b406dD0BeE24bcD95e3" },
  { labelZh: "质押合约", labelEn: "Staking", addr: "0xa479bdcd0eed3a776a4fefe5e13899bab567f263" },
  { labelZh: "交易对", labelEn: "Pair", addr: "0x659b44d603052132fd36cf048d9e0ba1e307ae3a" },
] as const;

/* ── constants ── */
const TIERS = [
  { days: 1, label: "1天", labelEn: "1-Day", dailyRate: 0.0020, monthlyRate: 0.0617 },
  { days: 15, label: "15天", labelEn: "15-Day", dailyRate: 0.0060, monthlyRate: 0.1970 },
  { days: 30, label: "30天", labelEn: "30-Day", dailyRate: 0.0130, monthlyRate: 0.4730 },
] as const;

const STATIC_RATIO = 0.65;
const BUB_RATIO = 0.30;
const FEE_RATIO = 0.05;
const LP_USDT_RATIO = 0.50;
const LP_ATM_RATIO = 0.50;

type TierIdx = 0 | 1 | 2;

/* ── helpers ── */
const fmt = (n: number, dec = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });

function calcSinglePeriod(principal: number, tierIdx: TierIdx) {
  const tier = TIERS[tierIdx];
  const grossPnl = principal * tier.monthlyRate;
  const net = grossPnl * (1 - FEE_RATIO);
  const staticInc = net * STATIC_RATIO;
  const bubInc = net * BUB_RATIO;
  const fee = grossPnl * FEE_RATIO;
  const total = principal + net;
  return { gross: grossPnl, net, staticInc, bubInc, fee, total };
}

function buildReinvestRows(
  principal: number,
  tierIdx: TierIdx,
  periods: number,
  reinvest: boolean,
) {
  const rows = [];
  let cap = principal;
  let cumPnl = 0;
  for (let i = 1; i <= periods; i++) {
    const r = calcSinglePeriod(cap, tierIdx);
    cumPnl += r.net;
    rows.push({
      period: i,
      principal: cap,
      grossPnl: r.gross,
      netPnl: r.net,
      cumPnl,
      balance: cap + r.net,
    });
    if (reinvest) cap = cap + r.net;
  }
  return rows;
}

const CHART_TT = {
  contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 },
};

/* ── sub-components ── */
function CopyAddress({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [addr]);
  return (
    <button
      onClick={handleCopy}
      className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all shrink-0"
      title="Copy address"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function StatCard({
  label, labelEn, value, sub, highlight = false,
}: { label: string; labelEn: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="relative border border-border bg-card rounded p-3 md:p-4 overflow-hidden">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-1">
        {labelEn} · {label}
      </div>
      <div className={`text-xl font-bold font-mono tabular-nums ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

/* ── main page ── */
export default function LegendATM() {
  const showZh = useShowZh();
  /* single calc state */
  const [principal, setPrincipal] = useState(1000);
  const [tierIdx, setTierIdx] = useState<TierIdx>(2);
  /* reinvest state */
  const [reinvestPrincipal, setReinvestPrincipal] = useState(1000);
  const [reinvestTier, setReinvestTier] = useState<TierIdx>(2);
  const [periods, setPeriods] = useState(6);
  const [autoReinvest, setAutoReinvest] = useState(true);
  /* dual token state */
  const [dualPrincipal, setDualPrincipal] = useState(2000);
  const [atmPrice, setAtmPrice] = useState(1.0);
  const [atmPriceEnd, setAtmPriceEnd] = useState(1.5);

  /* computed */
  const single = useMemo(() => calcSinglePeriod(principal, tierIdx), [principal, tierIdx]);
  const reinvestRows = useMemo(
    () => buildReinvestRows(reinvestPrincipal, reinvestTier, periods, autoReinvest),
    [reinvestPrincipal, reinvestTier, periods, autoReinvest],
  );
  const tier = TIERS[tierIdx];
  const annualSimple = tier.dailyRate * 365 * 100;

  /* dual token computed */
  const usdtLeg = dualPrincipal * LP_USDT_RATIO;
  const atmLeg = dualPrincipal * LP_ATM_RATIO;
  const atmUnits = atmLeg / atmPrice;
  const atmValueEnd = atmUnits * atmPriceEnd;
  const atmGain = atmValueEnd - atmLeg;
  const dualTier = TIERS[2];
  const dualGross = dualPrincipal * dualTier.monthlyRate;
  const dualNet = dualGross * (1 - FEE_RATIO);
  const totalEndValue = usdtLeg + atmValueEnd + dualNet;
  const totalReturn = totalEndValue - dualPrincipal;

  return (
    <div className="container mx-auto px-4 py-8 space-y-8 max-w-5xl">

      <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />{showZh && <span>返回项目库 · </span>}Back to Projects
      </Link>

      {/* ── hero ── */}
      <div className="relative border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card rounded-xl p-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-primary/70 font-medium mb-1">
              {showZh ? "VAULT · 全民做市商系统" : "VAULT · Market-Maker System"}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              LEGEND <span className="text-primary">ATM</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {showZh ? "每秒复利 · 非整天结算 · 三档周期可选" : "Per-second compounding · Partial-day settlement · 3 tiers"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {TIERS.map((t, i) => (
              <div key={i} className="text-center">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{showZh ? t.label : t.labelEn}</div>
                <div className="text-lg font-bold text-primary font-mono">{(t.monthlyRate * 100).toFixed(2)}%</div>
                {showZh && <div className="text-[11px] text-muted-foreground">月化</div>}
              </div>
            ))}
          </div>
        </div>

        {/* parameter strip */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-muted-foreground border-t border-border pt-4">
          {(showZh
            ? [
                ["LP 组成", "50% USDT + 50% ATM"],
                ["静态收益占比", "65%"],
                ["动态 BUB 占比", "30%"],
                ["手续费", "5%"],
                ["强制复投时限", "4 小时"],
                ["结算方式", "每秒复利"],
                ["防暴跌 -5%", "触发救助池"],
                ["防暴跌 -10%", "触发燃烧机制"],
              ]
            : [
                ["LP Composition", "50% USDT + 50% ATM"],
                ["Static Ratio", "65%"],
                ["Dynamic BUB Ratio", "30%"],
                ["Fee", "5%"],
                ["Force-reinvest TTL", "4 hours"],
                ["Settlement", "Per-second compound"],
                ["Bailout trigger", "Price dip ≥ 5%"],
                ["Burn trigger", "Price dip ≥ 10%"],
              ]
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between border border-border rounded px-2 py-1 bg-muted/30">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium text-foreground">{v}</span>
            </div>
          ))}
        </div>

        {/* ── contract addresses ── */}
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-2">
          {CONTRACTS.map(({ labelZh, labelEn, addr }) => (
            <div key={addr} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span className="text-[11px] uppercase tracking-[0.15em] text-primary/70 font-semibold shrink-0 w-16">
                {showZh ? labelZh : labelEn}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground truncate flex-1">
                {addr.slice(0, 6)}…{addr.slice(-6)}
              </span>
              <CopyAddress addr={addr} />
            </div>
          ))}
        </div>
      </div>

      {/* ── tabs ── */}
      <Tabs defaultValue="single">
        <TabsList className="w-full grid grid-cols-4 mb-6">
          <TabsTrigger value="single">{showZh ? "单笔计算" : "Single"}</TabsTrigger>
          <TabsTrigger value="reinvest">{showZh ? "复投分析" : "Reinvest"}</TabsTrigger>
          <TabsTrigger value="dual">{showZh ? "双币分析" : "Dual-Token"}</TabsTrigger>
          <TabsTrigger value="params">{showZh ? "参数说明" : "Params"}</TabsTrigger>
        </TabsList>

        {/* ────────────── TAB 1: Single ────────────── */}
        <TabsContent value="single" className="space-y-6">
          {/* period selector */}
          <div className="grid grid-cols-3 gap-3">
            {TIERS.map((t, i) => (
              <button
                key={i}
                onClick={() => setTierIdx(i as TierIdx)}
                className={`relative border rounded-lg p-4 text-center transition-all ${
                  tierIdx === i
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                  {t.labelEn}
                </div>
                <div className="text-2xl font-bold text-primary font-mono">{(t.dailyRate * 100).toFixed(2)}%</div>
                {showZh && <div className="text-xs text-muted-foreground">日化收益率</div>}
                <div className="mt-1 text-sm font-semibold text-primary">
                  {showZh ? `月化 ${(t.monthlyRate * 100).toFixed(2)}%` : `Monthly ${(t.monthlyRate * 100).toFixed(2)}%`}
                </div>
              </button>
            ))}
          </div>

          {/* principal input */}
          <div className="border border-border bg-card rounded-lg p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium">
              {showZh ? "投资本金 Principal (USDT)" : "Principal (USDT)"}
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={principal}
                min={100}
                step={100}
                onChange={e => setPrincipal(Math.max(0, Number(e.target.value)))}
                className="text-xl font-bold font-mono tabular-nums w-40"
              />
              <span className="text-muted-foreground">USDT</span>
            </div>
            <Slider
              min={100} max={100000} step={100} value={[principal]}
              onValueChange={([v]) => setPrincipal(v)}
              className="mt-2"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>$100</span><span>$10K</span><span>$50K</span><span>$100K</span>
            </div>
          </div>

          {/* results */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="期末利润" labelEn="Net PnL" value={`+$${fmt(single.net)}`} sub={`1周期 ${TIERS[tierIdx].days}天`} highlight />
            <StatCard label="静态收益" labelEn="Static Income" value={`$${fmt(single.staticInc)}`} sub="65% of net" />
            <StatCard label="BUB 动态" labelEn="BUB Dynamic" value={`$${fmt(single.bubInc)}`} sub="30% of net" />
            <StatCard label="手续费" labelEn="Platform Fee" value={`$${fmt(single.fee)}`} sub="5% of gross" />
          </div>

          {/* breakdown bar */}
          <div className="border border-border bg-card rounded-lg p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium mb-3">
              {showZh ? "收益拆解 Yield Breakdown · 1000U 示例对比" : "Yield Breakdown · 1000U Reference"}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={TIERS.map(t => {
                const gross = 1000 * t.monthlyRate;
                const net = gross * (1 - FEE_RATIO);
                return {
                  name: showZh ? t.label : t.labelEn,
                  staticInc: +(net * STATIC_RATIO).toFixed(2),
                  bubDyn: +(net * BUB_RATIO).toFixed(2),
                  fee: +(gross * FEE_RATIO).toFixed(2),
                };
              })}>
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => "$" + v} />
                <Tooltip
                  contentStyle={CHART_TT.contentStyle}
                  formatter={(v: number) => ["$" + fmt(v)]}
                />
                <RechartsLegend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="staticInc" name={showZh ? "静态收益" : "Static"} stackId="a" fill="hsl(var(--chart-1))" radius={[0, 0, 0, 0]} />
                <Bar dataKey="bubDyn" name={showZh ? "BUB动态" : "BUB Dynamic"} stackId="a" fill="hsl(var(--chart-4))" />
                <Bar dataKey="fee" name={showZh ? "手续费" : "Fee"} stackId="a" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* APY reference */}
          <div className="border border-border bg-card rounded-lg p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium mb-3">
              {showZh ? "年化参考" : "Annual Reference"} · {showZh ? `${TIERS[tierIdx].label}档` : `${TIERS[tierIdx].labelEn}`}
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">{showZh ? "日化收益率" : "Daily Rate"}</div>
                <div className="text-2xl font-bold text-primary font-mono">{(tier.dailyRate * 100).toFixed(2)}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">{showZh ? "月化复利率" : "Monthly Compound"}</div>
                <div className="text-2xl font-bold text-primary font-mono">{(tier.monthlyRate * 100).toFixed(2)}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">{showZh ? "简单年化估算" : "Simple Annualized"}</div>
                <div className="text-2xl font-bold text-primary font-mono">{annualSimple.toFixed(0)}%</div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ────────────── TAB 2: Reinvest ────────────── */}
        <TabsContent value="reinvest" className="space-y-6">
          {/* controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-border bg-card rounded-lg p-4 space-y-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium">{showZh ? "初始本金" : "Principal"}</div>
              <div className="flex items-center gap-2">
                <Input type="number" value={reinvestPrincipal} min={100} step={100}
                  onChange={e => setReinvestPrincipal(Math.max(0, Number(e.target.value)))}
                  className="font-bold font-mono tabular-nums w-36"
                />
                <span className="text-muted-foreground text-sm">USDT</span>
              </div>
              <Slider min={100} max={100000} step={100} value={[reinvestPrincipal]}
                onValueChange={([v]) => setReinvestPrincipal(v)} />
            </div>

            <div className="border border-border bg-card rounded-lg p-4 space-y-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium">{showZh ? `投资周期数 · ${periods} 期` : `Periods · ${periods}`}</div>
              <Slider min={1} max={24} step={1} value={[periods]}
                onValueChange={([v]) => setPeriods(v)} />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                {showZh ? <><span>1期</span><span>12期</span><span>24期</span></> : <><span>1</span><span>12</span><span>24</span></>}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="grid grid-cols-3 gap-2 flex-1">
              {TIERS.map((t, i) => (
                <button key={i} onClick={() => setReinvestTier(i as TierIdx)}
                  className={`border rounded-lg py-2 px-3 text-center text-sm transition-all ${
                    reinvestTier === i ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="font-bold text-primary font-mono">{(TIERS[i].monthlyRate * 100).toFixed(1)}%</div>
                  <div className="text-[11px] text-muted-foreground">{showZh ? t.label : t.labelEn}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setAutoReinvest(r => !r)}
              className={`border rounded-lg px-4 py-2 text-sm transition-all ${
                autoReinvest ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {showZh ? (autoReinvest ? "自动复投 ON" : "自动复投 OFF") : (autoReinvest ? "Auto-reinvest ON" : "Auto-reinvest OFF")}
            </button>
          </div>

          {/* growth chart */}
          <div className="border border-border bg-card rounded-lg p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium mb-3">
              {showZh ? `资产增长曲线 · ${autoReinvest ? "复利" : "单利"}模式` : `Balance Growth · ${autoReinvest ? "Compound" : "Simple"}`}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={reinvestRows.map(r => ({ period: showZh ? `第${r.period}期` : `P${r.period}`, balance: +r.balance.toFixed(2), cumPnl: +r.cumPnl.toFixed(2) }))}>
                <defs>
                  <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="period" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "K" : v)} />
                <Tooltip contentStyle={CHART_TT.contentStyle} formatter={(v: number) => ["$" + fmt(v)]} />
                <Area type="monotone" dataKey="balance" name={showZh ? "资产余额" : "Balance"} stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#balGrad)" dot={false} />
                <Area type="monotone" dataKey="cumPnl" name={showZh ? "累计盈亏" : "Cumulative PnL"} stroke="hsl(150,60%,36%)" strokeWidth={1.5} fill="none" dot={false} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* table */}
          <div className="border border-border bg-card rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {(showZh
                      ? ["期数", "投入本金", "毛利润", "净收益", "累计盈亏", "期末余额"]
                      : ["Period", "Principal", "Gross", "Net", "Cumulative", "Balance"]
                    ).map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reinvestRows.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-muted-foreground">{showZh ? `第 ${r.period} 期` : `P${r.period}`}</td>
                      <td className="px-3 py-2 font-mono tabular-nums">${fmt(r.principal)}</td>
                      <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">+${fmt(r.grossPnl)}</td>
                      <td className="px-3 py-2 font-mono tabular-nums text-emerald-600">+${fmt(r.netPnl)}</td>
                      <td className="px-3 py-2 font-mono tabular-nums text-primary">+${fmt(r.cumPnl)}</td>
                      <td className="px-3 py-2 font-mono tabular-nums font-semibold">${fmt(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* summary */}
            {reinvestRows.length > 0 && (
              <div className="border-t border-border bg-primary/5 px-3 py-2 flex flex-wrap gap-4 text-sm">
                <span className="text-muted-foreground">{showZh ? "总盈亏：" : "Total PnL: "}<span className="text-primary font-mono font-bold">+${fmt(reinvestRows.at(-1)!.cumPnl)}</span></span>
                <span className="text-muted-foreground">{showZh ? "期末资产：" : "Final Balance: "}<span className="font-mono font-bold">${fmt(reinvestRows.at(-1)!.balance)}</span></span>
                <span className="text-muted-foreground">{showZh ? "总回报率：" : "Total Return: "}<span className="text-emerald-600 font-bold">{((reinvestRows.at(-1)!.balance / reinvestPrincipal - 1) * 100).toFixed(2)}%</span></span>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ────────────── TAB 3: Dual Token ────────────── */}
        <TabsContent value="dual" className="space-y-6">
          <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 text-sm text-amber-700">
            {showZh
              ? "LP 由 50% USDT（稳定） + 50% ATM（波动）组成，ATM 价格涨跌直接影响总收益。"
              : "The LP is 50% USDT (stable) + 50% ATM (volatile); ATM price moves directly affect total return."}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-border bg-card rounded-lg p-4 space-y-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium">{showZh ? "投入总量 (USDT)" : "Total Input (USDT)"}</div>
              <Input type="number" value={dualPrincipal} min={200} step={100}
                onChange={e => setDualPrincipal(Math.max(0, Number(e.target.value)))}
                className="font-bold font-mono tabular-nums" />
              <Slider min={200} max={200000} step={200} value={[dualPrincipal]}
                onValueChange={([v]) => setDualPrincipal(v)} />
            </div>
            <div className="border border-border bg-card rounded-lg p-4 space-y-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium">{showZh ? "ATM 入场价 (U)" : "ATM Entry Price (U)"}</div>
              <Input type="number" value={atmPrice} min={0.01} step={0.01}
                onChange={e => setAtmPrice(Math.max(0.01, Number(e.target.value)))}
                className="font-bold font-mono tabular-nums" />
              <Slider min={0.01} max={10} step={0.01} value={[atmPrice]}
                onValueChange={([v]) => setAtmPrice(v)} />
            </div>
            <div className="border border-border bg-card rounded-lg p-4 space-y-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium">{showZh ? "ATM 到期价 (U)" : "ATM Exit Price (U)"}</div>
              <Input type="number" value={atmPriceEnd} min={0.01} step={0.01}
                onChange={e => setAtmPriceEnd(Math.max(0.01, Number(e.target.value)))}
                className="font-bold font-mono tabular-nums" />
              <Slider min={0.01} max={20} step={0.01} value={[atmPriceEnd]}
                onValueChange={([v]) => setAtmPriceEnd(v)} />
            </div>
          </div>

          {/* breakdown cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="USDT腿" labelEn="USDT Leg" value={`$${fmt(usdtLeg)}`} sub={showZh ? "稳定 · 50%" : "Stable · 50%"} />
            <StatCard label="ATM腿" labelEn="ATM Leg"
              value={`$${fmt(atmValueEnd)}`}
              sub={atmGain >= 0 ? `+$${fmt(atmGain)} ${showZh ? "涨幅" : "gain"}` : `-$${fmt(Math.abs(atmGain))} ${showZh ? "跌幅" : "loss"}`}
              highlight={atmGain >= 0}
            />
            <StatCard label="做市净收益" labelEn="Vault Net" value={`+$${fmt(dualNet)}`} sub={showZh ? "30天周期" : "30-day period"} highlight />
            <StatCard
              label="总回报"
              labelEn="Total Return"
              value={`${totalReturn >= 0 ? "+" : ""}$${fmt(totalReturn)}`}
              sub={`${((totalReturn / dualPrincipal) * 100).toFixed(2)}% ${showZh ? "总回报率" : "total"}`}
              highlight={totalReturn >= 0}
            />
          </div>

          {/* LP split vis */}
          <div className="border border-border bg-card rounded-lg p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium mb-4">
              {showZh ? "LP 构成 · 资产配比" : "LP Composition · Asset Ratio"}
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-3 rounded-full overflow-hidden bg-muted flex">
                <div className="h-full bg-blue-500" style={{ width: "50%" }} />
                <div className="h-full bg-amber-500" style={{ width: "50%" }} />
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">50% / 50%</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-muted-foreground">USDT：${fmt(usdtLeg)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">
                  ATM：{fmt(atmUnits, 0)} {showZh ? "枚" : "units"} × ${atmPriceEnd} = ${fmt(atmValueEnd)}
                </span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="border border-border rounded p-2">
                <div className="text-[11px] text-muted-foreground">{showZh ? "ATM 涨跌幅" : "ATM Change"}</div>
                <div className={`text-lg font-bold font-mono tabular-nums ${atmGain >= 0 ? "text-primary" : "text-red-500"}`}>
                  {atmGain >= 0 ? "+" : ""}{(((atmPriceEnd / atmPrice) - 1) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="border border-border rounded p-2">
                <div className="text-[11px] text-muted-foreground">{showZh ? "做市月化" : "Vault Monthly"}</div>
                <div className="text-lg font-bold text-primary font-mono">47.30%</div>
              </div>
              <div className="border border-border rounded p-2">
                <div className="text-[11px] text-muted-foreground">{showZh ? "综合总回报" : "Total Return"}</div>
                <div className={`text-lg font-bold font-mono tabular-nums ${totalReturn >= 0 ? "text-primary" : "text-red-500"}`}>
                  {totalReturn >= 0 ? "+" : ""}{((totalReturn / dualPrincipal) * 100).toFixed(2)}%
                </div>
              </div>
            </div>
          </div>

          {/* ATM price scenario table */}
          <div className="border border-border bg-card rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium">
              {showZh ? `ATM 价格情景分析 · 基于 $${fmt(dualPrincipal)} 投入` : `ATM Price Scenarios · Based on $${fmt(dualPrincipal)} input`}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {(showZh
                      ? ["ATM 到期价", "ATM腿价值", "做市净收益", "综合总回报", "总回报率"]
                      : ["Exit Price", "ATM Leg", "Vault Net", "Total Return", "Return %"]
                    ).map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 3.0].map(multiplier => {
                    const price = +(atmPrice * multiplier).toFixed(3);
                    const atmVal = atmUnits * price;
                    const gain = atmVal - atmLeg;
                    const net = dualPrincipal * TIERS[2].monthlyRate * (1 - FEE_RATIO);
                    const total = usdtLeg + atmVal + net - dualPrincipal;
                    const isCurrent = Math.abs(price - atmPriceEnd) < 0.001;
                    return (
                      <tr key={multiplier} className={`border-b border-border last:border-0 transition-colors ${isCurrent ? "bg-primary/10" : "hover:bg-muted/30"}`}>
                        <td className="px-3 py-2 font-mono tabular-nums font-medium">${fmt(price, 3)}</td>
                        <td className={`px-3 py-2 font-mono tabular-nums ${gain >= 0 ? "text-emerald-600" : "text-red-500"}`}>${fmt(atmVal)}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-emerald-600">+${fmt(net)}</td>
                        <td className={`px-3 py-2 font-mono tabular-nums font-bold ${total >= 0 ? "text-primary" : "text-red-500"}`}>
                          {total >= 0 ? "+" : ""} ${fmt(total)}
                        </td>
                        <td className={`px-3 py-2 font-mono tabular-nums ${total >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {total >= 0 ? "+" : ""}{((total / dualPrincipal) * 100).toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ────────────── TAB 4: Params ────────────── */}
        <TabsContent value="params" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* system params */}
            <div className="border border-border bg-card rounded-lg p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium mb-3">
                {showZh ? "核心系统参数" : "Core System Parameters"}
              </div>
              <div className="space-y-2">
                {(showZh
                  ? [
                      ["投资周期选项", "1天 / 15天 / 30天"],
                      ["结算机制", "每秒复利，非整天结算"],
                      ["LP 组成", "50% USDT + 50% ATM"],
                      ["强制复投时限", "4小时（超时利息回流）"],
                      ["手续费", "5%（从毛利润中自动扣除）"],
                    ]
                  : [
                      ["Period Options", "1 / 15 / 30 days"],
                      ["Settlement", "Per-second compound, partial-day"],
                      ["LP Composition", "50% USDT + 50% ATM"],
                      ["Force-reinvest TTL", "4 hours (interest reflows)"],
                      ["Fee", "5% (auto-deducted from gross)"],
                    ]
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm border-b border-border pb-2">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* yield distribution */}
            <div className="border border-border bg-card rounded-lg p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium mb-3">
                {showZh ? "收益分配结构" : "Yield Distribution"}
              </div>
              <div className="space-y-2">
                {(showZh
                  ? [
                      ["静态收益占比", "65%", "text-primary"],
                      ["动态 BUB 占比", "30%", "text-emerald-600"],
                      ["平台手续费", "5%", "text-red-500"],
                      ["节点地址分配", "额外激励", ""],
                      ["救助池（防跌-5%）", "触发保护机制", ""],
                      ["燃烧机制（防跌-10%）", "ATM通缩加速", ""],
                    ]
                  : [
                      ["Static Ratio", "65%", "text-primary"],
                      ["Dynamic BUB Ratio", "30%", "text-emerald-600"],
                      ["Platform Fee", "5%", "text-red-500"],
                      ["Node Allocation", "Extra incentive", ""],
                      ["Bailout Pool (-5%)", "Protection trigger", ""],
                      ["Burn (-10%)", "ATM deflation boost", ""],
                    ]
                ).map(([k, v, cls]) => (
                  <div key={k} className="flex justify-between text-sm border-b border-border pb-2">
                    <span className="text-muted-foreground">{k}</span>
                    <span className={`font-bold ${cls ?? ""}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* tier table */}
          <div className="border border-border bg-card rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium">
              {showZh ? "三档收益方案速查 · 1000 USDT 示例（每秒复利，非整天结算）" : "Tier Reference · 1000 USDT example (per-second compound)"}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {(showZh
                    ? ["投资周期", "日化收益率", "月化复利率", "净利润（1000U）", "期末总资产"]
                    : ["Period", "Daily Rate", "Monthly Compound", "Net PnL (1000U)", "Final Total"]
                  ).map(h => (
                    <th key={h} className="px-4 py-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIERS.map((t, i) => {
                  const r = calcSinglePeriod(1000, i as TierIdx);
                  return (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{showZh ? t.label : t.labelEn}</td>
                      <td className="px-4 py-3 text-primary font-mono font-bold">{(t.dailyRate * 100).toFixed(2)}%</td>
                      <td className="px-4 py-3 text-primary font-mono font-bold">{(t.monthlyRate * 100).toFixed(2)}%</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-emerald-600 font-semibold">+${fmt(r.net)}</td>
                      <td className="px-4 py-3 font-mono tabular-nums font-bold">${fmt(r.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </TabsContent>
      </Tabs>
    </div>
  );
}
