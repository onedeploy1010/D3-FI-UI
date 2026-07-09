import { walletEquals } from './wallet.ts';

export const DEMO_WALLET_ADDRESS =
  Deno.env.get('DEMO_WALLET_ADDRESS') ?? '0x1234567890AbCdEf1234567890AbCdEf12345678';

export function isDemoWalletAddress(wallet: string): boolean {
  return walletEquals(wallet, DEMO_WALLET_ADDRESS);
}

/** Demo line-leader PoC snapshot — matches seed.sql / protocolData mock. */
export const DEMO_POC_SCORE = {
  epoch_label: '#42',
  level_label: 'V5',
  composite_score: 78.4,
  level_diff_rate: 28.6,
  diff_floor_pct: 16,
  diff_ceil_pct: 38,
  dim_h: 72,
  dim_c: 85,
  dim_a: 68,
  dim_r: 91,
  dim_e: 56,
  raw_h_zh: '质押 D3 价值 $3,200',
  raw_h_en: 'Staked D3 value $3,200',
  raw_c_zh: '大区+小区总业绩 $556,400',
  raw_c_en: 'Large+small area $556,400',
  raw_a_zh: '30天新增 $42,000',
  raw_a_en: '30d new deposits $42,000',
  raw_r_zh: '续投+未提现比例 91%',
  raw_r_en: 'Renewal + unwithdrawn 91%',
  raw_e_zh: '新增有效户 12 (≥100U)',
  raw_e_en: '12 new valid (≥100U)',
  settled_at: '2026-07-06T00:00:00Z',
} as const;

/** Demo reads/writes for the seeded line-leader wallet without Privy JWT. */
export function isDemoModeRequest(req: Request): boolean {
  if (Deno.env.get('DEMO_MODE_ENABLED') === 'false') return false;
  if (req.headers.get('x-demo-mode') !== '1') return false;
  const wallet = req.headers.get('x-wallet-address')?.trim();
  if (!wallet) return false;
  return walletEquals(wallet, DEMO_WALLET_ADDRESS);
}
