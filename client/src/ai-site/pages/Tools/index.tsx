import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  Activity, TrendingUp, AlertTriangle, Coins, Droplets, BarChart3, Users, Target,
  ChevronRight, Pickaxe,
} from "lucide-react";
import { useShowZh } from "./helpers";
import {
  ApyCalculator, InvestmentSimulator, ImpermanentLossCalculator, StakingProjector,
  PledgeMining, AAMPoolSimulator, CLMMAnalyzer, TradingProfitCalculator, BrokerEarningsCalculator,
} from "./calculators";

const CATEGORIES = [
  {
    id: "defi",
    name: "General DeFi",
    nameZh: "通用 DeFi",
    tools: [
      { id: "apy", name: "APY Calculator", nameZh: "年化收益计算器", Icon: Activity, color: "text-primary" },
      { id: "investment", name: "Investment Simulator", nameZh: "投资模拟器", Icon: TrendingUp, color: "text-chart-2" },
      { id: "il", name: "Impermanent Loss", nameZh: "无常损失", Icon: AlertTriangle, color: "text-destructive" },
    ],
  },
  {
    id: "staking",
    name: "Staking & Liquidity",
    nameZh: "铸造与流动性",
    tools: [
      { id: "staking", name: "Staking Suite", nameZh: "铸造工具套件", Icon: Coins, color: "text-chart-3" },
      { id: "pledge", name: "Pledge & Mining", nameZh: "质押与挖矿", Icon: Pickaxe, color: "text-chart-5" },
      { id: "aam", name: "AAM Pool Simulator", nameZh: "流动性池模拟", Icon: Droplets, color: "text-chart-4" },
      { id: "clmm", name: "CLMM Analyzer", nameZh: "集中流动性分析", Icon: Target, color: "text-primary" },
    ],
  },
  {
    id: "rewards",
    name: "Trading & Rewards",
    nameZh: "交易与奖励",
    tools: [
      { id: "trading", name: "Trading Profit", nameZh: "交易分红计算", Icon: BarChart3, color: "text-primary" },
      { id: "broker", name: "Broker Earnings", nameZh: "推荐层级收益", Icon: Users, color: "text-chart-2" },
    ],
  },
] as const;

type ToolId = "apy" | "investment" | "il" | "staking" | "pledge" | "aam" | "clmm" | "trading" | "broker";

export default function Tools() {
  const [active, setActive] = useState<ToolId>("apy");
  const showZh = useShowZh();

  const allTools = CATEGORIES.flatMap(c => c.tools as readonly any[]);
  const activeTool = allTools.find(t => t.id === active) as any;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="border-b border-border/50 pb-6">
        {showZh && (
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-primary/70">经济模拟器</span>
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight gradient-text-gold leading-tight">
          Economic Simulators
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Advanced calculators for DeFi yields, liquidity analysis, and protocol-level economic simulation.
          {showZh && <span className="hidden sm:inline"> · 高级计算器，涵盖 DeFi 收益、流动性分析及协议经济模拟。</span>}
        </p>
      </div>

      {/* Mobile nav */}
      <div className="lg:hidden">
        <Select value={active} onValueChange={(v) => setActive(v as ToolId)}>
          <SelectTrigger className="w-full bg-card border-border shadow-sm h-11">
            <div className="flex items-center gap-2">
              <activeTool.Icon className={`h-4 w-4 shrink-0 ${activeTool.color}`} />
              <span className="font-medium">{activeTool.name}</span>
              {showZh && <span className="text-xs text-muted-foreground ml-1">{activeTool.nameZh}</span>}
            </div>
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(cat => (
              <div key={cat.id}>
                <div className="px-2 py-1.5">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
                    {cat.name}{showZh && ` · ${cat.nameZh}`}
                  </p>
                </div>
                {cat.tools.map(tool => (
                  <SelectItem key={tool.id} value={tool.id}>
                    <span className="flex items-center gap-2">
                      <tool.Icon className={`h-3.5 w-3.5 ${tool.color}`} />
                      <span>{tool.name}</span>
                      {showZh && <span className="text-xs text-muted-foreground">{tool.nameZh}</span>}
                    </span>
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sidebar + Content */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-0">
        <aside className="hidden lg:flex flex-col w-52 xl:w-60 shrink-0 gap-1 sticky top-20 h-[calc(100vh-160px)] overflow-y-auto pr-4 border-r border-border/50">
          {CATEGORIES.map((cat, ci) => (
            <div key={cat.id} className={ci > 0 ? "mt-5" : ""}>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50 font-semibold mb-2 px-2">
                <span className="block">{cat.name}</span>
                {showZh && <span className="block text-[10px] normal-case tracking-wide font-normal text-muted-foreground/40 mt-0.5">{cat.nameZh}</span>}
              </p>
              {cat.tools.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => setActive(tool.id as ToolId)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 mb-0.5 transition-all group
                    ${active === tool.id
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-muted/40 border border-transparent"
                    }`}
                >
                  <tool.Icon className={`h-4 w-4 shrink-0 ${active === tool.id ? tool.color : "text-muted-foreground group-hover:text-foreground"}`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-medium leading-tight truncate ${active === tool.id ? tool.color : "text-foreground"}`}>
                      {tool.name}
                    </p>
                    {showZh && <p className="text-[11px] text-muted-foreground truncate">{tool.nameZh}</p>}
                  </div>
                  {active === tool.id && <ChevronRight className={`h-3 w-3 ml-auto shrink-0 ${tool.color}`} />}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <main className="flex-1 min-w-0 lg:pl-6">
          {active === "apy" && <ApyCalculator />}
          {active === "investment" && <InvestmentSimulator />}
          {active === "il" && <ImpermanentLossCalculator />}
          {active === "staking" && <StakingProjector />}
          {active === "pledge" && <PledgeMining />}
          {active === "aam" && <AAMPoolSimulator />}
          {active === "clmm" && <CLMMAnalyzer />}
          {active === "trading" && <TradingProfitCalculator />}
          {active === "broker" && <BrokerEarningsCalculator />}
        </main>
      </div>
    </div>
  );
}
