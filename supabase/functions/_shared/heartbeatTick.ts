import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './wallet.ts';
import { getHeartbeatConfig, getUnitPriceUsdt, type HeartbeatConfig } from './systemParams.ts';

type Sb = SupabaseClient;

const HEX = '0123456789abcdef';

/** A synthetic 0x… wallet address for a simulated display order. */
function randomAddress(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let s = '0x';
  for (const b of bytes) s += HEX[(b >> 4) & 0xf] + HEX[b & 0xf];
  return s;
}

function randomTxHash(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = '0x';
  for (const b of bytes) s += HEX[(b >> 4) & 0xf] + HEX[b & 0xf];
  return s;
}

function pickAmount(cfg: HeartbeatConfig): number {
  const tiers = cfg.amountTiers.filter((t) => t >= cfg.amountMin && t <= cfg.amountMax);
  const pool = tiers.length ? tiers : cfg.amountTiers;
  if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  // Fallback: uniform within [min,max] rounded to nearest 100.
  const span = Math.max(0, cfg.amountMax - cfg.amountMin);
  return Math.max(cfg.amountMin, Math.round((cfg.amountMin + Math.random() * span) / 100) * 100);
}

/** Insert one heartbeat order (manual or auto) and bump the cumulative counter. */
export async function insertHeartbeatOrder(
  sb: Sb,
  input: { amountUsdt: number; address?: string; source: 'manual' | 'auto'; createdBy?: string },
) {
  const amount = Number(input.amountUsdt);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Invalid amountUsdt');
  const unitPrice = await getUnitPriceUsdt(sb);
  const row = {
    address: input.address?.trim() || randomAddress(),
    amount_usdt: amount,
    d3: Math.round((amount / unitPrice) * 1e6) / 1e6,
    round: 1,
    source: input.source,
    tx_hash: randomTxHash(),
    created_by: input.createdBy ?? null,
  };
  const { data, error } = await sb.from('heartbeat_orders').insert(row).select('*').single();
  if (error) throw new HttpError(500, error.message);
  await bumpCumulative(sb);
  return data;
}

async function bumpCumulative(sb: Sb) {
  const { data } = await sb
    .from('heartbeat_state')
    .select('cumulative_count')
    .eq('id', 'default')
    .maybeSingle();
  const next = Number((data as { cumulative_count?: number } | null)?.cumulative_count ?? 0) + 1;
  await sb
    .from('heartbeat_state')
    .upsert({ id: 'default', cumulative_count: next, updated_at: new Date().toISOString() });
}

/**
 * Cron tick: append one simulated order iff the generator is enabled and at least
 * `interval_seconds` have elapsed since the last tick. Fired every minute; the
 * interval is enforced here so it stays runtime-configurable and pausable.
 */
export async function runHeartbeatTick(sb: Sb) {
  const cfg = await getHeartbeatConfig(sb);
  if (!cfg.enabled) return { ok: true, skipped: 'disabled' as const };

  const { data: state } = await sb
    .from('heartbeat_state')
    .select('last_tick_at')
    .eq('id', 'default')
    .maybeSingle();
  const last = (state as { last_tick_at?: string | null } | null)?.last_tick_at;
  const now = Date.now();
  if (last && now - new Date(last).getTime() < cfg.intervalSeconds * 1000) {
    return { ok: true, skipped: 'cooldown' as const };
  }

  const order = await insertHeartbeatOrder(sb, { amountUsdt: pickAmount(cfg), source: 'auto' });
  await sb
    .from('heartbeat_state')
    .upsert({ id: 'default', last_tick_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() });
  return { ok: true, inserted: true, order };
}

/** Admin "立即生成一条": append one auto order now, ignoring the cooldown. */
export async function generateHeartbeatOrderNow(sb: Sb, createdBy?: string) {
  const cfg = await getHeartbeatConfig(sb);
  return insertHeartbeatOrder(sb, { amountUsdt: pickAmount(cfg), source: 'auto', createdBy });
}
