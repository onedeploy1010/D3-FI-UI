/**
 * Data + generators for the 私募心跳指数 (private-sale Heartbeat Index) widget.
 *
 * The widget renders a live, block-explorer-style stream of incoming 私募 staking
 * orders. Real order flow is sparse, so — like the existing admin display-boost on
 * private-sale progress — this stream is *simulated* client-side to convey momentum.
 * Amounts, addresses and tx hashes are synthetic; nothing here touches the chain.
 */

/** Four crowdfund rounds — round 1 is 800万 D3 @ 5U, each later round steps the price up. */
export const PRESALE_ROUNDS = [
  { round: 1, d3: 8_000_000, priceUsdt: 5 },
  { round: 2, d3: 8_000_000, priceUsdt: 6 },
  { round: 3, d3: 8_000_000, priceUsdt: 7 },
  { round: 4, d3: 8_000_000, priceUsdt: 8 },
] as const;

/**
 * Accent per round — escalates along the brand ramp (primary → vivid → accent) as
 * the price rises. Uses the theme tokens from index.css (no off-brand neon pink).
 */
export const ROUND_ACCENTS = ['#8A2B57', '#B23A6E', '#D14E86', '#E0568F'] as const;

/** Cadence for simulated top-up orders: one every 10 minutes (display only). */
export const FAKE_ORDER_INTERVAL_MS = 10 * 60 * 1000;

/** A single simulated incoming private-sale order. */
export type StreamOrder = {
  id: string;
  /** Full 0x… tx hash (66 chars). Shown masked. */
  hash: string;
  /** Full 0x… wallet address (42 chars). Shown masked. */
  address: string;
  amountUsdt: number;
  d3: number;
  round: number;
  priceUsdt: number;
  /** Epoch ms the order arrived (Date.now at push time). */
  at: number;
};

const HEX = '0123456789abcdef';

function randomHex(len: number): string {
  let s = '';
  for (let i = 0; i < len; i += 1) s += HEX[Math.floor(Math.random() * 16)];
  return s;
}

/** Stake tiers within the 100–2000 USDT band, weighted so smaller tickets dominate. */
const AMOUNT_TIERS: { usdt: number; weight: number }[] = [
  { usdt: 100, weight: 24 },
  { usdt: 200, weight: 22 },
  { usdt: 300, weight: 16 },
  { usdt: 500, weight: 14 },
  { usdt: 800, weight: 9 },
  { usdt: 1_000, weight: 7 },
  { usdt: 1_500, weight: 5 },
  { usdt: 2_000, weight: 3 },
];

const TIER_TOTAL = AMOUNT_TIERS.reduce((s, t) => s + t.weight, 0);

function pickAmount(): number {
  let r = Math.random() * TIER_TOTAL;
  for (const t of AMOUNT_TIERS) {
    r -= t.weight;
    if (r <= 0) return t.usdt;
  }
  return AMOUNT_TIERS[0].usdt;
}

let seq = 0;

/** Build one synthetic order for the given active round. */
export function makeRandomOrder(round: number, priceUsdt: number, at: number): StreamOrder {
  const amountUsdt = pickAmount();
  seq += 1;
  return {
    id: `ord_${at.toString(36)}_${seq.toString(36)}`,
    hash: `0x${randomHex(64)}`,
    address: `0x${randomHex(40)}`,
    amountUsdt,
    d3: Math.round((amountUsdt / priceUsdt) * 100) / 100,
    round,
    priceUsdt,
    at,
  };
}

/** Seed the stream with a handful of orders aged into the recent past. */
export function seedOrders(count: number, round: number, priceUsdt: number, now: number): StreamOrder[] {
  const out: StreamOrder[] = [];
  for (let i = 0; i < count; i += 1) {
    // Space seed orders ~5–14 min apart, most-recent first (matches the 10-min cadence).
    const at = now - Math.round((i * (300 + Math.random() * 540) + Math.random() * 120) * 1000);
    out.push(makeRandomOrder(round, priceUsdt, at));
  }
  return out;
}

/** 0xAbc1…9f2C — first 6 + last 4 of an address. */
export function shortenAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** 0xAbcdef…12345678 — first 8 + last 8 of a tx hash. */
export function shortenHash(hash: string): string {
  return hash.length > 20 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;
}

/** i18n-free relative age in seconds; caller renders the unit. */
export function ageSeconds(at: number, now: number): number {
  return Math.max(0, Math.round((now - at) / 1000));
}
