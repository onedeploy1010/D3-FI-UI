import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import {
  buildLeaderboard,
  buildPositions,
  CACHE_TTL_MS,
  resolvePmUsername,
  type LeaderboardType,
} from '../_shared/polymarketData.ts';

function routePath(req: Request): string {
  const url = new URL(req.url);
  let p = url.pathname;
  const idx = p.indexOf('/polymarket');
  if (idx >= 0) p = p.slice(idx + '/polymarket'.length) || '/';
  if (p.startsWith('/polymarket')) p = p.slice('/polymarket'.length) || '/';
  return p || '/';
}

async function getCache(key: string): Promise<unknown | null> {
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb
      .from('market_analysis_cache')
      .select('payload, expires_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (!data) return null;
    if (new Date(data.expires_at) < new Date()) return null;
    return data.payload;
  } catch {
    return null;
  }
}

async function setCache(key: string, payload: unknown, ttlMs: number): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    const expires_at = new Date(Date.now() + ttlMs).toISOString();
    await sb.from('market_analysis_cache').upsert({ cache_key: key, payload, expires_at });
  } catch (e) {
    console.warn('[polymarket] cache write failed', e);
  }
}

async function clearLeaderboardCache(): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    await sb.from('market_analysis_cache').delete().like('cache_key', 'polymarket:leaderboard:%');
  } catch (e) {
    console.warn('[polymarket] cache clear failed', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const path = routePath(req);

  try {
    if (path === '/health') {
      return jsonResponse({ ok: true, source: 'data-api.polymarket.com' });
    }

    if (req.method === 'POST' && path === '/refresh') {
      await clearLeaderboardCache();
      return jsonResponse({ ok: true, refreshedAt: new Date().toISOString() });
    }

    if (req.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    if (path === '/leaderboard') {
      const url = new URL(req.url);
      const type: LeaderboardType = url.searchParams.get('type') === 'rising' ? 'rising' : 'top';
      const cacheKey = `polymarket:leaderboard:${type}`;
      const cached = await getCache(cacheKey);
      if (cached) return jsonResponse(cached);

      const payload = await buildLeaderboard(type);
      await setCache(cacheKey, payload, CACHE_TTL_MS);
      return jsonResponse(payload);
    }

    const positionsMatch = path.match(/^\/positions\/(0x[a-fA-F0-9]{40})$/);
    if (positionsMatch) {
      const address = positionsMatch[1].toLowerCase();
      const cacheKey = `polymarket:positions:${address}`;
      const cached = await getCache(cacheKey);
      if (cached) return jsonResponse(cached);

      const payload = await buildPositions(address);
      await setCache(cacheKey, payload, 60_000);
      return jsonResponse(payload);
    }

    const resolveMatch = path.match(/^\/resolve\/([^/]+)$/);
    if (resolveMatch) {
      const username = decodeURIComponent(resolveMatch[1]);
      const payload = await resolvePmUsername(username);
      if (payload.error && !payload.address) {
        return jsonResponse(payload, 404);
      }
      return jsonResponse(payload);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[polymarket]', msg);
    if (path === '/leaderboard') {
      return jsonResponse({
        traders: [],
        fetchedAt: new Date().toISOString(),
        status: 'error',
        errorMsg: msg,
      });
    }
    return jsonResponse({ error: msg }, 502);
  }
});
