import { supabase } from './supabase';

const base = () => {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  if (!url) throw new Error('VITE_SUPABASE_URL not configured');
  return `${url}/functions/v1/admin`;
};

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error('未登录');
  return t;
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await token()}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? res.statusText);
  return body as T;
}

export type MemberRow = {
  walletAddress: string;
  isPartner: boolean;
  sd3Balance: number;
  pendingUsdtYield: number;
  marketLeaderStatus: string;
  joinedAt: string | null;
  sponsorWallet: string | null;
  teamPerformanceUsd: number;
  personalPerformanceUsd: number;
  dailyNewPerformanceUsd: number;
};

export type SubsidyTicket = {
  id: string;
  wallet_address: string;
  kind: string;
  amount_usd: number | null;
  purpose: string;
  status: string;
  team_performance_usd: number;
  daily_new_performance_usd: number;
  personal_performance_usd: number;
  applied_at: string;
  admin_note?: string | null;
};

export type SubsidyMessage = {
  id: string;
  ticket_id: string;
  author_type: string;
  author_name: string | null;
  body: string;
  created_at: string;
};

// ---- Security / Circuit-Breaker ----

export type PauseFlag = {
  flag: string;
  paused: boolean;
  reason: string | null;
  updated_at: string | null;
  auto_paused?: boolean;
};

export type RiskLimits = Record<string, number | string | boolean | null>;

export type SecuritySolvency = {
  ratio: number;
  liabilityUsdt: number;
  flashSwapReserveUsdt: number;
  healthy: boolean;
};

export type SecurityAlertCounts = { P0: number; P1: number; P2: number; P3: number };

export type SecurityOverview = {
  pauseFlags: PauseFlag[];
  limits: RiskLimits;
  solvency: SecuritySolvency;
  alertCounts: SecurityAlertCounts;
};

export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type AlertStatus = 'open' | 'ack' | 'resolved';

export type SecurityAlert = {
  id: string;
  severity: AlertSeverity;
  rule_id: string;
  title: string | null;
  detail?: unknown;
  entity_type?: string | null;
  entity_id?: string | null;
  status: AlertStatus;
  auto_paused?: boolean;
  created_at: string;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
};

export function getSecurityOverview() {
  return adminFetch<SecurityOverview>('/security/overview');
}

export function listSecurityAlerts(params?: { status?: string; severity?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== 'all') qs.set('status', params.status);
  if (params?.severity && params.severity !== 'all') qs.set('severity', params.severity);
  const q = qs.toString();
  return adminFetch<{ rows: SecurityAlert[] }>(`/security/alerts${q ? `?${q}` : ''}`);
}

export function ackAlert(id: string) {
  return adminFetch<{ ok?: boolean }>(`/security/alerts/${id}/ack`, { method: 'POST' });
}

export function pause(flag: string, reason: string) {
  return adminFetch<{ ok?: boolean }>('/security/pause', {
    method: 'POST',
    body: JSON.stringify({ flag, reason }),
  });
}

export function unpause(flag: string, reason: string) {
  // maker-checker: returns a pending approval (202); a second admin must approve.
  return adminFetch<{ ok?: boolean; approvalId?: string; pending?: boolean }>('/security/unpause', {
    method: 'POST',
    body: JSON.stringify({ flag, reason }),
  });
}

export function getRiskLimits() {
  return adminFetch<{ limits: RiskLimits }>('/security/limits');
}

