import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const appId = process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID ?? '';
const jwksUrl =
  process.env.PRIVY_JWKS_URL ??
  (appId ? `https://auth.privy.io/api/v1/apps/${appId}/jwks.json` : '');

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export function isPrivyAuthConfigured(): boolean {
  return Boolean(appId && jwksUrl);
}

function getJwks() {
  if (!jwksUrl) throw new Error('PRIVY_JWKS_URL not configured');
  if (!jwks) jwks = createRemoteJWKSet(new URL(jwksUrl));
  return jwks;
}

export type PrivyAccessClaims = JWTPayload & {
  sub: string;
  sid?: string;
};

export async function verifyPrivyAccessToken(token: string): Promise<PrivyAccessClaims> {
  if (!appId) throw new Error('PRIVY_APP_ID not configured');

  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: 'privy.io',
    audience: appId,
  });

  if (!payload.sub) throw new Error('Missing sub claim');
  return payload as PrivyAccessClaims;
}

export function getBearerToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith('Bearer ')) return null;
  const token = value.slice(7).trim();
  return token || null;
}
