import { corsHeaders, jsonResponse, optionsResponse } from '../_shared/cors.ts';
import {
  coinKeyFromSymbol,
  fetchFearGreed,
  fetchGlobalMarket,
  fetchLivePrices,
  fetchTopMovers,
  fetchTrending,
  fetchWatchlist,
} from '../_shared/marketData.ts';

function routePath(req: Request): string {
  const url = new URL(req.url);
  let p = url.pathname;
  const idx = p.indexOf('/market');
  if (idx >= 0) p = p.slice(idx + '/market'.length) || '/';
  if (p.startsWith('/market')) p = p.slice('/market'.length) || '/';
  return p || '/';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const path = routePath(req);
  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    if (path === '/health') {
      return jsonResponse({ ok: true, source: 'coingecko+alternative.me' });
    }

    if (path === '/live-prices') {
      return jsonResponse(await fetchLivePrices());
    }

    if (path === '/trending') {
      return jsonResponse({ coins: await fetchTrending() });
    }

    if (path === '/top-movers') {
      return jsonResponse(await fetchTopMovers());
    }

    if (path === '/watchlist') {
      return jsonResponse(await fetchWatchlist());
    }

    if (path === '/sentiment') {
      const [fg, global, watchlist] = await Promise.all([
        fetchFearGreed(),
        fetchGlobalMarket(),
        fetchWatchlist(),
      ]);
      return jsonResponse({
        ...fg,
        bullishModels: watchlist.filter((w) => w.change24h > 0).length,
        totalModels: watchlist.length,
        avgConfidence: 65 + Math.min(20, Math.abs(fg.fearGreedIndex - 50) * 0.4),
        btcDominance: global.btcDominance,
        totalMarketCap: global.totalMarketCap,
        totalVolume24h: global.totalVolume24h,
        marketCapChange24h: global.marketCapChange24h,
      });
    }

    const coinAnalysis = path.match(/^\/coin-analysis\/([A-Za-z0-9]+)$/);
    if (coinAnalysis) {
      const key = coinKeyFromSymbol(coinAnalysis[1]);
      const prices = await fetchLivePrices([key, 'BTC', 'ETH']);
      const coin = prices.find((p) => p.sym === key) ?? prices[0];
      if (!coin) return jsonResponse({ error: 'Symbol not found' }, 404);
      return jsonResponse({
        price: coin.price,
        change24h: coin.change24h,
        longPct: 50,
        fundingRate: 0.0001,
        openInterest: 1.2,
        forecasts: [],
        summary: 'Live price from CoinGecko. Configure OpenRouter for AI forecasts.',
        updatedAt: new Date().toISOString(),
        source: 'coingecko',
      });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[market]', msg);
    return jsonResponse({ error: msg }, 502);
  }
});
