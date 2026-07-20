// D3-AI analytics backend — Supabase Edge Function.
// Replaces the dev-only Express `server/api/router.ts`: profile, notifications,
// strategies, agents, AI-Hub, copy-trade (configs/orders/exchanges/signals/chat),
// trader lookup, and OpenRouter-powered market news + coin analysis.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { analyzeJson, chatCompletion, isOpenRouterConfigured } from '../_shared/openrouter.ts';
import {
  addNotificationChannel,
  cancelCopytradeOrder,
  createCopytradeConfig,
  deleteCopytradeConfig,
  deleteCopytradeExchange,
  deleteNotificationChannel,
  getCache,
  getCopytradeConfigs,
  getCopytradeExchanges,
  getCopytradeOrders,
  getCopytradeStats,
  getLatestAiHubSnapshot,
  getPlatformAgentsWithStatus,
  getUserAgents,
  getUserPreferences,
  getUserProfile,
  getUserStrategies,
  isSupabaseConfigured,
  listNotificationChannels,
  listNotifications,
  listPlatformStrategies,
  listSignals,
  listSimLeaderboard,
  listSimRuns,
  markNotificationRead,
  patchUserPreferences,
  purchaseStrategy,
  resolveUser,
  saveAiHubSnapshot,
  saveChatMessage,
  savePlatformAgentStatus,
  saveSignals,
  saveUserAgents,
  setCache,
  updateCopytradeConfig,
  updateCopytradeExchange,
  updateNotificationChannel,
  updateUserStrategyMeta,
  walletFromRequest,
} from '../_shared/aiData.ts';
import {
  coinKeyFromSymbol,
  fetchFearGreed,
  fetchLivePrices,
  fetchWatchlist,
  generateCoinAnalysisExtras,
  generateCoinForecasts,
} from '../_shared/marketData.ts';
import { buildTrader, resolvePmUsername } from '../_shared/polymarketData.ts';

const CACHE_MS = 5 * 60_000;

/** Strip the `/functions/v1/ai` (or `/ai`) prefix, leaving the app route. */
function routePath(req: Request): string {
  const segs = new URL(req.url).pathname.split('/').filter(Boolean);
  const i = segs.indexOf('ai');
  const rest = i >= 0 ? segs.slice(i + 1) : segs;
  return '/' + rest.join('/');
}

