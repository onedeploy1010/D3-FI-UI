import { ApiKeyStamper } from 'https://esm.sh/@turnkey/api-key-stamper@0.4.4';
import { getActivityEnvelope, isTurnkeyConfigured } from './turnkey.ts';

type TurnkeyActivity = {
  id: string;
  organizationId: string;
  status: string;
  type: string;
  fingerprint: string;
  canApprove: boolean;
  canReject: boolean;
  votes?: Array<{
    userId?: string;
    user?: { userId?: string; userName?: string };
    vote?: string;
  }>;
  createdAt?: { seconds?: string };
};

type TurnkeyUser = {
  userId: string;
  userName: string;
  userEmail?: string;
  apiKeys: Array<{
    apiKeyId: string;
    apiKeyName: string;
    credential?: { publicKey?: string };
  }>;
  authenticators: unknown[];
};

type TurnkeyOrganization = {
  organizationId: string;
  organizationName?: string;
  rootQuorum?: { threshold: number; userIds: string[] };
};

function parseOrganization(json: unknown): TurnkeyOrganization {
  const root = json as {
    organization?: TurnkeyOrganization;
    organizationData?: {
      organizationId: string;
      name?: string;
      rootQuorum?: { threshold: number; userIds: string[] };
    };
  };

  if (root.organization) return root.organization;
  if (root.organizationData) {
    return {
      organizationId: root.organizationData.organizationId,
      organizationName: root.organizationData.name,
      rootQuorum: root.organizationData.rootQuorum,
    };
  }
  throw new Error('get_organization returned no organization');
}

async function stampRequest(
  base: 'query' | 'submit',
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const apiPublicKey = Deno.env.get('TURNKEY_API_PUBLIC_KEY')!;
  const apiPrivateKey = Deno.env.get('TURNKEY_API_PRIVATE_KEY')!;
  const bodyStr = JSON.stringify(body);
  const stamper = new ApiKeyStamper({ apiPublicKey, apiPrivateKey });
  const { stampHeaderValue } = await stamper.stamp(bodyStr);

  const res = await fetch(`https://api.turnkey.com/public/v1/${base}/${path}`, {
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
      (json as { message?: string }).message ?? `Turnkey ${base}/${path} failed (${res.status})`,
    );
  }
  return json;
}

function orgId(): string {
  const id = Deno.env.get('TURNKEY_ORGANIZATION_ID');
  if (!id) throw new Error('TURNKEY_ORGANIZATION_ID not configured');
  return id;
}

function apiPublicKey(): string {
  const key = Deno.env.get('TURNKEY_API_PUBLIC_KEY');
  if (!key) throw new Error('TURNKEY_API_PUBLIC_KEY not configured');
  return key;
}

export async function getTurnkeyOrganization(): Promise<TurnkeyOrganization> {
  const json = await stampRequest('query', 'get_organization', {
    organizationId: orgId(),
  });
  return parseOrganization(json);
}

export async function listTurnkeyUsers(): Promise<TurnkeyUser[]> {
  const json = (await stampRequest('query', 'list_users', {
    organizationId: orgId(),
  })) as { users?: TurnkeyUser[] };
  return json.users ?? [];
}

export function findUserForApiPublicKey(users: TurnkeyUser[], publicKey: string): TurnkeyUser | null {
  const normalized = publicKey.toLowerCase();
  for (const user of users) {
    for (const key of user.apiKeys ?? []) {
      const pk = key.credential?.publicKey?.toLowerCase();
      if (pk && pk === normalized) return user;
    }
  }
  return null;
}

export async function listConsensusActivities(limit = '50'): Promise<TurnkeyActivity[]> {
  const json = (await stampRequest('query', 'list_activities', {
    organizationId: orgId(),
    filterByStatus: ['ACTIVITY_STATUS_CONSENSUS_NEEDED'],
    paginationOptions: { limit },
  })) as { activities?: TurnkeyActivity[] };
  return json.activities ?? [];
}

export async function approveActivityByFingerprint(fingerprint: string): Promise<{
  activityId?: string;
  status?: string;
  failure?: string;
}> {
  const json = await stampRequest('submit', 'approve_activity', {
    type: 'ACTIVITY_TYPE_APPROVE_ACTIVITY',
    timestampMs: String(Date.now()),
    organizationId: orgId(),
    parameters: { fingerprint },
  });

  const envelope = getActivityEnvelope(json);
  return {
    activityId: envelope.activityId,
    status: envelope.status,
    failure: envelope.failure,
  };
}

export type ConsensusDiagnostics = {
  organizationId: string;
  organizationName?: string;
  rootQuorum: { threshold: number; userIds: string[]; memberNames: string[] };
  apiKeyUser: {
    userId: string;
    userName: string;
    userEmail?: string;
    inRootQuorum: boolean;
    apiKeyCount: number;
    authenticatorCount: number;
  } | null;
  quorumMembers: Array<{
    userId: string;
    userName: string;
    userEmail?: string;
    apiKeyCount: number;
    authenticatorCount: number;
    isApiKeyUser: boolean;
  }>;
  pendingActivities: Array<{
    id: string;
    type: string;
    status: string;
    fingerprint: string;
    canApprove: boolean;
    voteCount: number;
    voters: string[];
  }>;
  pathCReady: boolean;
  recommendations: string[];
};

