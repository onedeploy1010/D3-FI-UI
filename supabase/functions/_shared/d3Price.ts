/**
 * Single source of truth for the D3 unit price (USDT per D3).
 *
 * P0 of the D3 on-chain/off-chain rework: every USDT<->D3 conversion (stake entry,
 * daily release, flash-swap) must go through this module so that switching from an
 * admin-set constant to an on-chain oracle later is a one-line change.
 *
 * Model:
 *   - D3  : staking / yield unit. Price is admin-set (default 5 USDT), stored in
 *           `public.d3_price_settings` (id=1). Future: source='oracle'.
 *   - UD3 : referral reward, pegged 1 UD3 = 1 USDT (NOT priced here).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './wallet.ts';

type Sb = SupabaseClient;

/** Fallback when the settings row is missing (matches legacy CROWDFUND_UNIT_PRICE_USDT). */
export const D3_PRICE_DEFAULT_USDT = 5;

/** UD3 is pegged to USDT 1:1. Kept here as the single declaration of the peg. */
export const UD3_USDT_PEG = 1;

/**
 * Default freshness window (seconds) applied to a newly written admin price when
 * the caller does not supply one. Configurable via the D3_PRICE_TTL_SECONDS env
 * var (NOT a secret). Falls back to 24h so a stalled admin does not brick reads
 * before an operator notices, while still guaranteeing an eventual fail-closed.
 */
const D3_PRICE_TTL_SECONDS_DEFAULT = 24 * 60 * 60;

function priceTtlSeconds(): number {
  const raw = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
    .Deno?.env.get('D3_PRICE_TTL_SECONDS');
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : D3_PRICE_TTL_SECONDS_DEFAULT;
}

export type D3PriceSourceKind = 'admin_const' | 'oracle';

export type D3PriceInfo = {
  priceUsdt: number;
  source: D3PriceSourceKind;
  updatedAt: string | null;
  /** ISO timestamp after which the price is considered stale, or null if unbounded. */
  expiresAt: string | null;
};

function sanitizePrice(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Coerce a nullable numeric column into a finite number or null. */
function toNumOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * V-05 guardrail: validate a candidate D3 price against configured bounds and
 * anti-manipulation limits. Pure and side-effect free — throws HttpError(400)
 * with a machine-readable `code` when the price is unsafe, otherwise returns.
 *
 * A low/zero/negative price inflates minted D3 and drains payouts, so every
 * write path must run this before persisting.
 */
export function assertPriceWithinGuardrails(
  price: number,
  opts: {
    prev?: number | null;
    min?: number | null;
    max?: number | null;
    maxDeviationPct?: number | null;
  } = {},
): void {
  if (!Number.isFinite(price) || price <= 0) {
    throw new HttpError(400, 'Invalid D3 price: must be a finite positive number', {
      code: 'D3_PRICE_INVALID',
      price,
    });
  }

  const min = toNumOrNull(opts.min);
  if (min !== null && price < min) {
    throw new HttpError(400, `D3 price ${price} below minimum ${min}`, {
      code: 'D3_PRICE_BELOW_MIN',
      price,
      min,
    });
  }

  const max = toNumOrNull(opts.max);
  if (max !== null && price > max) {
    throw new HttpError(400, `D3 price ${price} above maximum ${max}`, {
      code: 'D3_PRICE_ABOVE_MAX',
      price,
      max,
    });
  }

  const prev = toNumOrNull(opts.prev);
  const maxDeviationPct = toNumOrNull(opts.maxDeviationPct);
  if (prev !== null && prev > 0 && maxDeviationPct !== null) {
    const deviationPct = (Math.abs(price - prev) / prev) * 100;
    if (deviationPct > maxDeviationPct) {
      throw new HttpError(
        400,
        `D3 price change ${deviationPct.toFixed(4)}% exceeds max deviation ${maxDeviationPct}%`,
        { code: 'D3_PRICE_DEVIATION', price, prev, deviationPct, maxDeviationPct },
      );
    }
  }
}

/**
 * Read the current D3 price. Reads `d3_price_settings` (id=1); falls back to
 * D3_PRICE_DEFAULT_USDT if the table/row is absent or invalid. Never throws.
 *
 * Staleness is NOT enforced here (this stays a soft read) — value-bearing
 * callers must go through `getD3PriceUsdt`, which fails closed on an expired
 * `expires_at`.
 */
export async function getD3PriceInfo(sb: Sb): Promise<D3PriceInfo> {
  try {
    const { data, error } = await sb
      .from('d3_price_settings')
      .select('price_usdt, source, updated_at, expires_at')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) {
      return {
        priceUsdt: D3_PRICE_DEFAULT_USDT,
        source: 'admin_const',
        updatedAt: null,
        expiresAt: null,
      };
    }

    // Future: when source === 'oracle', fetch from the on-chain price feed here.
    const price = sanitizePrice(data.price_usdt) ?? D3_PRICE_DEFAULT_USDT;
    const source: D3PriceSourceKind = data.source === 'oracle' ? 'oracle' : 'admin_const';
    return {
      priceUsdt: price,
      source,
      updatedAt: (data.updated_at as string | null) ?? null,
      expiresAt: (data.expires_at as string | null) ?? null,
    };
  } catch {
    return {
      priceUsdt: D3_PRICE_DEFAULT_USDT,
      source: 'admin_const',
      updatedAt: null,
      expiresAt: null,
    };
  }
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
}

