/**
 * Path C: diagnose Turnkey quorum + programmatic approve_activity (2nd vote via API user).
 *
 * Usage:
 *   npm run treasury:path-c              # diagnose only
 *   npm run treasury:path-c -- approve   # approve all pending where canApprove=true
 *
 * Requires in .env (or env):
 *   TURNKEY_ORGANIZATION_ID
 *   TURNKEY_API_PUBLIC_KEY
 *   TURNKEY_API_PRIVATE_KEY
 *
 * Optional (calls deployed Edge Function instead of Turnkey directly):
 *   TREASURY_CRON_SECRET
 *   SUPABASE_URL
 */
import { config } from 'dotenv';
import { ApiKeyStamper } from '@turnkey/api-key-stamper';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', '.env') });

const orgId = process.env.TURNKEY_ORGANIZATION_ID?.trim();
const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY?.trim();
const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY?.trim();
const cronSecret = process.env.TREASURY_CRON_SECRET?.trim();
const supabaseUrl =
  process.env.SUPABASE_URL?.trim() ?? 'https://gvyvdnegsxiykxffddwb.supabase.co';
const mode = process.argv[2] === 'approve' ? 'approve' : 'diagnose';

async function stampRequest(
  base: 'query' | 'submit',
  apiPath: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  if (!apiPublicKey || !apiPrivateKey) {
    throw new Error('Missing TURNKEY_API_PUBLIC_KEY or TURNKEY_API_PRIVATE_KEY');
  }
  const bodyStr = JSON.stringify(body);
  const stamper = new ApiKeyStamper({ apiPublicKey, apiPrivateKey });
  const { stampHeaderValue } = await stamper.stamp(bodyStr);

  const res = await fetch(`https://api.turnkey.com/public/v1/${base}/${apiPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Stamp': stampHeaderValue,
    },
    body: bodyStr,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { message?: string }).message ?? `Turnkey ${base}/${apiPath} failed (${res.status})`,
    );
  }
  return json;
}

async function viaEdgeFunction(action: 'status' | 'approve'): Promise<unknown> {
  if (!cronSecret) throw new Error('Missing TREASURY_CRON_SECRET for Edge Function call');
  const endpoint =
    action === 'approve'
      ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/treasury/admin/turnkey/approve-consensus`
      : `${supabaseUrl.replace(/\/$/, '')}/functions/v1/treasury/admin/turnkey/consensus-status`;

  const res = await fetch(endpoint, {
    method: action === 'approve' ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Treasury-Cron-Secret': cronSecret,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json;
}

async function diagnoseDirect() {
  if (!orgId) throw new Error('Missing TURNKEY_ORGANIZATION_ID');

  const [orgJson, usersJson, activitiesJson] = await Promise.all([
    stampRequest('query', 'get_organization', { organizationId: orgId }),
    stampRequest('query', 'list_users', { organizationId: orgId }),
    stampRequest('query', 'list_activities', {
      organizationId: orgId,
      filterByStatus: ['ACTIVITY_STATUS_CONSENSUS_NEEDED'],
      paginationOptions: { limit: '50' },
    }),
  ]);

  const org = (orgJson as {
    organization?: { organizationName?: string; rootQuorum?: { threshold: number; userIds: string[] } };
    organizationData?: { name?: string; rootQuorum?: { threshold: number; userIds: string[] } };
  }).organization ?? (orgJson as { organizationData?: { name?: string; rootQuorum?: { threshold: number; userIds: string[] } } }).organizationData;
  const users =
    (usersJson as { users?: Array<{ userId: string; userName: string; userEmail?: string; apiKeys: Array<{ credential?: { publicKey?: string } }>; authenticators: unknown[] }> })
      .users ?? [];
  const activities =
    (activitiesJson as {
      activities?: Array<{
        id: string;
        type: string;
        status: string;
        fingerprint: string;
        canApprove: boolean;
        votes?: Array<{ user?: { userName?: string } }>;
      }>;
    }).activities ?? [];

  const apiUser = users.find((u) =>
    u.apiKeys?.some((k) => k.credential?.publicKey?.toLowerCase() === apiPublicKey?.toLowerCase()),
  );
  const quorumIds = org?.rootQuorum?.userIds ?? [];
  const inQuorum = apiUser ? quorumIds.includes(apiUser.userId) : false;

  console.log('=== Turnkey Path C Diagnostics ===\n');
  console.log(`Organization: ${org?.organizationName ?? orgId}`);
  console.log(
    `Root quorum:  ${org?.rootQuorum?.threshold ?? '?'} of ${quorumIds.length} — [${quorumIds
      .map((id) => users.find((u) => u.userId === id)?.userName ?? id)
      .join(', ')}]`,
  );
  for (const id of quorumIds) {
    const u = users.find((x) => x.userId === id);
    if (!u) continue;
    console.log(
      `  - ${u.userName}: passkeys=${u.authenticators?.length ?? 0}, apiKeys=${u.apiKeys?.length ?? 0}`,
    );
  }
  console.log(
    `API user:     ${apiUser ? `${apiUser.userName} (${apiUser.userId})` : 'NOT FOUND — key not linked to any user'}`,
  );
  console.log(
    `In quorum:    ${inQuorum ? 'YES' : 'NO'} | passkeys: ${apiUser?.authenticators?.length ?? 0} | api keys: ${apiUser?.apiKeys?.length ?? 0}`,
  );
  console.log(`\nPending CONSENSUS_NEEDED: ${activities.length}\n`);

  for (const a of activities) {
    console.log(`  • ${a.type}`);
    console.log(`    id: ${a.id}`);
    console.log(`    canApprove: ${a.canApprove} | votes: ${a.votes?.length ?? 0}`);
    console.log(`    fingerprint: ${a.fingerprint.slice(0, 24)}…`);
  }

  if (!apiUser) {
    console.log('\n→ Blocked: backend API key is not attached to a Turnkey user.');
  } else if (apiUser.authenticators?.length && quorumIds.length >= 2) {
    console.log(
      '\n→ Blocked for Path C: d3 API key is on the same user as admin Passkey — cannot be the 2nd vote.',
    );
    console.log(
      '  Use quorum member "it" API private key via TURNKEY_COSIGNER_API_PUBLIC_KEY / TURNKEY_COSIGNER_API_PRIVATE_KEY.',
    );
  } else if (!inQuorum) {
    console.log('\n→ Blocked: API user is not in root quorum (need update_root_quorum first).');
  } else if (activities.some((a) => a.canApprove)) {
    console.log('\n→ Ready: run `npm run treasury:path-c -- approve` to cast API votes.');
  } else if (activities.length > 0) {
    console.log('\n→ Waiting: admin (or another member) must vote first, or API user already voted.');
  } else {
    console.log('\n→ No pending consensus activities.');
  }

  return { apiUser, inQuorum, activities };
}

async function approveWithKeys(publicKey: string, privateKey: string, label: string) {
  const bodyStr = JSON.stringify({
    type: 'ACTIVITY_TYPE_APPROVE_ACTIVITY',
    timestampMs: String(Date.now()),
    organizationId: orgId,
    parameters: { fingerprint: '' },
  });
  // activities fetched separately
  const stamper = new ApiKeyStamper({ apiPublicKey: publicKey, apiPrivateKey: privateKey });
  const activitiesJson = await (async () => {
    const listBody = { organizationId: orgId, filterByStatus: ['ACTIVITY_STATUS_CONSENSUS_NEEDED'], paginationOptions: { limit: '50' } };
    const listStr = JSON.stringify(listBody);
    const { stampHeaderValue } = await stamper.stamp(listStr);
    const res = await fetch('https://api.turnkey.com/public/v1/query/list_activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Stamp': stampHeaderValue },
      body: listStr,
    });
    return res.json();
  })();
  const activities = (activitiesJson as { activities?: Array<{ id: string; type: string; fingerprint: string; canApprove: boolean }> }).activities ?? [];
  const approvable = activities.filter((a) => a.canApprove);
  console.log(`\n=== ${label}: approving ${approvable.length} activity(ies) ===\n`);
  for (const a of approvable) {
    const approveBody = {
      type: 'ACTIVITY_TYPE_APPROVE_ACTIVITY',
      timestampMs: String(Date.now()),
      organizationId: orgId,
      parameters: { fingerprint: a.fingerprint },
    };
    const approveStr = JSON.stringify(approveBody);
    const { stampHeaderValue } = await stamper.stamp(approveStr);
    const res = await fetch('https://api.turnkey.com/public/v1/submit/approve_activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Stamp': stampHeaderValue },
      body: approveStr,
    });
    const json = await res.json().catch(() => ({}));
    const status = (json as { activity?: { status?: string } }).activity?.status;
    if (!res.ok) {
      console.log(`  ✗ ${a.type}: ${(json as { message?: string }).message ?? res.status}`);
    } else {
      console.log(`  ✓ ${a.type} → ${status ?? 'submitted'}`);
    }
  }
}

