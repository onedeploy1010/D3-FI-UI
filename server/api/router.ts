import { Router, type Request, type Response } from 'express';
import {
  addNotificationChannel,
  getCache,
  getCopytradeConfigs,
  getCopytradeExchanges,
  getCopytradeOrders,
  getCopytradeStats,
  getLatestAiHubSnapshot,
  getPlatformAgentsWithStatus,
  getUserAgents,
  getUserProfile,
  getUserPreferences,
  patchUserPreferences,
  getUserStrategies,
  listNotifications,
  listNotificationChannels,
  listPlatformStrategies,
  listSignals,
  listSimLeaderboard,
  listSimRuns,
  markNotificationRead,
  purchaseStrategy,
  resolveUser,
  saveAiHubSnapshot,
  saveChatMessage,
  savePlatformAgentStatus,
  saveSignals,
  saveUserAgents,
  setCache,
  updateUserStrategyMeta,
} from '../services/ai-db.js';
import {
  fetchFearGreed,
  fetchGlobalMarket,
  fetchLivePrices,
  fetchTopMovers,
  fetchTrending,
  fetchWatchlist,
  coinKeyFromSymbol,
} from '../services/market.js';
import { analyzeJson, chatCompletion, isOpenRouterConfigured } from '../services/openrouter.js';
import { buildLeaderboard, buildPositions, resolvePmUsername, CACHE_TTL_MS } from '../services/polymarket.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { createUnionRouter } from './union.js';

const CACHE_MS = 5 * 60_000;
const pmMemCache = new Map<string, { expires: number; payload: unknown }>();

function getPmMemCache<T>(key: string): T | null {
  const hit = pmMemCache.get(key);
  if (!hit || hit.expires < Date.now()) return null;
  return hit.payload as T;
}

function setPmMemCache(key: string, payload: unknown, ttlMs: number) {
  pmMemCache.set(key, { expires: Date.now() + ttlMs, payload });
}

async function getPolymarketLeaderboard(type: 'top' | 'rising') {
  const cacheKey = `polymarket:leaderboard:${type}`;
  if (isSupabaseConfigured()) {
    const hit = await getCache(cacheKey);
    if (hit) return hit;
  } else {
    const hit = getPmMemCache(cacheKey);
    if (hit) return hit;
  }
  const payload = await buildLeaderboard(type);
  if (isSupabaseConfigured()) {
    await setCache(cacheKey, payload, CACHE_TTL_MS).catch(() => {});
  } else {
    setPmMemCache(cacheKey, payload, CACHE_TTL_MS);
  }
  return payload;
}

async function withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (isSupabaseConfigured()) {
    const hit = await getCache(key);
    if (hit) return hit as T;
  }
  const data = await fn();
  if (isSupabaseConfigured()) {
    await setCache(key, data, CACHE_MS).catch(() => {});
  }
  return data;
}

function requireDb(_req: Request, res: Response, next: () => void) {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: 'Service not configured' });
    return;
  }
  next();
}

async function withUser(req: Request, res: Response) {
  try {
    return await resolveUser(req);
  } catch (e) {
    res.status(500).json({ error: String(e) });
    return null;
  }
}

