/** Seed line-leader wallet — matches supabase/seed.sql */
export const DEMO_LINE_LEADER_WALLET =
  (import.meta.env.VITE_DEMO_WALLET_ADDRESS as string | undefined) ??
  '0x1234567890AbCdEf1234567890AbCdEf1234567890';

export const DEMO_SESSION_KEY = 'd3_demo_wallet';

export const DEMO_PROFILE = {
  displayNameZh: '演示线长',
  displayNameEn: 'Demo line leader',
  short: '0x1234…7890',
  tagZh: '演示',
  tagEn: 'Demo',
  descZh: '已预置股东资格、线长多签、团队树、USD3/D3 分红、协议 Epoch 与通知等 Seed 数据，可直接浏览各门户。',
  descEn: 'Preloaded shareholder status, line-leader multisig, team tree, USD3/D3 dividends, protocol epoch & notifications.',
};

export function readDemoWalletFromSession(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const v = sessionStorage.getItem(DEMO_SESSION_KEY);
  return v && v.toLowerCase() === DEMO_LINE_LEADER_WALLET.toLowerCase() ? v : null;
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
