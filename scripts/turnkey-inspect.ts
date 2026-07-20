/**
 * Read-only Turnkey inspection: list users (id / name / email / root / api keys)
 * and policies (name / effect / consensus / condition). No mutations.
 *
 *   npx tsx scripts/turnkey-inspect.ts
 */
import { config } from 'dotenv';
import { ApiKeyStamper } from '@turnkey/api-key-stamper';

config();

const creds = {
  orgId: process.env.TURNKEY_ORGANIZATION_ID!,
  apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
  apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
};

async function tk(base: 'query' | 'submit', pathName: string, body: Record<string, unknown>) {
  const bodyStr = JSON.stringify(body);
  const stamper = new ApiKeyStamper({ apiPublicKey: creds.apiPublicKey, apiPrivateKey: creds.apiPrivateKey });
  const { stampHeaderValue } = await stamper.stamp(bodyStr);
  const res = await fetch(`https://api.turnkey.com/public/v1/${base}/${pathName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Stamp': stampHeaderValue },
    body: bodyStr,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? `${base}/${pathName} failed (${res.status})`);
  return json;
}

async function main() {
  const backendPub = creds.apiPublicKey.toLowerCase();

  console.log('=== USERS ===');
  const uJson = await tk('query', 'list_users', { organizationId: creds.orgId });
  for (const u of uJson.users ?? []) {
    const isBackend = (u.apiKeys ?? []).some((k: any) => k.credential?.publicKey?.toLowerCase() === backendPub);
    console.log(
      `- ${u.userName ?? '(no name)'} | email=${u.userEmail ?? '-'} | userId=${u.userId} | apiKeys=${(u.apiKeys ?? []).length}${isBackend ? '  <== BACKEND API USER' : ''}`,
    );
  }

  console.log('\n=== ROOT QUORUM ===');
  try {
    const oJson = await tk('query', 'get_organization', { organizationId: creds.orgId });
    const rq = oJson.organizationData?.rootQuorum ?? oJson.rootQuorum;
    console.log(JSON.stringify(rq, null, 2));
  } catch (e) {
    console.log('(get_organization failed:', (e as Error).message, ')');
  }

  console.log('\n=== POLICIES ===');
  const pJson = await tk('query', 'list_policies', { organizationId: creds.orgId });
  for (const p of pJson.policies ?? []) {
    console.log(`\n• ${p.policyName}  [${p.effect}]  id=${p.policyId}`);
    if (p.consensus) console.log(`  consensus: ${p.consensus}`);
    if (p.condition) console.log(`  condition: ${p.condition}`);
    if (p.notes) console.log(`  notes: ${p.notes}`);
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