export async function getConsensusDiagnostics(): Promise<ConsensusDiagnostics> {
  if (!isTurnkeyConfigured()) {
    throw new Error('Turnkey is not configured');
  }

  const [org, users, activities] = await Promise.all([
    getTurnkeyOrganization(),
    listTurnkeyUsers(),
    listConsensusActivities(),
  ]);

  const apiUser = findUserForApiPublicKey(users, apiPublicKey());
  const quorumUserIds = org.rootQuorum?.userIds ?? [];
  const userNameById = new Map(users.map((u) => [u.userId, u.userName]));

  const recommendations: string[] = [];
  const inQuorum = apiUser ? quorumUserIds.includes(apiUser.userId) : false;

  if (!apiUser) {
    recommendations.push(
      'Backend API public key does not match any Turnkey user — create_api_only_users or attach this key to a root user.',
    );
  } else if (!inQuorum) {
    recommendations.push(
      `API user "${apiUser.userName}" is not in root quorum — add them via update_root_quorum (needs existing quorum approval).`,
    );
  } else if (apiUser.authenticatorCount > 0 && quorumUserIds.length >= 2) {
    recommendations.push(
      `API key belongs to "${apiUser.userName}" who also has a Passkey — this cannot be the 2nd quorum vote after admin approves in Dashboard. Use a separate quorum member API key (set TURNKEY_COSIGNER_API_*).`,
    );
  } else if (activities.some((a) => a.canApprove)) {
    recommendations.push('API user can approve pending activities — run approve-consensus.');
  } else if (activities.length > 0) {
    recommendations.push(
      'Pending activities exist but canApprove=false for this API key — another quorum member must vote first, or API user already voted.',
    );
  } else {
    recommendations.push('No CONSENSUS_NEEDED activities — quorum may already be clear.');
  }

  const threshold = org.rootQuorum?.threshold ?? 0;
  const pathCReady = Boolean(
    apiUser &&
      inQuorum &&
      threshold >= 2 &&
      apiUser.authenticatorCount === 0,
  );

  const quorumMembers = quorumUserIds.map((id) => {
    const user = users.find((u) => u.userId === id);
    return {
      userId: id,
      userName: user?.userName ?? id,
      userEmail: user?.userEmail,
      apiKeyCount: user?.apiKeys?.length ?? 0,
      authenticatorCount: user?.authenticators?.length ?? 0,
      isApiKeyUser: user?.userId === apiUser?.userId,
    };
  });

  return {
    organizationId: org.organizationId,
    organizationName: org.organizationName,
    rootQuorum: {
      threshold,
      userIds: quorumUserIds,
      memberNames: quorumUserIds.map((id) => userNameById.get(id) ?? id),
    },
    apiKeyUser: apiUser
      ? {
          userId: apiUser.userId,
          userName: apiUser.userName,
          userEmail: apiUser.userEmail,
          inRootQuorum: inQuorum,
          apiKeyCount: apiUser.apiKeys?.length ?? 0,
          authenticatorCount: apiUser.authenticators?.length ?? 0,
        }
      : null,
    quorumMembers,
    pendingActivities: activities.map((a) => ({
      id: a.id,
      type: a.type,
      status: a.status,
      fingerprint: a.fingerprint,
      canApprove: a.canApprove,
      voteCount: a.votes?.length ?? 0,
      voters: (a.votes ?? []).map(
        (v) => v.user?.userName ?? v.userId ?? v.user?.userId ?? 'unknown',
      ),
    })),
    pathCReady,
    recommendations,
  };
}

export async function approveAllConsensusActivities(): Promise<{
  attempted: number;
  approved: Array<{ activityId: string; fingerprint: string; status?: string }>;
  skipped: Array<{ activityId: string; reason: string }>;
  errors: Array<{ activityId: string; fingerprint: string; error: string }>;
}> {
  const activities = await listConsensusActivities();
  const approved: Array<{ activityId: string; fingerprint: string; status?: string }> = [];
  const skipped: Array<{ activityId: string; reason: string }> = [];
  const errors: Array<{ activityId: string; fingerprint: string; error: string }> = [];

  for (const activity of activities) {
    if (!activity.canApprove) {
      skipped.push({
        activityId: activity.id,
        reason: 'canApprove=false (already voted or not in quorum)',
      });
      continue;
    }

    try {
      const result = await approveActivityByFingerprint(activity.fingerprint);
      approved.push({
        activityId: activity.id,
        fingerprint: activity.fingerprint,
        status: result.status,
      });
    } catch (e) {
      errors.push({
        activityId: activity.id,
        fingerprint: activity.fingerprint,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { attempted: activities.length, approved, skipped, errors };
}
