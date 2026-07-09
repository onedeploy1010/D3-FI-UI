/** RFC 8785-style JSON canonicalization (sorted object keys). */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalizeJson(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`).join(',')}}`;
}

export type PrivySignPayload = {
  version: 1;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body: Record<string, unknown>;
  headers: {
    'privy-app-id': string;
    'privy-idempotency-key'?: string;
    'privy-request-expiry'?: string;
  };
};

export function buildPrivySignPayload(
  method: PrivySignPayload['method'],
  url: string,
  body: Record<string, unknown>,
  appId: string,
  extraHeaders?: { idempotencyKey?: string; requestExpiry?: string },
): PrivySignPayload {
  const headers: PrivySignPayload['headers'] = { 'privy-app-id': appId };
  if (extraHeaders?.idempotencyKey) headers['privy-idempotency-key'] = extraHeaders.idempotencyKey;
  if (extraHeaders?.requestExpiry) headers['privy-request-expiry'] = extraHeaders.requestExpiry;
  return { version: 1, method, url, body, headers };
}

function normalizeAuthPrivateKey(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('wallet-auth:') ? trimmed.slice('wallet-auth:'.length) : trimmed;
}

/** Sign a Privy API request with a wallet-auth P-256 private key (PKCS#8 base64). */
export async function signPrivyAuthorizationPayload(
  payload: PrivySignPayload,
  privateKeyMaterial: string,
): Promise<string> {
  const { createPrivateKey, sign } = await import('node:crypto');
  const serialized = canonicalizeJson(payload);
  const pkcs8B64 = normalizeAuthPrivateKey(privateKeyMaterial);
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8B64}\n-----END PRIVATE KEY-----`;
  const privateKey = createPrivateKey({ key: pem, format: 'pem' });
  const signature = sign('sha256', Buffer.from(serialized), privateKey);
  return signature.toString('base64');
}

export function privyRpcUrl(walletId: string): string {
  return `https://api.privy.io/v1/wallets/${walletId}/rpc`;
}

export function isPrivyOnchainEnabled(): boolean {
  return Boolean(
    Deno.env.get('PRIVY_APP_ID') &&
      Deno.env.get('PRIVY_APP_SECRET') &&
      Deno.env.get('PRIVY_LINE_KEY_QUORUM_ID'),
  );
}

export function getTreasuryAuthPrivateKey(): string | null {
  return Deno.env.get('PRIVY_TREASURY_AUTH_PRIVATE_KEY') ?? null;
}

export function getPrivyCaip2(): string {
  return Deno.env.get('PRIVY_CHAIN_CAIP2') ?? 'eip155:56';
}

/** On-chain attestation tx — quorum authorizes dividend distribution intent. */
export function buildDividendAttestationRpcBody(proposalId: string, proposerWallet: string) {
  const bytes = new TextEncoder().encode(
    `D3-UNION-DIVIDEND:${proposalId}:${proposerWallet.toLowerCase()}`,
  );
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const data = `0x${hex}`;
  return {
    method: 'eth_sendTransaction',
    caip2: getPrivyCaip2(),
    chain_type: 'ethereum',
    params: {
      transaction: {
        to: proposerWallet,
        value: '0x0',
        data,
      },
    },
  };
}
