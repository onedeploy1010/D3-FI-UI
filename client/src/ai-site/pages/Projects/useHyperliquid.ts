import { useQuery } from "@tanstack/react-query";

export const HL_TRACKED_VAULTS = [
  "0xc179e03922afe8fa9533d3f896338b9fb87ce0c8",
  "0xd6e56265890b76413d1d527eb9b75e334c0c5b42",
] as const;

const HL_INFO_URL = "https://api.hyperliquid.xyz/info";

export interface HLHistoryPoint {
  ts: number;
  value: number;
}

export interface HLVault {
  name: string;
  leader: string;
  description: string;
  apr: number;
  followers: number;
  leaderFraction: number;
  leaderCommission: number;
  isClosed: boolean;
  allowDeposits: boolean;
  latestEquity: number;
  dayPnl: number;
  weekPnl: number;
  monthPnl: number;
  allTimePnl: number;
  equityHistory: HLHistoryPoint[];
  pnlHistory: HLHistoryPoint[];
}

export interface HLCandle {
  ts: number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

type PortfolioSeries = Array<[number, string]>;
interface PortfolioBucket {
  accountValueHistory?: PortfolioSeries;
  pnlHistory?: PortfolioSeries;
}
type PortfolioEntry = [string, PortfolioBucket];

function seriesToPoints(series?: PortfolioSeries): HLHistoryPoint[] {
  if (!series) return [];
  return series.map(([ts, v]) => ({ ts, value: Number(v) }));
}

function lastValue(series?: PortfolioSeries): number {
  if (!series || series.length === 0) return 0;
  return Number(series[series.length - 1][1]);
}

function findBucket(portfolio: PortfolioEntry[] | undefined, key: string): PortfolioBucket {
  const entry = (portfolio ?? []).find(([k]) => k === key);
  return entry?.[1] ?? {};
}

async function fetchVault(vaultAddress: string): Promise<HLVault> {
  const res = await fetch(HL_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "vaultDetails", vaultAddress }),
  });
  if (!res.ok) throw new Error(`Hyperliquid API error: ${res.status}`);
  const data = await res.json();
  if (!data) throw new Error("Empty vault response");

  const portfolio: PortfolioEntry[] = data.portfolio ?? [];
  const day = findBucket(portfolio, "day");
  const week = findBucket(portfolio, "week");
  const month = findBucket(portfolio, "month");
  const allTime = findBucket(portfolio, "allTime");

  const equityHistory = seriesToPoints(allTime.accountValueHistory);
  const pnlHistory = seriesToPoints(allTime.pnlHistory);

  // `followers` is the array of depositors (it includes a synthetic "Leader" entry);
  // `followerState` is the *viewer's own* follow-state object — reading it as the count
  // gave Number({}) === NaN → 0, so the page always showed 0 followers.
  const followerList: Array<{ user?: string }> = Array.isArray(data.followers) ? data.followers : [];
  const followerCount = followerList.filter((f) => f.user !== "Leader").length;

  return {
    name: data.name ?? "",
    leader: data.leader ?? "",
    description: data.description ?? "",
    apr: Number(data.apr ?? 0),
    followers: followerCount,
    leaderFraction: Number(data.leaderFraction ?? 0),
    leaderCommission: Number(data.leaderCommission ?? 0),
    isClosed: Boolean(data.isClosed),
    allowDeposits: Boolean(data.allowDeposits ?? true),
    latestEquity: equityHistory.length ? equityHistory[equityHistory.length - 1].value : 0,
    dayPnl: lastValue(day.pnlHistory),
    weekPnl: lastValue(week.pnlHistory),
    monthPnl: lastValue(month.pnlHistory),
    allTimePnl: lastValue(allTime.pnlHistory),
    equityHistory,
    pnlHistory,
  };
}

export function useHLVault(vaultAddress: string) {
  return useQuery<HLVault>({
    queryKey: ["hl-vault", vaultAddress],
    queryFn: () => fetchVault(vaultAddress),
    staleTime: 120_000,
    refetchInterval: 120_000,
    retry: 1,
  });
}

const INTERVAL_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

async function fetchCandles(interval: string): Promise<{ candles: HLCandle[] }> {
  const step = INTERVAL_MS[interval] ?? INTERVAL_MS["1d"];
  const endTime = Date.now();
  const startTime = endTime - step * 120;
  const res = await fetch(HL_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin: "HYPE", interval, startTime, endTime },
    }),
  });
  if (!res.ok) throw new Error(`Hyperliquid API error: ${res.status}`);
  const raw = await res.json();
  const candles: HLCandle[] = Array.isArray(raw)
    ? raw.map((c: Record<string, unknown>) => ({
        ts: Number(c.t),
        open: Number(c.o),
        close: Number(c.c),
        high: Number(c.h),
        low: Number(c.l),
        volume: Number(c.v),
      }))
    : [];
  return { candles };
}

export function useHLCandles(interval: string) {
  return useQuery<{ candles: HLCandle[] }>({
    queryKey: ["hl-candles", interval],
    queryFn: () => fetchCandles(interval),
    staleTime: 120_000,
    refetchInterval: 120_000,
    retry: 1,
  });
}
