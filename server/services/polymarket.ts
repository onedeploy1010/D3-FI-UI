/**
 * Polymarket Data API — Node server (dev /api fallback).
 * Live fetches mirror supabase/functions/_shared/polymarketData.ts
 */

const DATA_API = 'https://data-api.polymarket.com';
export const CACHE_TTL_MS = 5 * 60_000;

export type LeaderboardType = 'top' | 'rising';

type PmLeaderboardRow = {
  rank: string;
  proxyWallet: string;
  userName: string;
  verifiedBadge?: boolean;
  vol: number;
  pnl: number;
  profileImage?: string;
};

type PmPositionRow = {
  title: string;
  outcome: string;
  slug?: string;
  icon?: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  endDate?: string;
  redeemable?: boolean;
};

export type TraderView = {
  rank: number | null;
  address: string;
  name: string;
  profileImage?: string | null;
  badges: string[];
  tags: string[];
  followScore: number;
  edge: number;
  copyability: number;
  confidence: number;
  lagTolerance: number;
  openPnl: number;
  openPnlPct: number;
  currentValue: number;
  activePositions: number;
  profitFactor: number;
  drawdown: number;
  activity: number;
  activitySample: string;
  marketFit: number;
  concentration: number;
  type: string;
  aiAnalysis?: string;
  topPositions?: Array<{
    market: string;
    outcome: string;
    pricePerShare: number;
    cashPnl: number;
    currentValue: number;
    slug: string;
  }>;
  polymarketUrl?: string;
};

export type LeaderboardPayload = {
  traders: TraderView[];
  fetchedAt: string;
  status: 'ok' | 'error' | 'partial';
  errorMsg?: string;
};

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededInt(seed: number, min: number, max: number): number {
  const n = (seed % 10_000) / 10_000;
  return Math.round(min + n * (max - min));
}

async function pmGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Polymarket ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchPmLeaderboard(type: LeaderboardType, limit = 25): Promise<PmLeaderboardRow[]> {
  const u = new URL(`${DATA_API}/v1/leaderboard`);
  u.searchParams.set('category', 'OVERALL');
  u.searchParams.set('orderBy', 'PNL');
  u.searchParams.set('limit', String(Math.min(50, limit)));
  u.searchParams.set('timePeriod', type === 'rising' ? 'WEEK' : 'ALL');
  return pmGet<PmLeaderboardRow[]>(u.toString());
}

async function fetchPmPositions(
  address: string,
  limit = 20,
  openOnly = false,
): Promise<PmPositionRow[]> {
  const u = new URL(`${DATA_API}/positions`);
  u.searchParams.set('user', address);
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('sortBy', 'CURRENT');
  u.searchParams.set('sizeThreshold', '0');
  if (openOnly) u.searchParams.set('redeemable', 'false');
  return pmGet<PmPositionRow[]>(u.toString());
}

function isOpenPosition(row: PmPositionRow): boolean {
  return Number(row.currentValue) > 0 && Number(row.curPrice) > 0;
}

function pickDisplayPositions(rows: PmPositionRow[], max = 4): PmPositionRow[] {
  const open = rows.filter(isOpenPosition);
  if (open.length) return open.slice(0, max);
  const closed = rows.filter((r) => Number(r.size) > 0 && r.title);
  closed.sort((a, b) => Number(b.initialValue ?? 0) - Number(a.initialValue ?? 0));
  return closed.slice(0, max);
}

function mapTraderPosition(row: PmPositionRow) {
  return {
    market: row.title,
    outcome: row.outcome ?? 'Yes',
    pricePerShare: Number(row.curPrice ?? 0),
    cashPnl: Number(row.cashPnl ?? 0),
    currentValue: Number(row.currentValue ?? 0),
    slug: row.slug ?? '',
  };
}

async function enrichTraderPositions(trader: TraderView): Promise<void> {
  try {
    let rows = await fetchPmPositions(trader.address, 15, true);
    if (rows.length === 0) rows = await fetchPmPositions(trader.address, 15, false);
    const display = pickDisplayPositions(rows, 4);
    trader.topPositions = display.map(mapTraderPosition);
    trader.activePositions = rows.filter(isOpenPosition).length;
    const portfolio = rows.reduce((s, r) => s + Number(r.currentValue ?? 0), 0);
    if (portfolio > 0) trader.currentValue = Math.round(portfolio);
  } catch {
    trader.topPositions = [];
    trader.activePositions = 0;
  }
}

