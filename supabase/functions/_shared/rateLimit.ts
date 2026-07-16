import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './wallet.ts';

type Sb = SupabaseClient;

export type RateLimitOptions = {
  /** Bucket key, e.g. `${route}:${wallet}`. */
  key: string;
  /** Max hits allowed within the window. */
  limit: number;
  /** Window length in seconds (fixed window). */
  windowSec: number;
};

/**
 * Compute the ISO timestamp of the current fixed window's start:
 * floor(now / windowSec) * windowSec.
 */
export function windowStartIso(nowMs: number, windowSec: number): string {
  const startSec = Math.floor(nowMs / 1000 / windowSec) * windowSec;
  return new Date(startSec * 1000).toISOString();
}

/**
 * Atomically bump the hit counter for (bucket, windowStart) and return the
 * post-increment count. Returns `null` when the count could not be determined
 * (infrastructure error) so the caller can fail open.
 *
 * Primary path uses the `increment_rate_limit` RPC (migration 039) which does an
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING in a single round trip. If the
 * RPC is unavailable it falls back to select-then-upsert (fixed window, so minor
 * overcount under concurrency is acceptable).
 */
async function bumpAndCount(sb: Sb, bucket: string, windowStart: string): Promise<number | null> {
  // Primary: atomic RPC returning the incremented count.
  try {
    const rpc = await sb.rpc('increment_rate_limit', {
      p_bucket: bucket,
      p_window_start: windowStart,
    });
    if (!rpc.error && typeof rpc.data === 'number') return rpc.data;
  } catch {
    /* fall through to fallback */
  }

  // Fallback: select current count then upsert count+1.
  try {
    const { data: existing, error: selErr } = await sb
      .from('rate_limit_hits')
      .select('hits')
      .eq('bucket', bucket)
      .eq('window_start', windowStart)
      .maybeSingle();
    if (selErr) return null;
    const next = Number(existing?.hits ?? 0) + 1;
    const { error: upErr } = await sb
      .from('rate_limit_hits')
      .upsert({ bucket, window_start: windowStart, hits: next }, { onConflict: 'bucket,window_start' });
    if (upErr) return null;
    return next;
  } catch {
    return null;
  }
}

/**
 * Fixed-window rate limiter. Throws HttpError(429) once the count for the current
 * window exceeds `limit`. Fails OPEN (logs + allows) on any infrastructure error
 * so a limiter outage cannot block all money flow — but counts correctly on the
 * happy path.
 */
export async function enforceRateLimit(sb: Sb, { key, limit, windowSec }: RateLimitOptions): Promise<void> {
  let count: number | null;
  try {
    const windowStart = windowStartIso(Date.now(), windowSec);
    count = await bumpAndCount(sb, key, windowStart);
  } catch (e) {
    console.warn('[rateLimit] limiter error, failing open:', e instanceof Error ? e.message : e);
    return;
  }
  if (count === null) {
    console.warn(`[rateLimit] count unavailable for ${key}, failing open`);
    return;
  }
  if (count > limit) {
    throw new HttpError(429, 'Rate limit exceeded');
  }
}
