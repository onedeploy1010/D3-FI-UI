import { isEthAddress, walletEquals } from './wallet';
import { isDemoWallet } from './demoWallet';

const PENDING_REF_KEY = 'd3_pending_referral';
const SKIP_PREFIX = 'd3_referral_skip';

function normalizeBasePath(base: string | undefined): string {
  if (!base || base === '/') return '';
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** Current site origin — browser hostname, optional VITE_APP_ORIGIN override */
export function getReferralOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  const env = import.meta.env.VITE_APP_ORIGIN as string | undefined;
  if (env?.trim()) return env.trim().replace(/\/$/, '');
  return '';
}

/** Vite base path (e.g. /D3-FI-UI on GitHub Pages) */
export function getReferralBasePath(): string {
  return normalizeBasePath(import.meta.env.BASE_URL);
}

/**
 * Unified member referral link: {origin}{base}/r/0x…
 * Same URL for D3-Fi, Portal, and Shareholder Alliance.
 */
export function buildReferralLink(wallet: string | null | undefined): string {
  const origin = getReferralOrigin();
  const base = getReferralBasePath();
  const root = `${origin}${base}/r`;
  return wallet ? `${root}/${wallet}` : `${root}/`;
}

/** @deprecated use buildReferralLink */
export function buildMemberReferralLink(wallet: string | null | undefined): string {
  return buildReferralLink(wallet);
}

/** Persist ?ref= from any entry URL so Portal can bind after wallet connect */
export function captureReferralFromUrl(location?: { search: string; pathname: string }) {
  if (typeof window === 'undefined') return null;

  const search = location?.search ?? window.location.search;
  const pathname = location?.pathname ?? window.location.pathname;

  const params = new URLSearchParams(search);
  const fromQuery = params.get('ref') ?? params.get('sponsor');
  if (fromQuery && isEthAddress(fromQuery)) {
    sessionStorage.setItem(PENDING_REF_KEY, fromQuery.trim());
    return fromQuery.trim();
  }

  const base = getReferralBasePath();
  const pathPattern = new RegExp(
    `${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?:union|partner/)?r/(0x[0-9a-fA-F]{40})`,
    'i',
  );
  const pathMatch =
    pathname.match(pathPattern) ?? pathname.match(/\/(?:union|partner)\/r\/(0x[0-9a-fA-F]{40})/i) ?? pathname.match(/\/r\/(0x[0-9a-fA-F]{40})/i);
  if (pathMatch?.[1] && isEthAddress(pathMatch[1])) {
    sessionStorage.setItem(PENDING_REF_KEY, pathMatch[1]);
    return pathMatch[1];
  }

  return null;
}

export function getPendingReferral(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(PENDING_REF_KEY);
  if (!raw || !isEthAddress(raw)) return null;
  return raw.trim();
}

export function clearPendingReferral() {
  sessionStorage.removeItem(PENDING_REF_KEY);
}

function skipKey(wallet: string, sponsor: string) {
  return `${SKIP_PREFIX}:${wallet.toLowerCase()}:${sponsor.toLowerCase()}`;
}

export function isReferralSkipped(wallet: string, sponsor: string): boolean {
  return localStorage.getItem(skipKey(wallet, sponsor)) === '1';
}

export function markReferralSkipped(wallet: string, sponsor: string) {
  localStorage.setItem(skipKey(wallet, sponsor), '1');
}

export function shouldOfferReferralBind(
  wallet: string | null,
  sponsor: string | null,
  hasActiveReferral: boolean,
): boolean {
  if (!wallet || !sponsor || !isEthAddress(sponsor)) return false;
  if (walletEquals(wallet, sponsor)) return false;
  if (hasActiveReferral) return false;
  if (isReferralSkipped(wallet, sponsor)) return false;
  return true;
}

/** 演示账户始终视为已绑定推荐（种子数据 0xabcd…Ef01） */
export function isReferralBoundForWallet(
  wallet: string | null,
  referrals: Array<{ sponsor_wallet_address: string | null; status: string }> | undefined,
): boolean {
  if (!wallet) return false;
  if (isDemoWallet(wallet)) return true;
  return (referrals ?? []).some((r) => r.status === 'active' && r.sponsor_wallet_address);
}
