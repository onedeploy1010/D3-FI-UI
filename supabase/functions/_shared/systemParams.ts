import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './wallet.ts';

type Sb = SupabaseClient;

export type SystemParam = {
  param_key: string;
  param_group: string;
  label: string;
  value: unknown;
  value_type: 'number' | 'string' | 'boolean' | 'json';
  on_chain: boolean;
  editable: boolean;
  updated_by: string | null;
  updated_at: string;
};

export type PrivateSaleRound = { round: number; d3: number; priceUsdt: number };

export type HeartbeatConfig = {
  enabled: boolean;
  intervalSeconds: number;
  amountMin: number;
  amountMax: number;
  amountTiers: number[];
};

const DEFAULT_ROUNDS: PrivateSaleRound[] = [
  { round: 1, d3: 8_000_000, priceUsdt: 5 },
  { round: 2, d3: 8_000_000, priceUsdt: 6 },
  { round: 3, d3: 8_000_000, priceUsdt: 7 },
  { round: 4, d3: 8_000_000, priceUsdt: 8 },
];

const DEFAULT_HEARTBEAT: HeartbeatConfig = {
  enabled: true,
  intervalSeconds: 600,
  amountMin: 100,
  amountMax: 2000,
  amountTiers: [100, 200, 300, 500, 800, 1000, 1500, 2000],
};

/** All params, optionally filtered by group. Ordered for stable admin display. */
export async function getParams(sb: Sb, group?: string): Promise<SystemParam[]> {
  let q = sb.from('system_params').select('*').order('param_group').order('param_key');
  if (group) q = q.eq('param_group', group);
  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message);
  return (data ?? []) as SystemParam[];
}

/** Raw value of a single param, or `fallback` if missing / on any read error. */
export async function getParamValue<T>(sb: Sb, key: string, fallback: T): Promise<T> {
  const { data, error } = await sb
    .from('system_params')
    .select('value')
    .eq('param_key', key)
    .maybeSingle();
  if (error || !data) return fallback;
  const v = (data as { value?: unknown }).value;
  return (v === undefined || v === null ? fallback : (v as T));
}

/** Admin update of a single param value (audited by the caller). */
export async function updateParam(sb: Sb, key: string, value: unknown, updatedBy?: string) {
  const { data: existing } = await sb
    .from('system_params')
    .select('param_key, editable')
    .eq('param_key', key)
    .maybeSingle();
  if (!existing) throw new HttpError(404, `Unknown param: ${key}`);
  if ((existing as { editable?: boolean }).editable === false) {
    throw new HttpError(400, `Param not editable: ${key}`);
  }
  const { data, error } = await sb
    .from('system_params')
    .update({ value, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() })
    .eq('param_key', key)
    .select('*')
    .single();
  if (error) throw new HttpError(500, error.message);
  return data as SystemParam;
}

/** Private-sale round ladder (single source of truth), with a safe default. */
export async function getPrivateSaleRounds(sb: Sb): Promise<PrivateSaleRound[]> {
  const rows = await getParamValue<PrivateSaleRound[]>(sb, 'private_sale.round_schedule', DEFAULT_ROUNDS);
  return Array.isArray(rows) && rows.length ? rows : DEFAULT_ROUNDS;
}

/** Round-1 unit price used for the heartbeat 质押数量 = 总额 ÷ price conversion. */
export async function getUnitPriceUsdt(sb: Sb): Promise<number> {
  const v = Number(await getParamValue<number>(sb, 'private_sale.unit_price_usdt', 5));
  return Number.isFinite(v) && v > 0 ? v : 5;
}

/** Additive admin progress boost for /private-sale/progress. */
export async function getDisplayBoostPct(sb: Sb): Promise<number> {
  const v = Number(await getParamValue<number>(sb, 'private_sale.display_boost_pct', 0));
  return Number.isFinite(v) ? v : 0;
}

/** Heartbeat generator config, read from the heartbeat.* param group. */
export async function getHeartbeatConfig(sb: Sb): Promise<HeartbeatConfig> {
  const rows = await getParams(sb, 'heartbeat');
  const map = new Map(rows.map((r) => [r.param_key, r.value]));
  const num = (k: string, d: number) => {
    const v = Number(map.get(k));
    return Number.isFinite(v) ? v : d;
  };
  const tiers = map.get('heartbeat.amount_tiers');
  return {
    enabled: map.has('heartbeat.enabled') ? Boolean(map.get('heartbeat.enabled')) : DEFAULT_HEARTBEAT.enabled,
    intervalSeconds: Math.max(30, num('heartbeat.interval_seconds', DEFAULT_HEARTBEAT.intervalSeconds)),
    amountMin: num('heartbeat.amount_min', DEFAULT_HEARTBEAT.amountMin),
    amountMax: num('heartbeat.amount_max', DEFAULT_HEARTBEAT.amountMax),
    amountTiers: Array.isArray(tiers) && tiers.length ? (tiers as number[]) : DEFAULT_HEARTBEAT.amountTiers,
  };
}

/** Update heartbeat config params individually (enabled / interval / amounts). */
export async function updateHeartbeatConfig(
  sb: Sb,
  patch: Partial<{ enabled: boolean; intervalSeconds: number; amountMin: number; amountMax: number }>,
  updatedBy?: string,
): Promise<HeartbeatConfig> {
  if (patch.enabled !== undefined) await updateParam(sb, 'heartbeat.enabled', Boolean(patch.enabled), updatedBy);
  if (patch.intervalSeconds !== undefined) {
    const v = Math.max(30, Math.floor(Number(patch.intervalSeconds)));
    if (!Number.isFinite(v)) throw new HttpError(400, 'Invalid intervalSeconds');
    await updateParam(sb, 'heartbeat.interval_seconds', v, updatedBy);
  }
  if (patch.amountMin !== undefined) await updateParam(sb, 'heartbeat.amount_min', Number(patch.amountMin), updatedBy);
  if (patch.amountMax !== undefined) await updateParam(sb, 'heartbeat.amount_max', Number(patch.amountMax), updatedBy);
  return getHeartbeatConfig(sb);
}