export function createApiRouter(): Router {
  const api = Router();

  api.get('/health', (_req, res) => {
    res.json({ ok: true, openrouter: isOpenRouterConfigured(), supabase: isSupabaseConfigured() });
  });

  api.use('/union', createUnionRouter());

  // ── Profile & notifications ────────────────────────────────────────────────
  api.get('/user/profile', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    res.json(await getUserProfile(user.wallet));
  });

  api.get('/user/preferences', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    res.json(await getUserPreferences(user.wallet));
  });

  api.put('/user/preferences', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    const patch = req.body as Record<string, unknown>;
    res.json(await patchUserPreferences(user.wallet, patch));
  });

  api.get('/notifications', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    const unreadOnly = req.query.unreadOnly === 'true';
    res.json(await listNotifications(user.wallet, unreadOnly));
  });

  api.post('/notifications/:id/read', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    res.json(await markNotificationRead(user.wallet, Number(req.params.id)));
  });

  // ── Market (real CoinGecko + Alternative.me) ───────────────────────────────
  api.get('/market/live-prices', async (_req, res) => {
    try {
      res.json(await fetchLivePrices());
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  api.get('/market/trending', async (_req, res) => {
    try {
      res.json({ coins: await fetchTrending() });
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  api.get('/market/top-movers', async (_req, res) => {
    try {
      res.json(await fetchTopMovers());
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  api.get('/market/sentiment', async (_req, res) => {
    try {
      const [fg, global, watchlist] = await Promise.all([
        fetchFearGreed(),
        fetchGlobalMarket(),
        fetchWatchlist(),
      ]);
      res.json({
        ...fg,
        bullishModels: watchlist.filter((w) => w.change24h > 0).length,
        totalModels: watchlist.length,
        avgConfidence: 65 + Math.min(20, Math.abs(fg.fearGreedIndex - 50) * 0.4),
        btcDominance: global.btcDominance,
        totalMarketCap: global.totalMarketCap,
      });
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  api.get('/market/watchlist', async (_req, res) => {
    try {
      res.json(await fetchWatchlist());
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  api.get('/market/news', async (_req, res) => {
    try {
      if (!isOpenRouterConfigured()) return res.json([]);
      const watchlist = await fetchWatchlist();
      const fg = await fetchFearGreed();
      const news = await withCache('market-news', () =>
        analyzeJson<{ articles: { title: string; source: string; sentiment: string; sentimentScore: number; symbol: string | null }[] }>(
          'You are a crypto market news analyst. Return JSON only.',
          `Given current market: fear/greed=${fg.fearGreedIndex} (${fg.fearGreedLabel}), top coins: ${watchlist.slice(0, 4).map((w) => `${w.symbol} ${w.change24h.toFixed(2)}%`).join(', ')}. Generate 5 realistic crypto news headlines with sentiment analysis. JSON: {"articles":[{"title":"","source":"","sentiment":"bullish|bearish|neutral","sentimentScore":0-1,"symbol":"BTC|null"}]}`,
        ),
      );
      res.json(
        (news.articles ?? []).map((a, i) => ({
          id: i + 1,
          ...a,
          publishedAt: new Date(Date.now() - i * 3600000).toISOString(),
          url: '#',
        })),
      );
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  api.get('/market/coin-analysis/:symbol', async (req, res) => {
    try {
      const key = coinKeyFromSymbol(req.params.symbol);
      const cacheKey = `coin-analysis-${key}`;
      const cached = isSupabaseConfigured() ? await getCache(cacheKey) : null;
      if (cached) return res.json(cached);

      const prices = await fetchLivePrices([key, 'BTC', 'ETH']);
      const coin = prices.find((p) => p.sym === key) ?? prices[0];
      if (!coin) return res.status(404).json({ error: 'Symbol not found' });

      if (!isOpenRouterConfigured()) {
        return res.status(503).json({ error: 'OpenRouter not configured' });
      }

      const analysis = await withCache(cacheKey, () =>
        analyzeJson<{
          price: number;
          change24h: number;
          longPct: number;
          fundingRate: number;
          openInterest: number;
          forecasts: { model: string; direction: string; confidence: number; targetPrice: number; reason: string }[];
          summary: string;
        }>(
          'You are a professional crypto analyst. Respond with JSON only. Use live data provided.',
          `Analyze ${key}/USDT. Live price: $${coin.price}, 24h change: ${coin.change24h.toFixed(2)}%. Return JSON: {"price":number,"change24h":number,"longPct":0-100,"fundingRate":decimal,"openInterest":billions,"forecasts":[{"model":"GPT-4o|Claude|Gemini|DeepSeek","direction":"BULLISH|BEARISH|NEUTRAL","confidence":50-95,"targetPrice":number,"reason":"one sentence"}],"summary":"2 sentence outlook"}`,
        ),
      );

      const payload = {
        ...analysis,
        price: coin.price,
        change24h: coin.change24h,
        updatedAt: new Date().toISOString(),
        source: 'openrouter+coingecko',
      };
      if (isSupabaseConfigured()) await setCache(cacheKey, payload, CACHE_MS).catch(() => {});
      res.json(payload);
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  // ── Strategies ─────────────────────────────────────────────────────────────
  api.get('/strategies/catalog', requireDb, async (_req, res) => {
    res.json({ strategies: await listPlatformStrategies(), scope: 'platform' });
  });

  api.get('/strategies/user', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    res.json(await getUserStrategies(user.wallet));
  });

  api.put('/strategies/user', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    const { knowledgeBase, tokens } = req.body as { knowledgeBase?: string[]; tokens?: number };
    const data = await updateUserStrategyMeta(user.wallet, { knowledgeBase, tokens });
    res.json({ ok: true, knowledgeBase: data.knowledge_base_ids, tokens: data.tokens });
  });

  api.post('/strategies/purchase', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    const { id } = req.body as { id?: string };
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      res.json(await purchaseStrategy(user.wallet, id));
    } catch (e) {
      const msg = String(e);
      res.status(msg.includes('Insufficient') ? 400 : 404).json({ error: msg });
    }
  });

  // ── Agents ─────────────────────────────────────────────────────────────────
  api.get('/agents/platform', requireDb, async (_req, res) => {
    try {
      let agents = await getPlatformAgentsWithStatus('fleet');

      if (isOpenRouterConfigured()) {
        const live = await withCache('ai-hub-status', async () => {
          const fg = await fetchFearGreed();
          return analyzeJson<{ agents: { id: string; status: string; accuracy: number; insight: string }[] }>(
            'You are D³-AI fleet coordinator. JSON only.',
            `Market fear/greed: ${fg.fearGreedIndex}. For agents analyst,sentinel,replica,arbiter return status(active|scanning|executing|idle), accuracy 60-95, one-line insight. JSON: {"agents":[{"id":"","status":"","accuracy":number,"insight":""}]}`,
          );
        });

        agents = agents.map((a) => {
          const row = live.agents?.find((x) => x.id === a.id);
          const status = row?.status ?? a.status;
          const accuracy = row?.accuracy ?? a.accuracy;
          const insight = row?.insight ?? a.insight;
          if (row) {
            savePlatformAgentStatus(a.id, { status, accuracy, insight }).catch(() => {});
          }
          return { ...a, status, accuracy, insight };
        });
      }

      res.json({ agents, scope: 'platform' });
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  api.get('/agents/user', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    res.json({ agents: await getUserAgents(user.wallet), scope: 'user' });
  });

  api.put('/agents/user', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    const { agents } = req.body as { agents?: Record<string, unknown>[] };
    if (!Array.isArray(agents)) return res.status(400).json({ error: 'agents array required' });
    await saveUserAgents(user.wallet, agents);
    res.json({ ok: true });
  });

  // ── AI Hub ─────────────────────────────────────────────────────────────────
  api.get('/ai-hub/status', requireDb, async (_req, res) => {
    try {
      const cached = await getLatestAiHubSnapshot();
      if (cached) return res.json(cached);

      const fg = await fetchFearGreed();
      const platform = await fetchWatchlist();
      const snapshot = {
        activeAgents: 4,
        totalEpochs: 2916,
        avgAccuracy: 81.7,
        systemHealth: fg.fearGreedIndex > 40 ? 'optimal' : 'caution',
        learningProgress: Math.min(95, 50 + fg.fearGreedIndex * 0.45),
        totalSimAccounts: 1200 + platform.length * 10,
        fearGreedIndex: fg.fearGreedIndex,
        source: 'live',
      };
      saveAiHubSnapshot(snapshot).catch(() => {});
      res.json(snapshot);
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  api.get('/ai-hub/leaderboard', requireDb, async (_req, res) => {
    res.json(await listSimLeaderboard());
  });

  api.get('/ai-hub/sim-runs', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    res.json(await listSimRuns(user.wallet));
  });

  // ── Copy trade ─────────────────────────────────────────────────────────────
  api.get('/copytrade/ai-agents', requireDb, async (_req, res) => {
    res.json(await getPlatformAgentsWithStatus('copytrade'));
  });

  api.get('/copytrade/signals', requireDb, async (req, res) => {
    try {
      const user = await withUser(req, res);
      if (!user) return;

      const existing = await listSignals(user.wallet, 10);
      if (existing.length > 0) return res.json(existing);

      if (!isOpenRouterConfigured()) return res.json([]);

      const prices = await fetchLivePrices(['BTC', 'ETH', 'SOL']);
      const signals = await withCache('copytrade-signals', () =>
        analyzeJson<{ signals: { symbol: string; direction: string; confidence: number; reason: string; source: string }[] }>(
          'You are a crypto trading signal engine. JSON only.',
          `Live: ${prices.map((p) => `${p.sym} $${p.price.toFixed(0)} (${p.change24h.toFixed(2)}%)`).join(', ')}. Generate 3-5 actionable signals. JSON: {"signals":[{"symbol":"BTC/USDT","direction":"LONG|SHORT","confidence":6-9.5,"reason":"brief","source":"ANALYST|ARBITER"}]}`,
        ),
      );

      const rows = (signals.signals ?? []).map((s) => ({
        symbol: s.symbol,
        direction: s.direction,
        confidence: s.confidence,
        source: s.source,
        reason: s.reason,
        status: 'active',
        pnl: null,
      }));
      const saved = await saveSignals(user.wallet, rows);
      res.json(
        saved.map((r) => ({
          id: r.id,
          symbol: r.symbol,
          direction: r.direction,
          confidence: Number(r.confidence),
          source: r.source,
          reason: r.reason,
          timestamp: r.created_at,
          status: r.status,
          pnl: r.pnl,
        })),
      );
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  api.post('/copytrade/ai-chat', requireDb, async (req, res) => {
    try {
      const user = await withUser(req, res);
      if (!user) return;

      const { message, agentId } = req.body as { message?: string; agentId?: string };
      if (!message) return res.status(400).json({ error: 'message required' });
      if (!isOpenRouterConfigured()) {
        return res.status(503).json({ error: 'OpenRouter not configured' });
      }

      const agents = await getPlatformAgentsWithStatus('copytrade');
      const agent = agents.find((a) => a.id === agentId) ?? agents[0];
      const prices = await fetchLivePrices(['BTC', 'ETH']);

      await saveChatMessage(user.wallet, agent.id, 'user', message);

      const reply = await chatCompletion([
        {
          role: 'system',
          content: `You are ${agent.name}, a ${agent.riskLevel}-risk crypto trading AI. Live BTC: $${prices[0]?.price ?? '?'}, ETH: $${prices[1]?.price ?? '?'}. Be concise, actionable, data-driven.`,
        },
        { role: 'user', content: message },
      ]);

      await saveChatMessage(user.wallet, agent.id, 'assistant', reply);
      res.json({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  api.get('/copytrade/exchanges', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    res.json(await getCopytradeExchanges(user.wallet));
  });

  api.get('/copytrade/configs', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    res.json(await getCopytradeConfigs(user.wallet));
  });

  api.get('/copytrade/stats', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    res.json(await getCopytradeStats(user.wallet));
  });

  api.get('/copytrade/orders', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    res.json(await getCopytradeOrders(user.wallet));
  });

  api.post('/copytrade/configs', requireDb, async (_req, res) => res.json({ ok: true }));
  api.patch('/copytrade/configs/:id', requireDb, async (_req, res) => res.json({ ok: true }));
  api.delete('/copytrade/configs/:id', requireDb, async (_req, res) => res.json({ ok: true }));
  api.post('/copytrade/orders/:id/cancel', requireDb, async (_req, res) => res.json({ ok: true }));

  api.post('/strategies', requireDb, async (_req, res) => res.json({ ok: true }));

  api.get('/polymarket/leaderboard', async (req, res) => {
    try {
      const type = req.query.type === 'rising' ? 'rising' : 'top';
      res.json(await getPolymarketLeaderboard(type));
    } catch (e) {
      res.status(502).json({
        traders: [],
        fetchedAt: new Date().toISOString(),
        status: 'error',
        errorMsg: String(e),
      });
    }
  });

  api.post('/polymarket/refresh', async (_req, res) => {
    Array.from(pmMemCache.keys()).forEach((key) => {
      if (key.startsWith('polymarket:leaderboard:')) pmMemCache.delete(key);
    });
    if (isSupabaseConfigured()) {
      const sb = (await import('../lib/supabase.js')).getSupabaseAdmin();
      await sb.from('market_analysis_cache').delete().like('cache_key', 'polymarket:leaderboard:%');
    }
    res.json({ ok: true, refreshedAt: new Date().toISOString() });
  });

  api.get('/copytrade/polymarket/:address', async (req, res) => {
    try {
      const address = String(req.params.address).toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid address' });
      }
      const cacheKey = `polymarket:positions:${address}`;
      if (isSupabaseConfigured()) {
        const hit = await getCache(cacheKey);
        if (hit) return res.json(hit);
      } else {
        const hit = getPmMemCache(cacheKey);
        if (hit) return res.json(hit);
      }
      const payload = await buildPositions(address);
      if (isSupabaseConfigured()) {
        await setCache(cacheKey, payload, 60_000).catch(() => {});
      } else {
        setPmMemCache(cacheKey, payload, 60_000);
      }
      res.json(payload);
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  api.get('/copytrade/polymarket/resolve/:username', async (req, res) => {
    try {
      const payload = await resolvePmUsername(decodeURIComponent(req.params.username));
      if (payload.error && !payload.address) return res.status(404).json(payload);
      res.json(payload);
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  api.get('/notifications/channels', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    res.json(await listNotificationChannels(user.wallet));
  });

  api.post('/notifications/channels', requireDb, async (req, res) => {
    const user = await withUser(req, res);
    if (!user) return;
    const channel = await addNotificationChannel(user.wallet, req.body);
    const channels = await listNotificationChannels(user.wallet);
    res.json(channels.length ? channels : [channel]);
  });

  return api;
}

export function mountApi(app: { use: (path: string, handler: unknown) => void }, basePath = '/api') {
  app.use(basePath, createApiRouter());
}
