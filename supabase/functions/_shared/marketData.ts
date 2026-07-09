const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  AVAX: 'avalanche-2',
  ARB: 'arbitrum',
  XRP: 'ripple',
  DOGE: 'dogecoin',
};

export type LivePrice = { sym: string; price: number; change24h: number };

export async function fetchLivePrices(symbols = ['BTC', 'ETH', 'BNB', 'AVAX', 'ARB']): Promise<LivePrice[]> {
  const ids = symbols.map((s) => COIN_IDS[s]).filter(Boolean).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = (await res.json()) as Record<string, { usd: number; usd_24h_change?: number }>;

  return symbols
    .map((sym) => {
      const id = COIN_IDS[sym];
      const row = id ? data[id] : undefined;
      if (!row?.usd) return null;
      return { sym, price: row.usd, change24h: row.usd_24h_change ?? 0 };
    })
    .filter((x): x is LivePrice => x !== null);
}

export async function fetchFearGreed() {
  const res = await fetch('https://api.alternative.me/fng/?limit=1');
  if (!res.ok) throw new Error(`FearGreed ${res.status}`);
  const data = (await res.json()) as { data?: { value: string; value_classification: string }[] };
  const row = data.data?.[0];
  return {
    fearGreedIndex: row ? parseInt(row.value, 10) : 50,
    fearGreedLabel: row?.value_classification ?? 'Neutral',
  };
}

export async function fetchTrending() {
  const res = await fetch('https://api.coingecko.com/api/v3/search/trending');
  if (!res.ok) throw new Error(`CoinGecko trending ${res.status}`);
  const data = (await res.json()) as {
    coins?: {
      item: {
        id: string;
        symbol: string;
        name: string;
        thumb: string;
        market_cap_rank: number | null;
        data?: { price_change_percentage_24h?: { usd?: number } };
      };
    }[];
  };
  return (data.coins ?? []).slice(0, 10).map((c) => ({
    id: c.item.id,
    symbol: c.item.symbol.toUpperCase(),
    name: c.item.name,
    thumb: c.item.thumb,
    marketCapRank: c.item.market_cap_rank,
    change24h: c.item.data?.price_change_percentage_24h?.usd ?? null,
  }));
}

export async function fetchTopMovers() {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h',
  );
  if (!res.ok) throw new Error(`CoinGecko markets ${res.status}`);
  const rows = (await res.json()) as {
    id: string;
    symbol: string;
    name: string;
    image: string;
    current_price: number;
    price_change_percentage_24h: number;
    total_volume: number;
    market_cap: number;
  }[];
  const sorted = [...rows].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
  const map = (r: (typeof rows)[0]) => ({
    id: r.id,
    symbol: r.symbol.toUpperCase(),
    name: r.name,
    image: r.image,
    price: r.current_price,
    change24h: r.price_change_percentage_24h,
    volume: r.total_volume,
    marketCap: r.market_cap,
  });
  return {
    gainers: sorted.slice(0, 8).map(map),
    losers: sorted.slice(-8).reverse().map(map),
  };
}

export async function fetchWatchlist() {
  const ids = Object.values(COIN_IDS).join(',');
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`,
  );
  if (!res.ok) throw new Error(`CoinGecko watchlist ${res.status}`);
  const rows = (await res.json()) as {
    symbol: string;
    current_price: number;
    price_change_percentage_24h: number;
    total_volume: number;
    market_cap: number;
  }[];
  return rows.map((r) => ({
    symbol: `${r.symbol.toUpperCase()}/USDT`,
    price: r.current_price,
    change24h: r.price_change_percentage_24h,
    changePercent24h: r.price_change_percentage_24h,
    volume: r.total_volume,
    volume24h: r.total_volume,
    marketCap: r.market_cap,
  }));
}

export async function fetchGlobalMarket() {
  const res = await fetch('https://api.coingecko.com/api/v3/global');
  if (!res.ok) throw new Error(`CoinGecko global ${res.status}`);
  const data = (await res.json()) as {
    data?: {
      total_market_cap?: { usd?: number };
      market_cap_percentage?: { btc?: number };
      total_volume?: { usd?: number };
      market_cap_change_percentage_24h_usd?: number;
    };
  };
  return {
    totalMarketCap: data.data?.total_market_cap?.usd ?? 0,
    btcDominance: data.data?.market_cap_percentage?.btc ?? 0,
    totalVolume24h: data.data?.total_volume?.usd ?? 0,
    marketCapChange24h: data.data?.market_cap_change_percentage_24h_usd ?? 0,
  };
}

export function coinKeyFromSymbol(symbol: string): string {
  return symbol.split('/')[0]?.toUpperCase() ?? symbol.toUpperCase();
}