export function updateRiskLimits(patch: Record<string, unknown>) {
  // maker-checker: returns a pending approval.
  return adminFetch<{ ok?: boolean; approvalId?: string; pending?: boolean }>('/security/limits', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

// ---- Member detail bundle ----
// NOTE: DB columns keep the historical `sd3` naming; the UI everywhere says UD3.

export type MemberProfile = {
  displayName: string | null;
  remark: string | null;
  createdAt: string | null;
};

export type MemberStakeSummary = {
  count: number;
  usdtPrincipal: number;
  ud3Principal: number;
  activeCount: number;
};

export type MemberBalances = {
  ud3Balance: number;
  pendingUd3: number;
  pendingD3Yield: number;
};

export type MemberReferralSummary = {
  sponsorWallet: string | null;
  directCount: number;
  teamCount: number;
  bigAreaPerfUsdt: number;
  smallAreaPerfUsdt: number;
  sLevel: string | null;
  vLevel: string | null;
};

export type MemberDetail = {
  wallet: string;
  profile: MemberProfile;
  marketLeaderStatus: string;
  isPartner: boolean;
  stakeSummary: MemberStakeSummary;
  balances: MemberBalances;
  referral: MemberReferralSummary;
};

export function getMember(wallet: string) {
  return adminFetch<MemberDetail>(`/members/${wallet}`);
}

export function setMemberRemark(wallet: string, remark: string) {
  return adminFetch<{ ok?: boolean }>(`/members/${wallet}`, {
    method: 'PATCH',
    body: JSON.stringify({ remark }),
  });
}

export function setMemberLeader(wallet: string, isLeader: boolean, reason: string) {
  // maker-checker: returns a pending approval; a second admin must approve.
  return adminFetch<{ ok?: boolean; approvalId?: string; pending?: boolean }>(
    `/members/${wallet}/leader`,
    {
      method: 'POST',
      body: JSON.stringify({ isLeader, reason }),
    },
  );
}

// ---- Referral tree ----

export type ReferralTreeNode = {
  wallet: string;
  directCount: number;
  teamCount: number;
  bigAreaPerfUsdt: number;
  smallAreaPerfUsdt: number;
  sLevel: string | null;
  vLevel: string | null;
  isPartner: boolean;
  children?: ReferralTreeNode[];
};

// Backend returns a nested { node, children:[{node,children}...] } tree; the UI
// wants a flat { ...node, children:[...] } under `root`. Fetch + flatten here.
type BackendTreeNode = Omit<ReferralTreeNode, 'children'>;
type BackendTree = { node: BackendTreeNode; children: BackendTree[] };
function flattenReferralTree(t: BackendTree): ReferralTreeNode {
  return { ...t.node, children: (t.children ?? []).map(flattenReferralTree) };
}
export async function getReferralTree(root: string, depth = 3): Promise<{ root: ReferralTreeNode }> {
  const r = await adminFetch<BackendTree>(`/referrals/tree?root=${root}&depth=${depth}`);
  return { root: flattenReferralTree(r) };
}

// ---- Transactions & stakes (Transactions page) ----

export type TransactionType = 'flash_swap' | 'ud3_transfer';

export type TransactionRow = {
  id: string;
  type: TransactionType;
  wallet: string;
  counterparty: string | null;
  amountUsdt: number | null;
  amountUd3: number | null;
  feeUsdt: number | null;
  status: string;
  txHash: string | null;
  createdAt: string;
};

export function getTransactions(params: {
  type: TransactionType;
  wallet?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  qs.set('type', params.type);
  if (params.wallet) qs.set('wallet', params.wallet);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  return adminFetch<{ rows: TransactionRow[]; total?: number }>(`/transactions?${qs.toString()}`);
}

export type StakeKind = 'usdt' | 'ud3';

export type StakeRow = {
  id: string;
  wallet: string;
  kind: StakeKind;
  principalUsdt: number;
  principalUd3: number;
  dailyYield: number;
  status: string;
  createdAt: string;
};

// ---- Order UD3 (反向金) reward distribution (Stakes page dialog) ----
// Backend keys on stake_intents.id (partner_stake_positions.intent_id). All
// numeric fields arrive as strings so precision is preserved — never Number()
// them for display; format from the string. DB keeps 反向金 as UD3.

export type Ud3RewardGuide = {
  wallet: string | null;
  level: string | null;
  /** Equity ratio as a decimal string, e.g. '1.1' → 110%. */
  levelRate: string | null;
  amount: string | null;
  status: string;
};

export type Ud3RewardNetworkNode = {
  wallet: string | null;
  relationDepth: number | null;
  level: string | null;
  cumulativeRate: string | null;
  previousReleasedRate: string | null;
  differenceRate: string | null;
  amount: string | null;
  status: string;
};

export type OrderUd3Reward = {
  ok: boolean;
  found: boolean;
  order?: {
    intentId: string | null;
    depositorWallet: string | null;
    referrerWallet: string | null;
    principalUsdt: string | null;
    bribeRatePct: string | null;
    totalBribeUd3: string | null;
  };
  guide?: Ud3RewardGuide | null;
  network?: Ud3RewardNetworkNode[];
  networkTotalUd3?: string;
  burnUd3?: string;
  totalUd3?: string;
  configVersion?: string | null;
  conserved?: boolean;
};

export function getOrderUd3Reward(intentId: string) {
  return adminFetch<OrderUd3Reward>(`/orders/${intentId}/ud3-reward`);
}

export function getStakes(params: {
  kind?: StakeKind;
  wallet?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params.kind) qs.set('kind', params.kind);
  if (params.wallet) qs.set('wallet', params.wallet);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  const q = qs.toString();
  return adminFetch<{ rows: StakeRow[]; total?: number }>(`/stakes${q ? `?${q}` : ''}`);
}

// ---- Roles & permissions (Roles page — backend may 404 until it lands) ----

export type AdminRole = 'owner' | 'admin' | 'operator' | 'viewer' | string;

export type AdminUser = {
  userId: string;
  email: string | null;
  username: string | null;
  role: AdminRole;
  permissions: string[];
  createdAt: string | null;
};

export type PermissionDef = {
  key: string;
  label: string;
  group?: string | null;
};

export function listAdmins() {
  return adminFetch<{ rows: AdminUser[] }>('/admins');
}

export function updateAdmin(
  userId: string,
  patch: { role?: AdminRole; permissions?: string[] },
) {
  return adminFetch<{ ok?: boolean; approvalId?: string; pending?: boolean }>(
    `/admins/${userId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  );
}

export function listPermissions() {
  return adminFetch<{ rows: PermissionDef[] }>('/permissions');
}