async function withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = await getCache(key);
  if (hit) return hit as T;
  const data = await fn();
  await setCache(key, data, CACHE_MS).catch(() => {});
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const path = routePath(req);
  const method = req.method;
  const seg = path.split('/').filter(Boolean); // e.g. ['copytrade','signals']
  const wallet = walletFromRequest(req);

  const body: Record<string, unknown> =
    method === 'POST' || method === 'PUT' || method === 'PATCH'
      ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
      : {};

  try {
    if (path === '/health') {
      return jsonResponse({ ok: true, openrouter: isOpenRouterConfigured(), supabase: isSupabaseConfigured() });
    }

    if (!isSupabaseConfigured()) {
      return jsonResponse({ error: 'Service not configured' }, 503);
    }

    // ── Profile & preferences ──────────────────────────────────────────────
    if (path === '/user/profile' && method === 'GET') {
      await resolveUser(wallet);
      return jsonResponse(await getUserProfile(wallet));
    }
    if (path === '/user/preferences' && method === 'GET') {
      return jsonResponse(await getUserPreferences(wallet));
    }
    if (path === '/user/preferences' && method === 'PUT') {
      return jsonResponse(await patchUserPreferences(wallet, body));
    }

    // ── Notifications ──────────────────────────────────────────────────────
    if (path === '/notifications' && method === 'GET') {
      const unreadOnly = new URL(req.url).searchParams.get('unreadOnly') === 'true';
      return jsonResponse(await listNotifications(wallet, unreadOnly));
    }
    if (seg[0] === 'notifications' && seg[2] === 'read' && method === 'POST') {
      return jsonResponse(await markNotificationRead(wallet, Number(seg[1])));
    }
    if (path === '/notifications/channels' && method === 'GET') {
      return jsonResponse(await listNotificationChannels(wallet));
    }
    if (path === '/notifications/channels' && method === 'POST') {
      await resolveUser(wallet);
      const channel = await addNotificationChannel(wallet, body);
      const channels = await listNotificationChannels(wallet);
      return jsonResponse(channels.length ? channels : [channel]);
    }
    if (seg[0] === 'notifications' && seg[1] === 'channels' && seg[2] && seg[3] === 'test' && method === 'POST') {
      return jsonResponse({ ok: true, id: seg[2], delivered: true });
    }
    if (seg[0] === 'notifications' && seg[1] === 'channels' && seg[2] && method === 'PUT') {
      return jsonResponse(await updateNotificationChannel(wallet, seg[2], body));
    }
    if (seg[0] === 'notifications' && seg[1] === 'channels' && seg[2] && method === 'DELETE') {
      return jsonResponse(await deleteNotificationChannel(wallet, seg[2]));
    }

    // ── Market: OpenRouter-powered news + coin analysis ────────────────────
    if (path === '/market/news' && method === 'GET') {
      if (!isOpenRouterConfigured()) return jsonResponse([]);
      const [watchlist, fg] = await Promise.all([fetchWatchlist(), fetchFearGreed()]);
      const news = await withCache('market-news', () =>
        analyzeJson<{ articles: { title: string; source: string; sentiment: string; sentimentScore: number; symbol: string | null }[] }>(
          'You are a crypto market news analyst. Return JSON only.',
          `Given current market: fear/greed=${fg.fearGreedIndex} (${fg.fearGreedLabel}), top coins: ${watchlist.slice(0, 4).map((w) => `${w.symbol} ${w.change24h.toFixed(2)}%`).join(', ')}. Generate 5 realistic crypto news headlines with sentiment analysis. JSON: {"articles":[{"title":"","source":"","sentiment":"bullish|bearish|neutral","sentimentScore":0-1,"symbol":"BTC|null"}]}`,
        ),
      );
      return jsonResponse(
        (news.articles ?? []).map((a, i) => ({
          id: i + 1,
          ...a,
          publishedAt: new Date(Date.now() - i * 3600000).toISOString(),
          url: '#',
        })),
      );
    }

    if (seg[0] === 'market' && seg[1] === 'coin-analysis' && seg[2] && method === 'GET') {
      const key = coinKeyFromSymbol(seg[2]);
      const cacheKey = `coin-analysis-${key}`;
      const cached = await getCache(cacheKey);
      if (cached) return jsonResponse(cached);

      const prices = await fetchLivePrices([key, 'BTC', 'ETH']);
      const coin = prices.find((p) => p.sym === key) ?? prices[0];
      if (!coin) return jsonResponse({ error: 'Symbol not found' }, 404);

      // Real AI when configured; otherwise deterministic generated forecasts.
      if (isOpenRouterConfigured()) {
        const analysis = await analyzeJson<{
          longPct: number;
          fundingRate: number;
          openInterest: number;
          forecasts: { model: string; direction: string; confidence: number; targetPrice: number; reason: string }[];
          summary: string;
        }>(
          'You are a professional crypto analyst. Respond with JSON only. Use live data provided.',
          `Analyze ${key}/USDT. Live price: $${coin.price}, 24h change: ${coin.change24h.toFixed(2)}%. Return JSON: {"longPct":0-100,"fundingRate":decimal,"openInterest":billions,"forecasts":[{"model":"GPT-4o|Claude|Gemini|DeepSeek","direction":"BULLISH|BEARISH|NEUTRAL","confidence":50-95,"targetPrice":number,"reason":"one sentence"}],"summary":"2 sentence outlook"}`,
        );
        const payload = {
          ...analysis,
          price: coin.price,
          change24h: coin.change24h,
          updatedAt: new Date().toISOString(),
          source: 'openrouter+coingecko',
        };
        await setCache(cacheKey, payload, CACHE_MS).catch(() => {});
        return jsonResponse(payload);
      }

      const hourBucket = Math.floor(Date.now() / 3_600_000);
      const extras = generateCoinAnalysisExtras(key, hourBucket);
      const payload = {
        price: coin.price,
        change24h: coin.change24h,
        longPct: extras.longPct,
        fundingRate: extras.fundingRate,
        openInterest: extras.openInterest,
        forecasts: generateCoinForecasts(key, coin.price, hourBucket),
        summary: `${key}/USDT outlook anchored to live price $${coin.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}.`,
        updatedAt: new Date().toISOString(),
        source: 'coingecko',
      };
      return jsonResponse(payload);
    }

    // ── Strategies ─────────────────────────────────────────────────────────
    if (path === '/strategies/catalog' && method === 'GET') {
      return jsonResponse({ strategies: await listPlatformStrategies(), scope: 'platform' });
    }
    if (path === '/strategies/user' && method === 'GET') {
      return jsonResponse(await getUserStrategies(wallet));
    }
    if (path === '/strategies/user' && method === 'PUT') {
      await resolveUser(wallet);
      const { knowledgeBase, tokens } = body as { knowledgeBase?: string[]; tokens?: number };
      const data = await updateUserStrategyMeta(wallet, { knowledgeBase, tokens });
      return jsonResponse({ ok: true, knowledgeBase: data.knowledge_base_ids, tokens: data.tokens });
    }
    if (path === '/strategies/purchase' && method === 'POST') {
      await resolveUser(wallet);
      const id = body.id as string | undefined;
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      try {
        return jsonResponse(await purchaseStrategy(wallet, id));
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        return jsonResponse({ error: msg }, msg.includes('Insufficient') ? 400 : 404);
      }
    }
    if (path === '/strategies' && method === 'POST') {
      return jsonResponse({ ok: true });
    }

    // ── Agents ─────────────────────────────────────────────────────────────
    if (path === '/agents/platform' && method === 'GET') {
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
          if (row) {
            savePlatformAgentStatus(a.id as string, { status: row.status, accuracy: row.accuracy, insight: row.insight }).catch(() => {});
            return { ...a, status: row.status, accuracy: row.accuracy, insight: row.insight };
          }
          return a;
        });
      }
      return jsonResponse({ agents, scope: 'platform' });
    }
    if (path === '/agents/user' && method === 'GET') {
      return jsonResponse({ agents: await getUserAgents(wallet), scope: 'user' });
    }
    if (path === '/agents/user' && method === 'PUT') {
      await resolveUser(wallet);
      const agents = body.agents as Record<string, unknown>[] | undefined;
      if (!Array.isArray(agents)) return jsonResponse({ error: 'agents array required' }, 400);
      await saveUserAgents(wallet, agents);
      return jsonResponse({ ok: true });
    }

    // ── AI Hub ─────────────────────────────────────────────────────────────
    if (path === '/ai-hub/status' && method === 'GET') {
      const cached = await getLatestAiHubSnapshot();
      if (cached) return jsonResponse(cached);
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
      return jsonResponse(snapshot);
    }
    if (path === '/ai-hub/leaderboard' && method === 'GET') {
      return jsonResponse(await listSimLeaderboard());
    }
    if (path === '/ai-hub/sim-runs' && method === 'GET') {
      return jsonResponse(await listSimRuns(wallet));
    }

    // ── Copy trade ─────────────────────────────────────────────────────────
    if (path === '/copytrade/ai-agents' && method === 'GET') {
      return jsonResponse(await getPlatformAgentsWithStatus('copytrade'));
    }
    if (path === '/copytrade/signals' && method === 'GET') {
      let list: Array<Record<string, unknown>> = [];
      const existing = await listSignals(wallet, 10);
      if (existing.length > 0) {
        list = existing as Array<Record<string, unknown>>;
      } else if (!isOpenRouterConfigured()) {
        return jsonResponse([]);
      } else {
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
        await resolveUser(wallet);
        const saved = await saveSignals(wallet, rows);
        list = saved.map((r) => ({
          id: r.id,
          symbol: r.symbol,
          direction: r.direction,
          confidence: Number(r.confidence),
          source: r.source,
          reason: r.reason,
          timestamp: r.created_at,
          status: r.status,
          pnl: r.pnl,
        }));
      }

      // Enrich with a live entry price + derived target/stop so the signal feed
      // shows real levels anchored to the current market price.
      const bases = [...new Set(list.map((s) => String(s.symbol).split('/')[0].toUpperCase()))];
      const priceRows = await fetchLivePrices(bases).catch(() => []);
      const priceMap = new Map(priceRows.map((p) => [p.sym, p.price]));
      const enriched = list.map((s) => {
        const base = String(s.symbol).split('/')[0].toUpperCase();
        const entry = priceMap.get(base) ?? 0;
        const isLong = String(s.direction).toUpperCase() === 'LONG';
        const move = 0.018;
        return {
          ...s,
          entry,
          target: entry ? (isLong ? entry * (1 + move * 2) : entry * (1 - move * 2)) : 0,
          stopLoss: entry ? (isLong ? entry * (1 - move) : entry * (1 + move)) : 0,
        };
      });
      return jsonResponse(enriched);
    }
    if (path === '/copytrade/ai-chat' && method === 'POST') {
      const message = body.message as string | undefined;
      const agentId = body.agentId as string | undefined;
      if (!message) return jsonResponse({ error: 'message required' }, 400);
      if (!isOpenRouterConfigured()) return jsonResponse({ error: 'OpenRouter not configured' }, 503);
      await resolveUser(wallet);
      const agents = await getPlatformAgentsWithStatus('copytrade');
      const agent = agents.find((a) => a.id === agentId) ?? agents[0];
      if (!agent) return jsonResponse({ error: 'No agents available' }, 503);
      const prices = await fetchLivePrices(['BTC', 'ETH']);
      await saveChatMessage(wallet, agent.id as string, 'user', message);
      const reply = await chatCompletion([
        {
          role: 'system',
          content: `You are ${agent.name}, a ${(agent as { riskLevel?: string }).riskLevel}-risk crypto trading AI. Live BTC: $${prices[0]?.price ?? '?'}, ETH: $${prices[1]?.price ?? '?'}. Be concise, actionable, data-driven.`,
        },
        { role: 'user', content: message },
      ]);
      await saveChatMessage(wallet, agent.id as string, 'assistant', reply);
      return jsonResponse({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    }
    if (path === '/copytrade/exchanges' && method === 'GET') {
      return jsonResponse(await getCopytradeExchanges(wallet));
    }
    if (seg[0] === 'copytrade' && seg[1] === 'exchanges' && seg[2] && (method === 'PUT' || method === 'PATCH')) {
      return jsonResponse(await updateCopytradeExchange(wallet, Number(seg[2]), body));
    }
    if (seg[0] === 'copytrade' && seg[1] === 'exchanges' && seg[2] && method === 'DELETE') {
      return jsonResponse(await deleteCopytradeExchange(wallet, Number(seg[2])));
    }
    if (path === '/copytrade/configs' && method === 'GET') {
      return jsonResponse(await getCopytradeConfigs(wallet));
    }
    if (path === '/copytrade/configs' && method === 'POST') {
      await resolveUser(wallet);
      return jsonResponse(await createCopytradeConfig(wallet, body));
    }
    if (seg[0] === 'copytrade' && seg[1] === 'configs' && seg[2] && method === 'PATCH') {
      return jsonResponse(await updateCopytradeConfig(wallet, Number(seg[2]), body));
    }
    if (seg[0] === 'copytrade' && seg[1] === 'configs' && seg[2] && method === 'DELETE') {
      return jsonResponse(await deleteCopytradeConfig(wallet, Number(seg[2])));
    }
    if (path === '/copytrade/stats' && method === 'GET') {
      return jsonResponse(await getCopytradeStats(wallet));
    }
    if (path === '/copytrade/orders' && method === 'GET') {
      return jsonResponse(await getCopytradeOrders(wallet));
    }
    if (seg[0] === 'copytrade' && seg[1] === 'orders' && seg[2] && seg[3] === 'cancel' && method === 'POST') {
      return jsonResponse(await cancelCopytradeOrder(wallet, Number(seg[2])));
    }

    // ── Trader lookup (search) ─────────────────────────────────────────────
    if (seg[0] === 'copytrade' && seg[1] === 'trader' && seg[2] && method === 'GET') {
      const raw = decodeURIComponent(seg[2]).trim();
      let address = raw.toLowerCase();
      let username: string | undefined;
      if (!/^0x[a-f0-9]{40}$/.test(address)) {
        // Treat as a username / slug → resolve to a wallet first.
        const resolved = await resolvePmUsername(raw);
        if (!resolved.address) return jsonResponse({ error: resolved.error ?? 'Trader not found' }, 404);
        address = resolved.address.toLowerCase();
        username = resolved.username;
      }
      const trader = await buildTrader(address, username);
      return jsonResponse(trader);
    }

    return jsonResponse({ error: 'Not found', path, method }, 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ai]', method, path, msg);
    return jsonResponse({ error: msg }, 502);
  }
});
