import { formatWalletAddress } from './wallet';

type TokenGetter = () => Promise<string | null>;

let accessTokenGetter: TokenGetter | null = null;

export function setUnionAccessTokenGetter(getter: TokenGetter) {
  accessTokenGetter = getter;
}

async function buildAuthHeaders(wallet: string): Promise<Record<string, string>> {
  const address = formatWalletAddress(wallet);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Wallet-Address': address,
  };

  if (accessTokenGetter) {
    const token = await accessTokenGetter();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function unionFetch<T>(
  path: string,
  wallet: string,
  init?: RequestInit,
): Promise<T> {
  const authHeaders = await buildAuthHeaders(wallet);
  const res = await fetch(`/api/union${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return body as T;
}

export function ensureUnionProfile(
  wallet: string,
  opts?: { lang?: 'zh' | 'en'; privyUserId?: string; displayName?: string },
) {
  return unionFetch<{ profile: unknown; created: boolean }>('/profile', wallet, {
    method: 'POST',
    body: JSON.stringify({
      walletAddress: wallet,
      lang: opts?.lang ?? 'zh',
      privyUserId: opts?.privyUserId,
      displayName: opts?.displayName,
    }),
  });
}

export function fetchUnionProfile(wallet: string) {
  return unionFetch<{
    profile: unknown;
    shareholder: unknown;
    usd3Account: unknown;
    d3Account: unknown;
  }>(`/profile/${encodeURIComponent(wallet)}`, wallet);
}
