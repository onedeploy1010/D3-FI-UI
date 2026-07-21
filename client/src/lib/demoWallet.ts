import { isEthAddress } from '@/lib/wallet';

/** Seed line-leader wallet — matches supabase/seed.sql (must be exactly 40 hex chars). */
const DEFAULT_DEMO_WALLET = '0x1234567890abcdef1234567890abcdef12345678';

function resolveDemoWallet(): string {
  const fromEnv = (import.meta.env.VITE_DEMO_WALLET_ADDRESS as string | undefined)?.trim();
  if (fromEnv && isEthAddress(fromEnv)) return fromEnv;
  if (fromEnv && import.meta.env.DEV) {
    console.warn('[demo] VITE_DEMO_WALLET_ADDRESS is invalid — using default demo wallet');
  }
  return DEFAULT_DEMO_WALLET;
}

export const DEMO_LINE_LEADER_WALLET = resolveDemoWallet();

/** Demo partner program referrer — seeded in supabase/seed.sql */
export const DEMO_PARTNER_SPONSOR_WALLET = '0xabcdef1234567890abcdef1234567890abcdef01';

export const DEMO_SESSION_KEY = 'd3_demo_wallet';

export const DEMO_PROFILE = {
  displayNameZh: '演示线长',
  displayNameEn: 'Demo line leader',
  short: '0x1234…5678',
  tagZh: '演示',
  tagEn: 'Demo',
  descZh: '已预置股东资格、线长多签、团队树、UD3/D3 分红、协议 Epoch 与通知等 Seed 数据，可直接浏览各门户。',
  descEn: 'Preloaded shareholder status, line-leader multisig, team tree, UD3/D3 dividends, protocol epoch & notifications.',
};

export function readDemoWalletFromSession(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const v = sessionStorage.getItem(DEMO_SESSION_KEY);
  if (!v) return null;
  if (v.toLowerCase() === DEMO_LINE_LEADER_WALLET.toLowerCase()) return v;
  // Drop stale session (e.g. old invalid demo address)
  sessionStorage.removeItem(DEMO_SESSION_KEY);
  return null;
}

export function writeDemoWalletSession() {
  sessionStorage.setItem(DEMO_SESSION_KEY, DEMO_LINE_LEADER_WALLET);
}

export function clearDemoWalletSession() {
  sessionStorage.removeItem(DEMO_SESSION_KEY);
}

export function isDemoWallet(wallet: string | null | undefined): boolean {
  return Boolean(wallet && wallet.toLowerCase() === DEMO_LINE_LEADER_WALLET.toLowerCase());
}
