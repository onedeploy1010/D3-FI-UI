import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'npm:jose@6';
import { HttpError } from './wallet.ts';

const appId = Deno.env.get('PRIVY_APP_ID') ?? '';
const jwksUrl =
  Deno.env.get('PRIVY_JWKS_URL') ??
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

export type PrivyAccessClaims = JWTPayload & { sub: string; sid?: string };

export async function verifyPrivyAccessToken(token: string): Promise<PrivyAccessClaims> {
  if (!appId) throw new Error('PRIVY_APP_ID not configured');
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: 'privy.io',
    audience: appId,
  });
  if (!payload.sub) throw new Error('Missing sub claim');
  return payload as PrivyAccessClaims;
}

export function getPrivyToken(req: Request): string | null {
  const header = req.headers.get('x-privy-token')?.trim();
  return header || null;
}

/** Require valid Privy JWT; returns claims. Skipped when PRIVY_APP_ID unset (local dev). */
export async function requirePrivyAuth(req: Request): Promise<PrivyAccessClaims | null> {
  if (!isPrivyAuthConfigured()) return null;
  const token = getPrivyToken(req);
  if (!token) throw new HttpError(401, 'Privy access token required (X-Privy-Token)');
  try {
    return await verifyPrivyAccessToken(token);
  } catch (e) {
    throw new HttpError(401, e instanceof Error ? e.message : 'Invalid Privy token');
  }
}
