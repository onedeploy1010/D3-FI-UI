import {
  buildPrivySignPayload,
  privyRpcUrl,
  signPrivyAuthorizationPayload,
} from './privySign.ts';

const PRIVY_API = 'https://api.privy.io';

function appId() {
  const id = Deno.env.get('PRIVY_APP_ID');
  if (!id) throw new Error('PRIVY_APP_ID not configured');
  return id;
}

function basicAuth() {
  const secret = Deno.env.get('PRIVY_APP_SECRET');
  if (!secret) throw new Error('PRIVY_APP_SECRET not configured');
  return 'Basic ' + btoa(`${appId()}:${secret}`);
}

export type PrivyWallet = {
  id: string;
  address: string;
  owner_id: string | null;
};

async function privyRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  opts?: { authorizationSignatures?: string[]; requestExpiry?: string; idempotencyKey?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: basicAuth(),
    'privy-app-id': appId(),
    'Content-Type': 'application/json',
  };
  if (opts?.authorizationSignatures?.length) {
    headers['privy-authorization-signature'] = opts.authorizationSignatures.join(',');
  }
  if (opts?.requestExpiry) headers['privy-request-expiry'] = opts.requestExpiry;
  if (opts?.idempotencyKey) headers['privy-idempotency-key'] = opts.idempotencyKey;

  const res = await fetch(`${PRIVY_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string; message?: string }).error ?? (json as { message?: string }).message ?? res.statusText);
  }
  return json as T;
}

export async function createPrivyTreasuryWallet(
  keyQuorumId: string,
  displayName: string,
  idempotencyKey?: string,
): Promise<PrivyWallet> {
  const wallet = await privyRequest<PrivyWallet>(
    'POST',
    '/v1/wallets',
    {
      chain_type: 'ethereum',
      owner_id: keyQuorumId,
      display_name: displayName.slice(0, 100),
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );
  return wallet;
}

export async function executePrivyWalletRpc(
  walletId: string,
  rpcBody: Record<string, unknown>,
  authorizationSignatures: string[],
): Promise<{ hash?: string; transaction_id?: string }> {
  const requestExpiry = String(Date.now() + 5 * 60_000);
  const result = await privyRequest<{ data?: { hash?: string; transaction_id?: string } }>(
    'POST',
    `/v1/wallets/${walletId}/rpc`,
    rpcBody,
    { authorizationSignatures, requestExpiry },
  );
  return result.data ?? {};
}

export async function signRpcBodyWithPrivateKey(
  walletId: string,
  rpcBody: Record<string, unknown>,
  privateKeyMaterial: string,
  requestExpiry?: string,
): Promise<string> {
  const expiry = requestExpiry ?? String(Date.now() + 24 * 60 * 60_000);
  const payload = buildPrivySignPayload('POST', privyRpcUrl(walletId), rpcBody, appId(), {
    requestExpiry: expiry,
  });
  return signPrivyAuthorizationPayload(payload, privateKeyMaterial);
}

/** Exchange user JWT for ephemeral authorization key and sign (HPKE path skipped — raw if available). */
export async function signRpcBodyWithUserJwt(
  walletId: string,
  rpcBody: Record<string, unknown>,
  userJwt: string,
): Promise<string | null> {
  try {
    const { generateKeyPairSync } = await import('node:crypto');
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    const recipientPublicKey = spkiDer.toString('base64');

    const authRes = await privyRequest<{
      authorization_key?: string;
      encrypted_authorization_key?: { encapsulated_key: string; ciphertext: string };
    }>('POST', '/v1/wallets/authenticate', {
      user_jwt: userJwt,
      encryption_type: 'HPKE',
      recipient_public_key: recipientPublicKey,
    });

    let authKeyMaterial: string | null = authRes.authorization_key ?? null;
    if (!authKeyMaterial && authRes.encrypted_authorization_key) {
      // HPKE decrypt — requires @hpke; fall back to null so client can pass signature
      console.warn('[privy] HPKE user key decrypt not implemented; pass authorizationSignature from client');
      return null;
    }
    if (!authKeyMaterial) return null;
    return signRpcBodyWithPrivateKey(walletId, rpcBody, authKeyMaterial);
  } catch (e) {
    console.warn('[privy] signRpcBodyWithUserJwt:', e);
    return null;
  }
}