async function approveDirect() {
  await diagnoseDirect();

  const cosignerPublic = process.env.TURNKEY_COSIGNER_API_PUBLIC_KEY?.trim();
  const cosignerPrivate = process.env.TURNKEY_COSIGNER_API_PRIVATE_KEY?.trim();
  if (cosignerPublic && cosignerPrivate) {
    await approveWithKeys(cosignerPublic, cosignerPrivate, 'Cosigner API key');
  } else if (apiPublicKey && apiPrivateKey) {
    await approveWithKeys(apiPublicKey, apiPrivateKey, 'Primary API key');
  }

  console.log('\nRe-checking status...\n');
  await diagnoseDirect();
}

async function main() {
  if (cronSecret && orgId && apiPublicKey && apiPrivateKey) {
    try {
      const json = await viaEdgeFunction(mode === 'approve' ? 'approve' : 'status');
      console.log(JSON.stringify(json, null, 2));
      return;
    } catch (e) {
      console.warn(
        `Edge Function call failed (${e instanceof Error ? e.message : String(e)}), falling back to direct Turnkey API.\n`,
      );
    }
  }

  if (!orgId || !apiPublicKey || !apiPrivateKey) {
    console.error('Set TURNKEY_ORGANIZATION_ID, TURNKEY_API_PUBLIC_KEY, TURNKEY_API_PRIVATE_KEY');
    process.exit(1);
  }

  if (mode === 'approve') {
    await approveDirect();
  } else {
    await diagnoseDirect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
