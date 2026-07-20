/**
 * Add the missing ALLOW policy so the backend API user (d3finance@hotmail.com)
 * can INITIATE a treasury outflow, while EXECUTION still requires 2 of the 3
 * root signers (the Gmail quorum) to approve in the Turnkey panel.
 *
 * Without this policy a treasury SIGN_TRANSACTION matches only
 * `d3-backend-deny-everything-else` → "insufficient permissions". With it, the
 * submission returns CONSENSUS_NEEDED and waits for the 2/3 quorum.
 *
 *   npx tsx scripts/turnkey-treasury-proposer-policy.ts            # dry-run
 *   npx tsx scripts/turnkey-treasury-proposer-policy.ts --execute  # create it
 */
import { config } from 'dotenv';
import { ApiKeyStamper } from '@turnkey/api-key-stamper';

config();

const EXECUTE = process.argv.includes('--execute');

const creds = {
  orgId: process.env.TURNKEY_ORGANIZATION_ID!,
  apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
  apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
};

// The 3 root signers (root quorum, threshold 2).
const ROOT_USER_IDS = [
  'eda9c451-aaef-4488-974c-c3e67baf8dbd', // DA  y13311119143@gmail.com
  '2825481a-5ae2-41a5-90f5-de855640c9a7', // Ye  lihui552713@gmail.com
  'c8c18268-8418-4389-899e-db807a48c897', // DADA bigtree777888@gmail.com
];

const POLICY_NAME = 'd3-backend-proposer-2of3';

// Require >=2 of the 3 root signers to approve. `condition: true` makes this a
// GENERAL proposer policy: d3finance may INITIATE any activity (create wallet,
// create policy, sign a treasury tx, update quorum, …) but it only executes once
// 2 of the 3 root signers approve — the 2/3 humans remain the real gate.
const consensus =
  `approvers.filter(user, ${ROOT_USER_IDS.map((id) => `user.id == '${id}'`).join(' || ')}).count() >= 2`;
const condition = 'true';

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
  console.log('Policy name :', POLICY_NAME);
  console.log('effect      : EFFECT_ALLOW');
  console.log('consensus   :', consensus);
  console.log('condition   :', condition);
  console.log('');

  // Idempotency: skip if a policy with this name already exists.
  const list = await tk('query', 'list_policies', { organizationId: creds.orgId });
  const existing = (list.policies ?? []).find((p: { policyName?: string }) => p.policyName === POLICY_NAME);
  if (existing) {
    console.log('✓ Policy already exists, id =', existing.policyId, '— nothing to do.');
    return;
  }

  if (!EXECUTE) {
    console.log('DRY RUN — re-run with --execute to create the policy.');
    return;
  }

  const body = {
    type: 'ACTIVITY_TYPE_CREATE_POLICY_V3',
    timestampMs: String(Date.now()),
    organizationId: creds.orgId,
    parameters: {
      policyName: POLICY_NAME,
      effect: 'EFFECT_ALLOW',
      consensus,
      condition,
      notes:
        'Treasury outflow: backend (d3finance) may INITIATE; execution requires 2 of 3 root signers. Any BSC tx from the treasury wallet.',
    },
  };

  const json = await tk('submit', 'create_policy', body);
  const activity = json.activity ?? {};
  console.log('Activity id     :', activity.id);
  console.log('Activity status :', activity.status);
  if (activity.status === 'ACTIVITY_STATUS_COMPLETED') {
    const pid = activity.result?.createPolicyResult?.policyId ?? activity.result?.createPolicyResultV3?.policyId;
    console.log('✓ Policy created, id =', pid);
  } else if (activity.status === 'ACTIVITY_STATUS_CONSENSUS_NEEDED') {
    console.log(
      '⚠ Policy creation itself needs 2/3 root approval (because the backend is no longer a root).',
    );
    console.log('  → Have 2 of the 3 Gmail signers approve this pending activity in the Turnkey panel.');
  } else {
    console.log('Full response:', JSON.stringify(json).slice(0, 800));
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