function mapTrader(row: PmLeaderboardRow, index: number, type: LeaderboardType): TraderView {
  const address = row.proxyWallet;
  const seed = hashSeed(address.toLowerCase());
  const rank = Number.parseInt(row.rank, 10) || index + 1;
  const pnl = Number(row.pnl ?? 0);
  const vol = Math.max(Number(row.vol ?? 0), 1);
  const name = row.userName?.trim() || `${address.slice(0, 6)}…${address.slice(-4)}`;
  const pnlScore = Math.log10(Math.max(Math.abs(pnl), 10));
  const volScore = Math.log10(Math.max(vol, 100));

  const edge = Math.min(99, Math.round(42 + pnlScore * 11 + (row.verifiedBadge ? 4 : 0)));
  const followScore = Math.min(99, Math.round(55 + pnlScore * 9 + Math.min(12, volScore * 2)));
  const copyability = Math.min(95, Math.round(38 + volScore * 14));
  const confidence = Math.min(98, Math.round(50 + edge * 0.35));
  const lagTolerance = seededInt(seed, 18, 72);
  const drawdown = Math.min(42, Math.round(type === 'rising' ? 10 + volScore * 2 : 14 + volScore * 3));
  const profitFactor = Math.round((1.2 + pnlScore * 0.35) * 10) / 10;
  const openPnlPct = vol > 0 ? Math.round((pnl / vol) * 1000) / 10 : 0;

  const badges: string[] = [];
  if (row.verifiedBadge) badges.push('Qualified');
  if (rank <= 3) badges.push('Proven');
  else if (type === 'rising' || rank <= 15) badges.push('Rising');

  const tags = ['Polymarket'];
  if (vol > 5_000_000) tags.push('High Volume');
  if (pnl > 1_000_000) tags.push('Whale PnL');
  if (type === 'rising') tags.push('Momentum');

  return {
    rank,
    address,
    name,
    profileImage: row.profileImage || null,
    badges,
    tags: tags.slice(0, 3),
    followScore,
    edge,
    copyability,
    confidence,
    lagTolerance,
    openPnl: Math.round(pnl),
    openPnlPct,
    currentValue: Math.round(vol * 0.15),
    activePositions: 0,
    profitFactor,
    drawdown,
    activity: Math.round(vol / 1000),
    activitySample: type === 'rising' ? '7d window' : 'all-time',
    marketFit: Math.min(99, Math.round(50 + copyability * 0.4)),
    concentration: seededInt(seed >> 1, 12, 48),
    type: type === 'rising' ? 'rising' : 'top',
    aiAnalysis: `Rank #${rank} on Polymarket ${type === 'rising' ? 'weekly' : 'all-time'} PnL leaderboard.`,
    polymarketUrl: row.userName
      ? `https://polymarket.com/@${row.userName}`
      : `https://polymarket.com/profile/${address}`,
  };
}

async function enrichTopPositions(traders: TraderView[]): Promise<void> {
  const slice = traders.slice(0, 25);
  const batchSize = 5;
  for (let i = 0; i < slice.length; i += batchSize) {
    await Promise.all(slice.slice(i, i + batchSize).map((t) => enrichTraderPositions(t)));
  }
}

export async function buildLeaderboard(type: LeaderboardType): Promise<LeaderboardPayload> {
  const rows = await fetchPmLeaderboard(type);
  const traders = rows.map((row, i) => mapTrader(row, i, type));
  await enrichTopPositions(traders);
  return {
    traders,
    fetchedAt: new Date().toISOString(),
    status: traders.length ? 'ok' : 'partial',
  };
}

export async function buildPositions(address: string) {
  let rows = await fetchPmPositions(address, 25, true);
  if (rows.length === 0) rows = await fetchPmPositions(address, 25, false);
  const positions = rows.map((row, i) => {
    const active = Number(row.currentValue) > 0 && Number(row.curPrice) > 0 && !row.redeemable;
    return {
      id: `${address}-${i}`,
      market: row.title,
      outcome: row.outcome ?? 'Yes',
      side: 'BUY' as const,
      avgPrice: Number(row.avgPrice ?? 0),
      currentPrice: Number(row.curPrice ?? 0),
      shares: Number(row.size ?? 0),
      value: Number(row.currentValue ?? 0),
      cost: Number(row.initialValue ?? 0),
      pnl: Number(row.cashPnl ?? 0),
      pnlPct: Number(row.percentPnl ?? 0),
      status: active ? ('active' as const) : ('closed' as const),
      icon: row.icon,
      slug: row.slug,
      endDate: row.endDate,
    };
  });
  return {
    source: 'live' as const,
    positions,
    address,
    profileUrl: `https://polymarket.com/profile/${address}`,
    count: positions.length,
  };
}

export async function resolvePmUsername(username: string) {
  const clean = username.replace(/^@/, '').trim();
  if (!clean) return { address: '', username: clean, profileUrl: '', error: 'Username required' };
  const u = new URL(`${DATA_API}/v1/leaderboard`);
  u.searchParams.set('userName', clean);
  u.searchParams.set('limit', '1');
  const rows = await pmGet<PmLeaderboardRow[]>(u.toString());
  const hit = rows[0];
  if (!hit?.proxyWallet) {
    return { address: '', username: clean, profileUrl: '', error: 'User not found' };
  }
  return {
    address: hit.proxyWallet,
    username: hit.userName || clean,
    profileUrl: `https://polymarket.com/@${hit.userName || clean}`,
  };
}
