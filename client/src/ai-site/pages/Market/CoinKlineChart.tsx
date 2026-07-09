import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTranslation } from "react-i18next";
import { cn } from "@ai/lib/utils";
import { Sparkles, CandlestickChart, LineChart, AreaChart, BarChart3 } from "lucide-react";

type ChartType = "candle" | "line" | "area" | "bar";
type Timeframe = "15m" | "1H" | "4H" | "1D";

const TIMEFRAMES: { key: Timeframe; label: string; stepSec: number; volPct: number }[] = [
  { key: "15m", label: "15m", stepSec: 900, volPct: 0.0035 },
  { key: "1H", label: "1H", stepSec: 3600, volPct: 0.007 },
  { key: "4H", label: "4H", stepSec: 14400, volPct: 0.014 },
  { key: "1D", label: "1D", stepSec: 86400, volPct: 0.028 },
];

const CHART_TYPES: { key: ChartType; icon: any }[] = [
  { key: "candle", icon: CandlestickChart },
  { key: "line", icon: LineChart },
  { key: "area", icon: AreaChart },
  { key: "bar", icon: BarChart3 },
];

const UP_COLOR = "#059669";
const DOWN_COLOR = "#e11d48";
const FORECAST_COLOR = "#8A2B57";
const TEXT_COLOR = "rgba(94, 26, 60, 0.45)";
const GRID_COLOR = "rgba(94, 26, 60, 0.05)";
const BORDER_COLOR = "rgba(94, 26, 60, 0.10)";

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Ohlc { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number }
interface ForecastPoint { time: UTCTimestamp; open: number; close: number; high: number; low: number }

function generateOhlc(seed: number, endPrice: number, tf: Timeframe, nowSec: number): Ohlc[] {
  const conf = TIMEFRAMES.find(x => x.key === tf)!;
  const n = 90;
  const rand = seededRand(seed + conf.stepSec);
  const alignedNow = Math.floor(nowSec / conf.stepSec) * conf.stepSec;
  const closes: number[] = new Array(n);
  closes[n - 1] = endPrice;
  for (let i = n - 2; i >= 0; i--) {
    const drift = (rand() - 0.5) * 2 * conf.volPct;
    closes[i] = closes[i + 1] / (1 + drift);
  }
  const bars: Ohlc[] = [];
  for (let i = 0; i < n; i++) {
    const open = i === 0 ? closes[0] * (1 + (rand() - 0.5) * conf.volPct) : closes[i - 1];
    const close = closes[i];
    const wick = Math.abs(close - open) * (0.3 + rand() * 0.8) + close * conf.volPct * 0.15;
    bars.push({
      time: (alignedNow - (n - 1 - i) * conf.stepSec) as UTCTimestamp,
      open,
      close,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
      volume: (0.4 + rand()) * endPrice * 12,
    });
  }
  return bars;
}

function generateForecast(seed: number, lastBar: Ohlc, targetPrice: number, tf: Timeframe): ForecastPoint[] {
  const conf = TIMEFRAMES.find(x => x.key === tf)!;
  const steps = 8;
  const rand = seededRand(seed * 7 + 13);
  const pts: ForecastPoint[] = [];
  let prev = lastBar.close;
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const ideal = lastBar.close + (targetPrice - lastBar.close) * progress;
    const wobble = (rand() - 0.5) * Math.abs(targetPrice - lastBar.close) * 0.35;
    const close = i === steps ? targetPrice : ideal + wobble;
    const wick = Math.abs(close - prev) * (0.25 + rand() * 0.3);
    pts.push({
      time: (lastBar.time + i * conf.stepSec) as UTCTimestamp,
      open: prev,
      close,
      high: Math.max(prev, close) + wick,
      low: Math.min(prev, close) - wick,
    });
    prev = close;
  }
  return pts;
}

function fmtP(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 10) return p.toFixed(2);
  return p.toFixed(4);
}

interface CoinKlineChartProps {
  coinKey: string;
  price: number;
  seed: number;
  forecastDirection: "BULLISH" | "BEARISH" | "NEUTRAL";
  forecastTarget: number;
  forecastModel: string;
  forecastConfidence: number;
}

