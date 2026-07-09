import { readDemoWalletFromSession, isDemoWallet } from './demoWallet';
import { isSupabaseClientConfigured, supabaseAnonKey, supabaseUrl } from './supabase';
import { formatWalletAddress } from './wallet';

type TokenGetter = () => Promise<string | null>;

let accessTokenGetter: TokenGetter | null = null;

export function setDepositAccessTokenGetter(getter: TokenGetter) {
  accessTokenGetter = getter;
}

export type DepositIntent = {
  intentId: string;
  depositAddress: string;
  shortAddress: string;
  chainId: number;
  chainName: string;
  tokenSymbol: string;
  tokenContract: string;
  expectedAmount: string;
  expiresAt: string;
  status: string;
};

export type DepositStatus = DepositIntent & {
  txHash: string | null;
  receivedAmount: string;
  confirmations: number;
  depositStatus: string;
  credited?: boolean;
};

function requireSupabase() {
  if (!isSupabaseClientConfigured || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('Backend service not configured');
  }
}

async function buildHeaders(wallet: string): Promise<Record<string, string>> {
  const address = formatWalletAddress(wallet);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${supabaseAnonKey}`,
    apikey: supabaseAnonKey!,
    'X-Wallet-Address': address,
  };

  const demoSession = readDemoWalletFromSession();
  if (demoSession && isDemoWallet(address)) {
    headers['X-Demo-Mode'] = '1';
  } else if (accessTokenGetter) {
    const token = await accessTokenGetter();
    if (token) headers['X-Privy-Token'] = token;
  }

  return headers;
}

async function treasuryFetch<T>(wallet: string, path: string, init?: RequestInit): Promise<T> {
  requireSupabase();
  const headers = await buildHeaders(wallet);
  const res = await fetch(`${supabaseUrl}/functions/v1/treasury${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return body as T;
}

export function createPartnerJoinIntent(wallet: string, amountUsdt: number) {
  return treasuryFetch<DepositIntent>(wallet, '/partner/join', {
    method: 'POST',
    body: JSON.stringify({ amountUsdt }),
  });
}

export function createStakeIntent(wallet: string, amountUsdt: number) {
  return treasuryFetch<DepositIntent>(wallet, '/crowdfunding/stake-intent', {
    method: 'POST',
    body: JSON.stringify({ amountUsdt }),
  });
}

export function fetchDepositStatus(wallet: string, intentId: string) {
  return treasuryFetch<DepositStatus>(wallet, `/deposit/status?intent_id=${encodeURIComponent(intentId)}`);
}

export function reportDepositTx(wallet: string, intentId: string, txHash: string) {
  return treasuryFetch<DepositStatus>(wallet, '/deposit/report-tx', {
    method: 'POST',
    body: JSON.stringify({ intentId, txHash }),
  });
}

export function demoCreditDeposit(wallet: string, intentId: string) {
  return treasuryFetch<DepositStatus>(wallet, '/deposit/demo-credit', {
    method: 'POST',
    body: JSON.stringify({ intentId }),
  });
}

export async function waitForDepositCredited(
  wallet: string,
  intentId: string,
  opts?: { maxAttempts?: number; intervalMs?: number },
): Promise<DepositStatus> {
  const maxAttempts = opts?.maxAttempts ?? 60;
  const intervalMs = opts?.intervalMs ?? 3000;

  for (let i = 0; i < maxAttempts; i++) {
    const status = await fetchDepositStatus(wallet, intentId);
    if (
      status.credited ||
      status.status === 'credited' ||
      status.depositStatus === 'credited' ||
      status.depositStatus === 'detected'
    ) {
      return status;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('充值确认超时，请稍后在「我的质押」查看状态');
}