/**
 * Convenience: just the numeric D3 price in USDT.
 *
 * V-05: fails CLOSED by default. If the settings row carries an `expires_at`
 * that is in the past, the price is stale and this throws HttpError(503) so
 * flash-swap / settlement / solvency callers abort rather than mint against a
 * dangling price. Pass `{ allowStale: true }` for non-critical display reads.
 */
export async function getD3PriceUsdt(
  sb: Sb,
  opts: { allowStale?: boolean } = {},
): Promise<number> {
  const info = await getD3PriceInfo(sb);
  if (!opts.allowStale && isExpired(info.expiresAt)) {
    throw new HttpError(503, 'D3 price is stale (expired); refusing value-bearing read', {
      code: 'D3_PRICE_STALE',
      expiresAt: info.expiresAt,
    });
  }
  return info.priceUsdt;
}

/**
 * Admin update of the D3 price. Enforces V-05 guardrails against the currently
 * stored bounds/previous price before writing, records the superseded price in
 * `previous_price_usdt`, and refreshes `expires_at` so stale prices fail closed.
 */
export async function setD3PriceUsdt(
  sb: Sb,
  priceUsdt: number,
  updatedBy?: string,
): Promise<D3PriceInfo> {
  const price = sanitizePrice(priceUsdt);
  if (price === null) throw new HttpError(400, 'Invalid D3 price: must be a positive number', {
    code: 'D3_PRICE_INVALID',
  });

  // Load the current row for the guardrail bounds and the price we are superseding.
  const { data: current, error: readError } = await sb
    .from('d3_price_settings')
    .select('price_usdt, min_price_usdt, max_price_usdt, max_deviation_pct')
    .eq('id', 1)
    .maybeSingle();
  if (readError) throw readError;

  const currentPrice = current ? sanitizePrice(current.price_usdt) : null;

  assertPriceWithinGuardrails(price, {
    prev: currentPrice,
    min: current ? toNumOrNull(current.min_price_usdt) : null,
    max: current ? toNumOrNull(current.max_price_usdt) : null,
    maxDeviationPct: current ? toNumOrNull(current.max_deviation_pct) : null,
  });

  const now = Date.now();
  const patch: Record<string, unknown> = {
    id: 1,
    price_usdt: price,
    previous_price_usdt: currentPrice,
    source: 'admin_const',
    updated_at: new Date(now).toISOString(),
    expires_at: new Date(now + priceTtlSeconds() * 1000).toISOString(),
  };
  if (updatedBy) patch.updated_by = updatedBy;

  const { data, error } = await sb
    .from('d3_price_settings')
    .upsert(patch, { onConflict: 'id' })
    .select('price_usdt, source, updated_at, expires_at')
    .single();
  if (error) throw error;

  return {
    priceUsdt: sanitizePrice(data.price_usdt) ?? price,
    source: data.source === 'oracle' ? 'oracle' : 'admin_const',
    updatedAt: (data.updated_at as string | null) ?? null,
    expiresAt: (data.expires_at as string | null) ?? null,
  };
}

const D3_QTY_SCALE = 1e6;
const USDT_SCALE = 1e4;

function roundD3(n: number): number {
  return Math.round(n * D3_QTY_SCALE) / D3_QTY_SCALE;
}

function roundUsdt(n: number): number {
  return Math.round(n * USDT_SCALE) / USDT_SCALE;
}

/** USDT amount -> D3 quantity at the given price. Returns 0 for non-positive input. */
export function usdtToD3(amountUsdt: number, priceUsdt: number): number {
  if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) return 0;
  if (!Number.isFinite(priceUsdt) || priceUsdt <= 0) return 0;
  return roundD3(amountUsdt / priceUsdt);
}

/** D3 quantity -> USDT value at the given price. Returns 0 for non-positive input. */
export function d3ToUsdt(amountD3: number, priceUsdt: number): number {
  if (!Number.isFinite(amountD3) || amountD3 <= 0) return 0;
  if (!Number.isFinite(priceUsdt) || priceUsdt <= 0) return 0;
  return roundUsdt(amountD3 * priceUsdt);
}