export function CoinKlineChart({
  coinKey, price, seed, forecastDirection, forecastTarget, forecastModel, forecastConfidence,
}: CoinKlineChartProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1H");
  const [chartType, setChartType] = useState<ChartType>("candle");
  const [showForecast, setShowForecast] = useState(true);

  const nowSec = useMemo(() => Math.floor(Date.now() / 1000), []);
  const ohlc = useMemo(
    () => generateOhlc(seed + coinKey.length * 97, price, timeframe, nowSec),
    [seed, coinKey, price, timeframe, nowSec],
  );
  const forecastPts = useMemo(
    () => generateForecast(seed, ohlc[ohlc.length - 1], forecastTarget, timeframe),
    [seed, ohlc, forecastTarget, timeframe],
  );

  const lastBar = ohlc[ohlc.length - 1];
  const barChange = lastBar.open ? ((lastBar.close - lastBar.open) / lastBar.open) * 100 : 0;

  const rebuild = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 340,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: TEXT_COLOR,
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'Inter', system-ui, monospace",
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(138,43,87,0.3)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#8A2B57" },
        horzLine: { color: "rgba(138,43,87,0.3)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#8A2B57" },
      },
      rightPriceScale: {
        borderColor: BORDER_COLOR,
        scaleMargins: { top: 0.08, bottom: 0.15 },
      },
      timeScale: {
        borderColor: BORDER_COLOR,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 9,
      },
      handleScroll: { vertTouchDrag: false },
    });
    chartRef.current = chart;

    let mainSeries: ISeriesApi<any>;
    if (chartType === "candle") {
      mainSeries = chart.addCandlestickSeries({
        upColor: UP_COLOR, downColor: DOWN_COLOR,
        borderUpColor: UP_COLOR, borderDownColor: DOWN_COLOR,
        wickUpColor: UP_COLOR, wickDownColor: DOWN_COLOR,
      });
    } else if (chartType === "bar") {
      mainSeries = chart.addBarSeries({ upColor: UP_COLOR, downColor: DOWN_COLOR, thinBars: false });
    } else if (chartType === "area") {
      mainSeries = chart.addAreaSeries({
        topColor: "rgba(138,43,87,0.18)", bottomColor: "rgba(138,43,87,0.01)",
        lineColor: "#8A2B57", lineWidth: 2,
      });
    } else {
      mainSeries = chart.addLineSeries({ color: "#8A2B57", lineWidth: 2 });
    }

    const isCandleMode = chartType === "candle" || chartType === "bar";
    if (isCandleMode) {
      mainSeries.setData(ohlc.map<CandlestickData>(d => ({
        time: d.time, open: d.open, high: d.high, low: d.low, close: d.close,
      })));
    } else {
      mainSeries.setData(ohlc.map<LineData>(d => ({ time: d.time, value: d.close })));
    }

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } });
    volumeSeries.setData(ohlc.map<HistogramData>(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? "rgba(5,150,105,0.18)" : "rgba(225,29,72,0.18)",
    })));

    if (showForecast) {
      if (isCandleMode) {
        const fcSeries = chart.addCandlestickSeries({
          upColor: "rgba(138,43,87,0.30)", downColor: "rgba(138,43,87,0.30)",
          borderUpColor: "rgba(138,43,87,0.65)", borderDownColor: "rgba(138,43,87,0.65)",
          wickUpColor: "rgba(138,43,87,0.65)", wickDownColor: "rgba(138,43,87,0.65)",
        });
        fcSeries.setData(forecastPts.map<CandlestickData>(p => ({
          time: p.time, open: p.open, high: p.high, low: p.low, close: p.close,
        })));
        fcSeries.setMarkers([
          {
            time: forecastPts[0].time, position: "aboveBar", color: FORECAST_COLOR,
            shape: "arrowDown", text: "AI", size: 1,
          },
          {
            time: forecastPts[forecastPts.length - 1].time, position: "aboveBar", color: FORECAST_COLOR,
            shape: "circle", text: `$${fmtP(forecastTarget)}`, size: 1.5,
          },
        ]);
      } else {
        const fcLine = chart.addLineSeries({
          color: FORECAST_COLOR, lineWidth: 2, lineStyle: LineStyle.Dashed,
          lastValueVisible: true, priceLineVisible: false,
        });
        fcLine.setData([
          { time: lastBar.time, value: lastBar.close },
          ...forecastPts.map<LineData>(p => ({ time: p.time, value: p.close })),
        ]);
        fcLine.setMarkers([{
          time: forecastPts[forecastPts.length - 1].time, position: "aboveBar" as const,
          color: FORECAST_COLOR, shape: "circle" as const, text: `$${fmtP(forecastTarget)}`, size: 1.5,
        }]);
      }

      mainSeries.createPriceLine({
        price: forecastTarget,
        color: FORECAST_COLOR,
        lineWidth: 1,
        lineStyle: LineStyle.SparseDotted,
        axisLabelVisible: true,
        title: `AI ${t("market.caTarget")}`,
      });
    }

    const total = ohlc.length + (showForecast ? forecastPts.length : 0);
    const show = (showForecast ? forecastPts.length : 0) + 42;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, total - show), to: total + 2 });

    const resize = () => {
      if (chartRef.current && container) chartRef.current.applyOptions({ width: container.clientWidth });
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [ohlc, forecastPts, chartType, showForecast, forecastTarget, lastBar, t]);

  useEffect(() => {
    const cleanup = rebuild();
    return () => {
      cleanup?.();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [rebuild]);

  const dirColor =
    forecastDirection === "BULLISH" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25" :
    forecastDirection === "BEARISH" ? "bg-red-500/10 text-red-500 border-red-500/25" :
    "bg-amber-500/10 text-amber-500 border-amber-500/25";

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-3.5">
      <div className="flex items-center gap-1 flex-wrap mb-2">
        <span className="text-[11px] font-bold text-foreground/80 mr-2">{t("market.caChartTitle")}</span>
        {TIMEFRAMES.map(tf => (
          <button key={tf.key} onClick={() => setTimeframe(tf.key)}
            className={cn("px-2 py-0.5 rounded-md text-[11px] font-semibold font-mono transition-all",
              timeframe === tf.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-muted")}>
            {tf.label}
          </button>
        ))}
        <div className="w-px h-3.5 bg-border/60 mx-1" />
        {CHART_TYPES.map(ct => {
          const Icon = ct.icon;
          return (
            <button key={ct.key} onClick={() => setChartType(ct.key)}
              className={cn("p-1 rounded-md transition-all",
                chartType === ct.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground/50 hover:text-foreground hover:bg-muted")}>
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
        <button onClick={() => setShowForecast(v => !v)}
          className={cn("ml-auto flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-black transition-all",
            showForecast ? dirColor : "border-border/40 bg-card/50 text-muted-foreground/60")}>
          <Sparkles className="h-3 w-3" />
          {forecastModel} · {forecastConfidence}% · ${fmtP(forecastTarget)}
        </button>
      </div>

      <div className="flex items-center gap-2.5 text-[10px] font-mono mb-1.5 overflow-x-auto scrollbar-hide">
        <span className="text-muted-foreground/60 whitespace-nowrap">O <span className="text-foreground/80">{fmtP(lastBar.open)}</span></span>
        <span className="text-muted-foreground/60 whitespace-nowrap">H <span className="text-foreground/80">{fmtP(lastBar.high)}</span></span>
        <span className="text-muted-foreground/60 whitespace-nowrap">L <span className="text-foreground/80">{fmtP(lastBar.low)}</span></span>
        <span className="text-muted-foreground/60 whitespace-nowrap">C <span className="text-foreground/80">{fmtP(lastBar.close)}</span></span>
        <span className={cn("font-bold whitespace-nowrap", barChange >= 0 ? "text-emerald-600" : "text-red-500")}>
          {barChange >= 0 ? "+" : ""}{barChange.toFixed(2)}%
        </span>
      </div>

      <div ref={containerRef} className="w-full h-[340px]" />
    </div>
  );
}
