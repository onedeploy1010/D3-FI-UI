import Decimal from 'npm:decimal.js@10';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import {
  adminHasPermission,
  requireAdminUser,
  assertCanManageAdmin,
  isValidRole,
  isValidPermissionKey,
  permissionsForRole,
  PERMISSION_CATALOG,
  ROLE_PRESETS,
} from '../_shared/adminAuth.ts';
import {
  collectPartnerDownlineWallets,
  fetchDirectPartnerReferrals,
  fetchPartnerTeamStats,
} from '../_shared/partnerPerformance.ts';
import { startOfSgtDayIso } from '../_shared/partnerTimezone.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { HttpError, shortWallet } from '../_shared/wallet.ts';
import {
  getParams,
  updateParam,
  getHeartbeatConfig,
  updateHeartbeatConfig,
} from '../_shared/systemParams.ts';
import { insertHeartbeatOrder, generateHeartbeatOrderNow } from '../_shared/heartbeatTick.ts';
import {
  computeSubsidyQuota,
  getPartnerProgramSettings,
  setMemberSubsidyRatePct,
  signSubsidyReceiptDownloads,
  updatePartnerProgramSettings,
} from '../_shared/partnerSubsidySettings.ts';
import {
  assertDifferentApprover,
  isPayoutAuthorizingChange,
  writeAdminAudit,
  writeAuditLog,
} from '../_shared/audit.ts';
import { resolveUd3SLevel } from '../_shared/partnerUd3Rules.ts';
import {
  getUd3RewardConfig,
  incrementalRate as ud3IncrementalRate,
  previousCumulativeRate as ud3PreviousCumulativeRate,
  type Ud3RewardConfig,
} from '../_shared/ud3RewardConfig.ts';
import type { AdminProfile } from '../_shared/adminAuth.ts';
import {
  getInfraWalletBalances,
  proposeTreasuryTransfer,
  listTreasuryTransfers,
  broadcastTreasuryTransfer,
} from '../_shared/fundManagement.ts';
import { deriveDepositAccounts } from '../_shared/depositsHd.ts';

type Sb = ReturnType<typeof getSupabaseAdmin>;

function routePath(req: Request): string {
  const url = new URL(req.url);
  let p = url.pathname;
  if (p.startsWith('/admin')) p = p.slice('/admin'.length) || '/';
  return p || '/';
}

async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

function w(addr: string): string {
  return addr.trim().toLowerCase();
}

async function listMembers(sb: Sb, params: URLSearchParams) {
  const search = (params.get('q') ?? '').trim().toLowerCase();
  const limit = Math.min(Number(params.get('limit') ?? 50), 200);
  const offset = Math.max(Number(params.get('offset') ?? 0), 0);

  const walletSet = new Set<string>();

  let refQ = sb
    .from('referrals')
    .select('wallet_address')
    .eq('referral_type', 'partner')
    .order('referred_at', { ascending: false })
    .limit(500);
  if (search) refQ = refQ.ilike('wallet_address', `%${search}%`);
  const { data: refRows } = await refQ;
  for (const r of refRows ?? []) walletSet.add(w(r.wallet_address as string));

  let acctQ = sb
    .from('partner_accounts')
    .select(
      'wallet_address, is_partner, sd3_balance, pending_usdt_yield, market_leader_status, subsidy_rate_pct, team_perf_usdt, small_area_perf_usdt, joined_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(500);
  if (search) acctQ = acctQ.ilike('wallet_address', `%${search}%`);
  const { data: accounts } = await acctQ;
  for (const a of accounts ?? []) walletSet.add(w(a.wallet_address as string));

  const allWallets = [...walletSet].slice(offset, offset + limit);
  const accountMap = new Map(
    (accounts ?? []).map((a) => [w(a.wallet_address as string), a]),
  );

  const referralMap = new Map<string, { sponsor: string | null; referredAt: string | null }>();
  if (allWallets.length) {
    const { data: refs } = await sb
      .from('referrals')
      .select('wallet_address, sponsor_wallet_address, referred_at')
      .in('wallet_address', allWallets)
      .eq('referral_type', 'partner');
    for (const r of refs ?? []) {
      referralMap.set(w(r.wallet_address as string), {
        sponsor: (r.sponsor_wallet_address as string) ?? null,
        referredAt: (r.referred_at as string) ?? null,
      });
    }
  }

  // PERF: 团队业绩 reads the MATERIALIZED team_perf_usdt column (kept fresh by
  // settlement) instead of walking every member's referral subtree per row — that
  // per-member fetchPartnerTeamStats made the member list very slow. 个人业绩 +
  // 当日新增 are computed in ONE batched stake_intents query for all wallets.
  const CREDITED = ['credited', 'completed', 'sweep_pending', 'sweeping'];
  const dayStart = startOfSgtDayIso();
  const personalMap = new Map<string, number>();
  const dailyNewMap = new Map<string, number>();
  if (allWallets.length) {
    const { data: intents } = await sb
      .from('stake_intents')
      .select('wallet_address, amount_usdt, updated_at')
      .in('wallet_address', allWallets)
      .in('status', CREDITED);
    for (const it of intents ?? []) {
      const k = w(it.wallet_address as string);
      const amt = Number(it.amount_usdt ?? 0);
      personalMap.set(k, (personalMap.get(k) ?? 0) + amt);
      if (String(it.updated_at ?? '') >= dayStart) {
        dailyNewMap.set(k, (dailyNewMap.get(k) ?? 0) + amt);
      }
    }
  }

  const rows = allWallets.map((pk) => {
    const a = accountMap.get(pk);
    const ref = referralMap.get(pk);
    return {
      walletAddress: pk,
      isPartner: Boolean(a?.is_partner),
      ud3Balance: Number(a?.sd3_balance ?? 0),
      pendingUsdtYield: Number(a?.pending_usdt_yield ?? 0),
      marketLeaderStatus: a?.market_leader_status ?? 'none',
      subsidyRatePct: a?.subsidy_rate_pct == null ? null : Number(a.subsidy_rate_pct),
      joinedAt: a?.joined_at ?? null,
      createdAt: a?.created_at ?? ref?.referredAt ?? null,
      sponsorWallet: ref?.sponsor ?? null,
      referredAt: ref?.referredAt ?? null,
      teamPerformanceUsd: Number(a?.team_perf_usdt ?? 0),
      smallAreaPerformanceUsd: Number(a?.small_area_perf_usdt ?? 0),
      personalPerformanceUsd: personalMap.get(pk) ?? 0,
      dailyNewPerformanceUsd: dailyNewMap.get(pk) ?? 0,
    };
  });

  return { rows, total: walletSet.size, limit, offset };
}

async function getMemberDetail(sb: Sb, wallet: string) {
  const pk = w(wallet);
  const { data: account } = await sb
    .from('partner_accounts')
    .select('*')
    .ilike('wallet_address', pk)
    .maybeSingle();

  const { data: referral } = await sb
    .from('referrals')
    .select('*')
    .ilike('wallet_address', pk)
    .eq('referral_type', 'partner')
    .maybeSingle();

  const { data: sponsorRow } = referral?.sponsor_wallet_address
    ? await sb
        .from('referrals')
        .select('wallet_address')
        .ilike('wallet_address', referral.sponsor_wallet_address as string)
        .maybeSingle()
    : { data: null };

  const { data: downlines } = await sb
    .from('referrals')
    .select('wallet_address, referred_at, status, performance_weight')
    .ilike('sponsor_wallet_address', pk)
    .eq('referral_type', 'partner')
    .order('referred_at', { ascending: false });

  const { data: stakes } = await sb
    .from('partner_stake_positions')
    .select('*')
    .ilike('wallet_address', pk)
    .order('started_at', { ascending: false });

  const { data: intents } = await sb
    .from('stake_intents')
    .select('*')
    .ilike('wallet_address', pk)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: ud3Transfers } = await sb
    .from('partner_ud3_transfers')
    .select('*')
    .or(`from_wallet.ilike.${pk},to_wallet.ilike.${pk}`)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: yieldSettlements } = await sb
    .from('partner_yield_settlements')
    .select('*')
    .ilike('wallet_address', pk)
    .order('settlement_date', { ascending: false })
    .limit(60);

  const { data: ud3Settlements } = await sb
    .from('partner_sd3_settlements')
    .select('*')
    .ilike('wallet_address', pk)
    .order('settlement_date', { ascending: false })
    .limit(60);

  const { data: withdrawals } = await sb
    .from('partner_yield_withdrawals')
    .select('*')
    .ilike('wallet_address', pk)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: tickets } = await sb
    .from('partner_subsidy_tickets')
    .select('*')
    .ilike('wallet_address', pk)
    .order('applied_at', { ascending: false });

  const stats = await fetchPartnerTeamStats(sb, wallet);

  return {
    account,
    referral,
    sponsorExists: Boolean(sponsorRow),
    downlines: downlines ?? [],
    stakes: stakes ?? [],
    stakeIntents: intents ?? [],
    ud3Transfers: ud3Transfers ?? [],
    yieldSettlements: yieldSettlements ?? [],
    ud3Settlements: ud3Settlements ?? [],
    yieldWithdrawals: withdrawals ?? [],
    subsidyTickets: tickets ?? [],
    teamStats: stats,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Per-wallet referral node used by BOTH the member detail bundle and the
// referral tree. S/V level share one bracket resolution (resolveUd3SLevel);
// bigArea/smallArea come from the team-stats rollup.
type ReferralNode = {
  wallet: string;
  shortWallet: string;
  sponsorWallet: string | null;
  directCount: number;
  teamCount: number;
  bigAreaPerfUsdt: number;
  smallAreaPerfUsdt: number;
  sLevel: string | null;
  vLevel: string | null;
  isPartner: boolean;
  marketLeaderStatus: string;
};

async function buildReferralNode(sb: Sb, wallet: string): Promise<ReferralNode> {
  const pk = w(wallet);
  // PERF: read the MATERIALIZED team/small-area columns instead of fetchPartnerTeamStats
  // (which re-walked the subtree several times PER NODE — the referral tree was slow).
  const [accountRes, referralRes, directs, downline] = await Promise.all([
    sb
      .from('partner_accounts')
      .select('is_partner, market_leader_status, team_perf_usdt, small_area_perf_usdt')
      .ilike('wallet_address', pk)
      .maybeSingle(),
    sb
      .from('referrals')
      .select('sponsor_wallet_address')
      .ilike('wallet_address', pk)
      .eq('referral_type', 'partner')
      .maybeSingle(),
    fetchDirectPartnerReferrals(sb, pk),
    collectPartnerDownlineWallets(sb, pk),
  ]);
  const acct = accountRes.data as
    | { is_partner?: boolean; market_leader_status?: string; team_perf_usdt?: number | null; small_area_perf_usdt?: number | null }
    | null;
  const teamPerf = Number(acct?.team_perf_usdt ?? 0);
  const smallArea = Number(acct?.small_area_perf_usdt ?? 0);
  const sLevel = resolveUd3SLevel({ totalPerfUsdt: teamPerf, smallAreaPerfUsdt: smallArea })?.label ?? null;
  return {
    wallet: pk,
    shortWallet: shortWallet(pk),
    sponsorWallet: (referralRes.data?.sponsor_wallet_address as string) ?? null,
    directCount: directs.length,
    teamCount: downline.length,
    bigAreaPerfUsdt: Math.max(0, Math.round((teamPerf - smallArea) * 100) / 100),
    smallAreaPerfUsdt: smallArea,
    sLevel,
    vLevel: sLevel, // S/V qualify off the same 总业绩 bracket
    isPartner: Boolean(acct?.is_partner),
    marketLeaderStatus: acct?.market_leader_status ?? 'none',
  };
}

const USDT_STAKE_KINDS = ['partner_join', 'crowdfund_stake'];
const UD3_STAKE_KINDS = ['sd3', 'ud3'];

// Mobile admin UI: compact member detail bundle (exact API contract).
async function getMemberBundle(sb: Sb, wallet: string) {
  const pk = w(wallet);
  const [profileRes, accountRes, stakesRes, node] = await Promise.all([
    sb
      .from('profiles')
      .select('display_name, remark, created_at, lang')
      .ilike('wallet_address', pk)
      .maybeSingle(),
    sb.from('partner_accounts').select('*').ilike('wallet_address', pk).maybeSingle(),
    sb
      .from('partner_stake_positions')
      .select('kind, principal_usdt, status')
      .ilike('wallet_address', pk),
    buildReferralNode(sb, pk),
  ]);
  const profile = profileRes.data;
  const account = accountRes.data as Record<string, unknown> | null;
  const stakes = (stakesRes.data ?? []) as Array<{ kind: string; principal_usdt: number; status: string }>;

  const sumKinds = (kinds: string[]) =>
    round2(
      stakes
        .filter((s) => kinds.includes(s.kind))
        .reduce((acc, s) => acc + Number(s.principal_usdt ?? 0), 0),
    );

  // 补贴概览：可申请额度 + 按状态汇总的工单金额（申请中 / 已批准 / 已发放）。
  const [quota, ticketsRes] = await Promise.all([
    computeSubsidyQuota(sb, pk, 'partner_subsidy').catch(() => null),
    sb.from('partner_subsidy_tickets').select('amount_usd, status').ilike('wallet_address', pk),
  ]);
  const tickets = (ticketsRes.data ?? []) as Array<{ amount_usd: number | null; status: string }>;
  const sumStatus = (statuses: string[]) =>
    round2(tickets.filter((t) => statuses.includes(t.status)).reduce((s, t) => s + Number(t.amount_usd ?? 0), 0));
  const subsidySummary = {
    ratePct: quota?.ratePct ?? null,
    quotaRemaining: quota?.remaining ?? 0,
    quotaCap: quota?.cap ?? 0,
    pendingUsd: sumStatus(['open', 'pending_info', 'under_review']),
    approvedUsd: sumStatus(['approved']),
    paidUsd: sumStatus(['paid']),
    ticketCount: tickets.length,
  };

  return {
    wallet: pk,
    profile: {
      displayName: (profile?.display_name as string) ?? null,
      remark: (profile?.remark as string) ?? null,
      createdAt: (profile?.created_at as string) ?? null,
      lang: (profile?.lang as string) ?? null,
    },
    marketLeaderStatus: node.marketLeaderStatus,
    isPartner: node.isPartner,
    subsidyRatePct: account?.subsidy_rate_pct == null ? null : Number(account.subsidy_rate_pct),
    subsidySummary,
    stakeSummary: {
      count: stakes.length,
      usdtPrincipal: sumKinds(USDT_STAKE_KINDS),
      ud3Principal: sumKinds(UD3_STAKE_KINDS),
      activeCount: stakes.filter((s) => s.status === 'active').length,
    },
    balances: {
      ud3Balance: Number(account?.sd3_balance ?? 0),
      pendingUd3: Number(account?.pending_ud3 ?? 0),
      pendingD3Yield: Number(account?.pending_d3_yield ?? 0),
    },
    referral: {
      sponsorWallet: node.sponsorWallet,
      directCount: node.directCount,
      teamCount: node.teamCount,
      bigAreaPerfUsdt: node.bigAreaPerfUsdt,
      smallAreaPerfUsdt: node.smallAreaPerfUsdt,
      sLevel: node.sLevel,
      vLevel: node.vLevel,
    },
  };
}

type ReferralTree = { node: ReferralNode; children: ReferralTree[] };

// Nested referral tree. Depth-bounded (1..5) AND node-capped (default 500) so a
// wide/deep umbrella can't fan out into an unbounded walk.
async function getReferralTree(
  sb: Sb,
  root: string,
  depth: number,
  cap = 500,
): Promise<ReferralTree> {
  let count = 0;
  async function build(wallet: string, remaining: number): Promise<ReferralTree> {
    const node = await buildReferralNode(sb, wallet);
    count += 1;
    const children: ReferralTree[] = [];
    if (remaining > 0 && count < cap) {
      const directs = await fetchDirectPartnerReferrals(sb, wallet);
      for (const child of directs) {
        if (count >= cap) break;
        children.push(await build(child, remaining - 1));
      }
    }
    return { node, children };
  }
  return build(root, depth);
}

// Unified transaction feed: flash-swap withdrawals + UD3 umbrella transfers.
async function listTransactions(sb: Sb, params: URLSearchParams) {
  const type = params.get('type') === 'ud3_transfer' ? 'ud3_transfer' : 'flash_swap';
  const wallet = (params.get('wallet') ?? '').trim().toLowerCase();
  const from = params.get('from');
  const to = params.get('to');
  const limit = Math.min(Number(params.get('limit') ?? 50), 200);
  const offset = Math.max(Number(params.get('offset') ?? 0), 0);

  if (type === 'flash_swap') {
    let q = sb
      .from('partner_yield_withdrawals')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (wallet) q = q.ilike('wallet_address', wallet);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    const { data, count, error } = await q.range(offset, offset + limit - 1);
    if (error) throw error;
    const rows = (data ?? []).map((r) => ({
      id: r.id,
      type: 'flash_swap' as const,
      wallet: r.wallet_address,
      counterparty: null,
      amount: Number(r.amount_usdt ?? 0),
      asset: 'usdt',
      status: r.status,
      txHash: (r.tx_hash as string) ?? null,
      createdAt: r.created_at,
    }));
    return { rows, total: count ?? rows.length };
  }

  let q = sb
    .from('partner_ud3_transfers')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (wallet) q = q.or(`from_wallet.ilike.${wallet},to_wallet.ilike.${wallet}`);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);
  const { data, count, error } = await q.range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({
    id: r.id,
    type: 'ud3_transfer' as const,
    wallet: r.from_wallet,
    counterparty: r.to_wallet,
    amount: Number(r.amount_ud3 ?? 0),
    asset: 'ud3',
    status: r.status,
    txHash: null,
    createdAt: r.created_at,
  }));
  return { rows, total: count ?? rows.length };
}

async function listReferrals(sb: Sb, params: URLSearchParams) {
  const search = (params.get('q') ?? '').trim().toLowerCase();
  const limit = Math.min(Number(params.get('limit') ?? 100), 500);

  let q = sb
    .from('referrals')
    .select('*')
    .eq('referral_type', 'partner')
    .order('referred_at', { ascending: false })
    .limit(limit);

  if (search) {
    q = q.or(`wallet_address.ilike.%${search}%,sponsor_wallet_address.ilike.%${search}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return { rows: data ?? [] };
}

async function listPartners(sb: Sb, params: URLSearchParams) {
  const search = (params.get('q') ?? '').trim().toLowerCase();
  const limit = Math.min(Number(params.get('limit') ?? 100), 500);

  let q = sb
    .from('partner_accounts')
    .select('*')
    .eq('is_partner', true)
    .order('joined_at', { ascending: false })
    .limit(limit);

  if (search) q = q.ilike('wallet_address', `%${search}%`);

  const { data, error } = await q;
  if (error) throw error;

  const rows = await Promise.all(
    (data ?? []).map(async (a) => {
      const wallet = a.wallet_address as string;
      const stats = await fetchPartnerTeamStats(sb, wallet).catch(() => null);
      return { ...a, teamStats: stats };
    }),
  );

  return { rows };
}

async function listStakes(sb: Sb, params: URLSearchParams) {
  const kind = params.get('kind') ?? 'usdt';
  const wallet = (params.get('wallet') ?? '').trim().toLowerCase();
  const from = params.get('from');
  const to = params.get('to');
  const limit = Math.min(Number(params.get('limit') ?? 100), 500);
  const offset = Math.max(Number(params.get('offset') ?? 0), 0);

  // Legacy: kind=sd3 returned the UD3 umbrella-transfer ledger. Kept for back-compat.
  if (kind === 'sd3') {
    const { data: transfers, error } = await sb
      .from('partner_ud3_transfers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return {
      kind: 'sd3',
      note: 'UD3 质押通过伞下转账入众筹；以下为 UD3 转账记录。',
      rows: transfers ?? [],
    };
  }

  // kind=usdt → USDT-funded stake positions; kind=ud3 → UD3-funded positions.
  const kinds = kind === 'ud3' ? UD3_STAKE_KINDS : USDT_STAKE_KINDS;
  let q = sb
    .from('partner_stake_positions')
    .select('*', { count: 'exact' })
    .in('kind', kinds)
    .order('started_at', { ascending: false });
  if (wallet) q = q.ilike('wallet_address', wallet);
  if (from) q = q.gte('started_at', from);
  if (to) q = q.lte('started_at', to);
  const { data: positions, count, error } = await q.range(offset, offset + limit - 1);
  if (error) throw error;

  const isUd3Kind = kind === 'ud3';
  // Map raw snake_case rows → the camelCase shape the admin StakeRow UI reads
  // (principalUsdt / principalUd3 / dailyYield). Returning raw rows showed 本金 $0.
  const rows = (positions ?? []).map((p) => {
    const principal = Number(p.principal_usdt ?? 0);
    return {
      id: p.id,
      wallet: p.wallet_address,
      kind: isUd3Kind ? 'ud3' : 'usdt',
      principalUsdt: isUd3Kind ? 0 : principal,
      principalUd3: isUd3Kind ? principal : 0,
      dailyYield: Number(p.daily_yield_usdt ?? 0),
      status: p.status,
      createdAt: p.created_at,
      startedAt: p.started_at ?? null,
      endedAt: p.unlock_at ?? null,
      exitCapUsdt: p.exit_cap_d3 != null ? Number(p.exit_cap_d3) : null,
      releasedUsdt: p.released_d3 != null ? Number(p.released_d3) : null,
      intentId: p.intent_id ?? null,
      intent_id: p.intent_id ?? null,
    };
  });

  return {
    kind: isUd3Kind ? 'ud3' : 'usdt',
    rows,
    total: count ?? 0,
    limit,
    offset,
  };
}

async function listSubsidyTickets(sb: Sb, params: URLSearchParams) {
  const status = params.get('status');
  const kind = params.get('kind');
  const limit = Math.min(Number(params.get('limit') ?? 50), 200);

  let q = sb
    .from('partner_subsidy_tickets')
    .select('*')
    .order('applied_at', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);
  if (kind) q = q.eq('kind', kind);

  const { data, error } = await q;
  if (error) throw error;
  return { rows: data ?? [] };
}

async function getSubsidyTicket(sb: Sb, ticketId: string) {
  const { data: ticket, error } = await sb
    .from('partner_subsidy_tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();
  if (error) throw error;
  if (!ticket) throw new HttpError(404, 'Ticket not found');

  const { data: messages } = await sb
    .from('partner_subsidy_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  const wallet = ticket.wallet_address as string;
  const stats = await fetchPartnerTeamStats(sb, wallet);
  const { data: priorTickets } = await sb
    .from('partner_subsidy_tickets')
    .select('id, kind, amount_usd, status, applied_at')
    .ilike('wallet_address', w(wallet))
    .neq('id', ticketId)
    .order('applied_at', { ascending: false });

  const receiptPaths = Array.isArray(ticket.receipt_paths)
    ? (ticket.receipt_paths as string[])
    : [];
  const receiptUrls = receiptPaths.length
    ? await signSubsidyReceiptDownloads(sb, receiptPaths)
    : [];

  return {
    ticket,
    messages: messages ?? [],
    teamStats: stats,
    priorTickets: priorTickets ?? [],
    receiptUrls,
  };
}

async function patchSubsidyTicket(
  sb: Sb,
  ticketId: string,
  body: {
    status?: string;
    adminNote?: string;
    assignedAdmin?: string;
    marketLeaderStatus?: string;
  },
  admin: { username: string },
) {
  const { data: existing } = await sb
    .from('partner_subsidy_tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();
  if (!existing) throw new HttpError(404, 'Ticket not found');

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (body.status) {
    patch.status = body.status;
    if (['approved', 'rejected', 'paid', 'closed'].includes(body.status)) {
      patch.reviewed_at = now;
    }
    if (body.status === 'paid') patch.paid_at = now;
  }
  if (body.adminNote !== undefined) patch.admin_note = body.adminNote;
  if (body.assignedAdmin !== undefined) patch.assigned_admin = body.assignedAdmin;

  const { data: ticket, error } = await sb
    .from('partner_subsidy_tickets')
    .update(patch)
    .eq('id', ticketId)
    .select('*')
    .single();
  if (error) throw error;

  // Resolve the single market_leader_status transition this patch implies. An
  // explicit marketLeaderStatus takes precedence; otherwise a market_leader
  // ticket flipping to approved/rejected mirrors that onto the account.
  let mlNext: string | null = null;
  if (body.marketLeaderStatus) {
    mlNext = body.marketLeaderStatus;
  } else if (existing.kind === 'market_leader' && body.status === 'approved') {
    mlNext = 'approved';
  } else if (existing.kind === 'market_leader' && body.status === 'rejected') {
    mlNext = 'rejected';
  }

  // Capture the partner_accounts.market_leader_status before/after so the caller
  // can emit an immutable admin audit row for this eligibility-bearing write.
  let marketLeader:
    | { wallet: string; before: string | null; after: string }
    | null = null;
  if (mlNext) {
    const wallet = w(existing.wallet_address as string);
    const { data: acctBefore } = await sb
      .from('partner_accounts')
      .select('market_leader_status')
      .ilike('wallet_address', wallet)
      .maybeSingle();
    await sb
      .from('partner_accounts')
      .update({ market_leader_status: mlNext, updated_at: now })
      .ilike('wallet_address', wallet);
    marketLeader = {
      wallet,
      before: (acctBefore?.market_leader_status as string | null) ?? null,
      after: mlNext,
    };
  }

  await sb.from('partner_subsidy_messages').insert({
    ticket_id: ticketId,
    author_type: 'system',
    author_name: admin.username,
    body: `状态更新为 ${body.status ?? '—'}`,
  });

  return { ticket, marketLeader };
}

async function addTicketMessage(
  sb: Sb,
  ticketId: string,
  body: string,
  admin: { username: string },
  requestInfo = false,
) {
  const { data: ticket } = await sb
    .from('partner_subsidy_tickets')
    .select('id, status')
    .eq('id', ticketId)
    .maybeSingle();
  if (!ticket) throw new HttpError(404, 'Ticket not found');

  const { data: msg, error } = await sb
    .from('partner_subsidy_messages')
    .insert({
      ticket_id: ticketId,
      author_type: 'admin',
      author_name: admin.username,
      body,
    })
    .select('*')
    .single();
  if (error) throw error;

  if (requestInfo) {
    await sb
      .from('partner_subsidy_tickets')
      .update({ status: 'pending_info', updated_at: new Date().toISOString() })
      .eq('id', ticketId);
  } else if (ticket.status === 'open') {
    await sb
      .from('partner_subsidy_tickets')
      .update({ status: 'under_review', updated_at: new Date().toISOString() })
      .eq('id', ticketId);
  }

  return { message: msg };
}

// ── V-08 maker-checker: approval queue for payout-authorizing actions ─────────

// Action codes stored on admin_action_approvals.action, dispatched on approve.
const APPROVAL_PROGRAM_SETTINGS = 'program_settings.update';
const APPROVAL_SUBSIDY_TICKET = 'subsidy_ticket.patch';
// Security circuit-breaker maker-checker actions (Agent O).
const APPROVAL_SECURITY_UNPAUSE = 'security.unpause';
const APPROVAL_RISK_LIMITS = 'risk_limits.update';
// Mobile admin UI: flipping a member's market-leader status is payout-authorizing
// (unlocks subsidy eligibility) → maker-checker gated like the ticket path.
const APPROVAL_MEMBER_SET_LEADER = 'member.set_leader';

// R-3: the CHECKER-side permission required to approve/reject depends on the
// action being approved. Security circuit-breaker unpauses and risk-limit
// relaxations are created by the maker under `security.write`, so the checker
// must ALSO hold `security.write` — otherwise a `subsidies.write`-only admin
// could unpause a breaker or relax a risk cap they cannot create. Subsidy /
// program actions stay on `subsidies.write`. Superadmin bypasses via
// adminHasPermission regardless.
export function requiredPermissionForApprovalAction(action: string): string {
  if (action.startsWith('security.') || action.startsWith('risk_limits.')) {
    return 'security.write';
  }
  // Member mutations (e.g. member.set_leader) are proposed AND approved under
  // members.write — a subsidies-only admin must not be able to grant leadership.
  if (action.startsWith('member.')) {
    return 'members.write';
  }
  return 'subsidies.write';
}

async function createApproval(
  sb: Sb,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    payload: Record<string, unknown>;
    requestedBy: string;
  },
) {
  const { data, error } = await sb
    .from('admin_action_approvals')
    .insert({
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      payload: input.payload,
      requested_by: input.requestedBy,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function listPendingApprovals(sb: Sb) {
  const { data, error } = await sb
    .from('admin_action_approvals')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return { rows: data ?? [] };
}

async function loadPendingApproval(sb: Sb, id: string) {
  const { data, error } = await sb
    .from('admin_action_approvals')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Approval not found');
  if (data.status !== 'pending') {
    throw new HttpError(409, `Approval already ${data.status}`);
  }
  return data;
}

/**
 * Atomically claim a pending approval by flipping it to a terminal state, gated
 * on `status = 'pending'`. Returns the claimed row to the single caller that won
 * the race, or `null` to every loser. This is the TOCTOU fix: the state
 * transition happens BEFORE any payout-authorizing side effect, so a concurrent
 * approver cannot also pass the guard and re-apply the change.
 */
async function claimApproval(
  sb: Sb,
  id: string,
  status: 'executed' | 'rejected',
  adminUserId: string,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown> | null> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('admin_action_approvals')
    .update({ status, approved_by: adminUserId, approved_at: now, ...extra })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

type ApplyResult = {
  before: unknown;
  after: unknown;
  marketLeader?: { wallet: string; before: string | null; after: string } | null;
  conflict?: string | null;
};

// Injectable appliers so the claim/apply ordering can be unit-tested with fakes.
export type ApproveDeps = {
  claimApproval: (
    sb: Sb,
    id: string,
    adminUserId: string,
  ) => Promise<Record<string, unknown> | null>;
  applyProgramSettings: (
    sb: Sb,
    payload: Record<string, unknown>,
    admin: AdminProfile,
  ) => Promise<ApplyResult>;
  applySubsidyTicket: (
    sb: Sb,
    targetId: string,
    payload: Record<string, unknown>,
    admin: AdminProfile,
  ) => Promise<ApplyResult>;
  applySecurityUnpause: (
    sb: Sb,
    payload: Record<string, unknown>,
    admin: AdminProfile,
  ) => Promise<ApplyResult>;
  applyRiskLimits: (
    sb: Sb,
    payload: Record<string, unknown>,
    admin: AdminProfile,
  ) => Promise<ApplyResult>;
  applyMemberSetLeader: (
    sb: Sb,
    targetId: string,
    payload: Record<string, unknown>,
    admin: AdminProfile,
  ) => Promise<ApplyResult>;
};

// Apply a member.set_leader approval: flip partner_accounts.market_leader_status
// to 'approved' (grants subsidy eligibility) or 'none'. Returns the before/after
// eligibility write as `marketLeader` so approveApproval emits the same immutable
// audit row the subsidy-ticket path does. Exported for unit tests.
export async function applyMemberSetLeader(
  sb: Sb,
  targetId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  const wallet = w(targetId);
  const next = payload.isLeader ? 'approved' : 'none';
  const { data: before } = await sb
    .from('partner_accounts')
    .select('market_leader_status')
    .ilike('wallet_address', wallet)
    .maybeSingle();
  if (!before) {
    return { before: null, after: null, conflict: 'member_not_found' };
  }
  const { data: after, error } = await sb
    .from('partner_accounts')
    .update({ market_leader_status: next, updated_at: new Date().toISOString() })
    .ilike('wallet_address', wallet)
    .select('market_leader_status')
    .maybeSingle();
  if (error) throw error;
  return {
    before: { market_leader_status: (before.market_leader_status as string) ?? null },
    after: { market_leader_status: (after?.market_leader_status as string) ?? next },
    marketLeader: {
      wallet,
      before: (before.market_leader_status as string | null) ?? null,
      after: next,
    },
  };
}

export const defaultApproveDeps: ApproveDeps = {
  claimApproval: (sb, id, adminUserId) =>
    claimApproval(sb, id, 'executed', adminUserId),
  applyProgramSettings: async (sb, payload, admin) => {
    const before = await getPartnerProgramSettings(sb);
    const after = await updatePartnerProgramSettings(sb, payload, admin.username);
    return { before, after };
  },
  applySubsidyTicket: async (sb, targetId, payload, admin) => {
    const { data: existing } = await sb
      .from('partner_subsidy_tickets')
      .select('*')
      .eq('id', targetId)
      .maybeSingle();
    // Re-assert cheap preconditions on execute so we never re-flip an
    // already-terminal target (avoids double-pay / re-approval after the row
    // moved between request and approval).
    if (!existing) {
      return { before: null, after: null, conflict: 'ticket_not_found' };
    }
    if (existing.status === 'paid') {
      return { before: existing, after: existing, conflict: 'already_paid' };
    }
    const res = await patchSubsidyTicket(sb, targetId, payload, admin);
    return { before: existing, after: res.ticket, marketLeader: res.marketLeader };
  },
  // security.unpause: flip the named circuit-breaker back to paused=false. Runs
  // ONLY after the approval row was atomically claimed, so a lost race applies
  // nothing (approveApproval short-circuits on a null claim before dispatch).
  applySecurityUnpause: async (sb, payload) => {
    const flag = String(payload.flag ?? '');
    const { data: before } = await sb
      .from('system_pause_flags')
      .select('*')
      .eq('flag', flag)
      .maybeSingle();
    const { data: after, error } = await sb
      .from('system_pause_flags')
      .update({
        paused: false,
        reason: (payload.reason as string | null) ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('flag', flag)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return { before: before ?? null, after: after ?? null };
  },
  // risk_limits.update: apply the sanitized numeric patch to the singleton row.
  applyRiskLimits: async (sb, payload) => {
    const { data: before } = await sb
      .from('risk_limits')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    const { data: after, error } = await sb
      .from('risk_limits')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select('*')
      .single();
    if (error) throw error;
    return { before: before ?? null, after };
  },
  applyMemberSetLeader: (sb, targetId, payload) => applyMemberSetLeader(sb, targetId, payload),
};

// Approve a pending request. Order is: separation-of-duties check -> CLAIM the
// row atomically (pending -> executed) -> only the winner applies the stored
// change and writes the immutable audit trail.
export async function approveApproval(
  sb: Sb,
  id: string,
  admin: AdminProfile,
  deps: ApproveDeps = defaultApproveDeps,
) {
  const approval = await loadPendingApproval(sb, id);
  // Separation of duties: approver MUST differ from the requester.
  assertDifferentApprover(approval.requested_by as string, admin.userId);

  const action = approval.action as string;
  const KNOWN_ACTIONS = [
    APPROVAL_PROGRAM_SETTINGS,
    APPROVAL_SUBSIDY_TICKET,
    APPROVAL_SECURITY_UNPAUSE,
    APPROVAL_RISK_LIMITS,
    APPROVAL_MEMBER_SET_LEADER,
  ];
  if (!KNOWN_ACTIONS.includes(action)) {
    throw new HttpError(400, `Unknown approval action: ${action}`);
  }

  // R-3: cross-permission guard — the checker must hold the permission that
  // MATCHES the pending action, not merely `subsidies.write`. Enforced BEFORE
  // the claim so an under-privileged approver can never flip the row.
  const requiredPerm = requiredPermissionForApprovalAction(action);
  if (!adminHasPermission(admin, requiredPerm)) {
    throw new HttpError(403, `Missing ${requiredPerm} permission`);
  }

  // CLAIM FIRST: atomically move pending -> executed. Losers of a concurrent
  // race get null here and apply NOTHING.
  const claimed = await deps.claimApproval(sb, id, admin.userId);
  if (!claimed) throw new HttpError(409, 'Approval already processed');

  const payload = (approval.payload ?? {}) as Record<string, unknown>;
  let result: ApplyResult;
  if (action === APPROVAL_PROGRAM_SETTINGS) {
    result = await deps.applyProgramSettings(sb, payload, admin);
  } else if (action === APPROVAL_SUBSIDY_TICKET) {
    result = await deps.applySubsidyTicket(sb, approval.target_id as string, payload, admin);
  } else if (action === APPROVAL_SECURITY_UNPAUSE) {
    result = await deps.applySecurityUnpause(sb, payload, admin);
  } else if (action === APPROVAL_MEMBER_SET_LEADER) {
    result = await deps.applyMemberSetLeader(sb, approval.target_id as string, payload, admin);
  } else {
    result = await deps.applyRiskLimits(sb, payload, admin);
  }

  const reason = result.conflict
    ? `maker-checker approved but target precondition changed (${result.conflict}); no-op applied (requested_by=${approval.requested_by})`
    : `maker-checker approved (requested_by=${approval.requested_by})`;

  await writeAdminAudit(sb, {
    actorId: admin.userId,
    actorRole: admin.role,
    action,
    entityType: approval.target_type as string,
    entityId: approval.target_id as string,
    before: result.before,
    after: result.after,
    reason,
  });

  // Capture the partner_accounts.market_leader_status eligibility write in its
  // own before/after admin audit row (skipped on a no-op conflict).
  if (!result.conflict && result.marketLeader) {
    await writeAdminAudit(sb, {
      actorId: admin.userId,
      actorRole: admin.role,
      action: 'partner_account.market_leader_status',
      entityType: 'partner_accounts',
      entityId: result.marketLeader.wallet,
      before: { market_leader_status: result.marketLeader.before },
      after: { market_leader_status: result.marketLeader.after },
      reason: `maker-checker approved (requested_by=${approval.requested_by})`,
    });
  }

  return { approval: claimed };
}

// Reject a pending request. Same claim-first ordering: atomically move
// pending -> rejected; only the winner writes the audit row.
export async function rejectApproval(
  sb: Sb,
  id: string,
  admin: AdminProfile,
  reason?: string,
) {
  const approval = await loadPendingApproval(sb, id);
  // Separation of duties applies to rejection too.
  assertDifferentApprover(approval.requested_by as string, admin.userId);

  // R-3: same cross-permission guard as approve — rejecting a security /
  // risk-limits action requires `security.write`, not `subsidies.write`.
  const requiredPerm = requiredPermissionForApprovalAction(approval.action as string);
  if (!adminHasPermission(admin, requiredPerm)) {
    throw new HttpError(403, `Missing ${requiredPerm} permission`);
  }

  const claimed = await claimApproval(sb, id, 'rejected', admin.userId, {
    reason: reason ?? null,
  });
  if (!claimed) throw new HttpError(409, 'Approval already processed');

  await writeAdminAudit(sb, {
    actorId: admin.userId,
    actorRole: admin.role,
    action: `${approval.action}.rejected`,
    entityType: approval.target_type as string,
    entityId: approval.target_id as string,
    before: approval.payload,
    after: null,
    reason: reason ?? `maker-checker rejected (requested_by=${approval.requested_by})`,
  });

  return { approval: claimed };
}

// ── Security / circuit-breaker helpers (Agent O) ─────────────────────────────

// The named pause surfaces seeded by migration 038. Pausing an unknown flag is
// rejected so a typo can never create a silent no-op breaker.
export const KNOWN_PAUSE_FLAGS = [
  'flash_swap',
  'deposits',
  'settlement',
  'treasury',
  'rewards',
] as const;

export function isKnownPauseFlag(flag: string): boolean {
  return (KNOWN_PAUSE_FLAGS as readonly string[]).includes(flag);
}

// Only these numeric caps may be patched on the singleton risk_limits row; any
// other field in the request body (e.g. id/updated_at) is dropped.
const RISK_LIMITS_FIELDS = [
  'max_withdraw_per_tx_usdt',
  'max_user_daily_usdt',
  'max_platform_hourly_usdt',
  'min_solvency_ratio',
] as const;

export function sanitizeRiskLimitsPatch(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of RISK_LIMITS_FIELDS) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  return patch;
}

// Pause is a conservative safety action -> single admin, immediate (NOT
// maker-checkered). Upsert paused=true and write a before/after audit row.
export async function pauseFlag(
  sb: Sb,
  flag: string,
  reason: string | null,
  admin: AdminProfile,
) {
  const { data: before } = await sb
    .from('system_pause_flags')
    .select('*')
    .eq('flag', flag)
    .maybeSingle();
  const { data: after, error } = await sb
    .from('system_pause_flags')
    .upsert(
      { flag, paused: true, reason, updated_at: new Date().toISOString() },
      { onConflict: 'flag' },
    )
    .select('*')
    .single();
  if (error) throw error;
  await writeAdminAudit(sb, {
    actorId: admin.userId,
    actorRole: admin.role,
    action: 'security.pause',
    entityType: 'system_pause_flags',
    entityId: flag,
    before: before ?? null,
    after,
    reason: reason ?? undefined,
  });
  return after;
}

// Unpause (resuming a paused surface) is maker-checkered: create a pending
// approval; the flag is flipped only when a DIFFERENT admin approves. Does NOT
// touch system_pause_flags here.
export async function requestUnpause(
  sb: Sb,
  flag: string,
  reason: string | null,
  admin: AdminProfile,
) {
  const approval = await createApproval(sb, {
    action: APPROVAL_SECURITY_UNPAUSE,
    targetType: 'system_pause_flags',
    targetId: flag,
    payload: { flag, reason },
    requestedBy: admin.userId,
  });
  await writeAdminAudit(sb, {
    actorId: admin.userId,
    actorRole: admin.role,
    action: `${APPROVAL_SECURITY_UNPAUSE}.requested`,
    entityType: 'system_pause_flags',
    entityId: flag,
    before: null,
    after: { flag, reason },
    reason: 'maker-checker requested; awaiting second admin',
  });
  return approval;
}

// Changing risk limits is maker-checkered: create a pending approval carrying the
// sanitized patch; applied only on a second admin's approval.
export async function requestRiskLimitsUpdate(
  sb: Sb,
  patch: Record<string, unknown>,
  admin: AdminProfile,
) {
  const { data: before } = await sb
    .from('risk_limits')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  const approval = await createApproval(sb, {
    action: APPROVAL_RISK_LIMITS,
    targetType: 'risk_limits',
    targetId: '1',
    payload: patch,
    requestedBy: admin.userId,
  });
  await writeAdminAudit(sb, {
    actorId: admin.userId,
    actorRole: admin.role,
    action: `${APPROVAL_RISK_LIMITS}.requested`,
    entityType: 'risk_limits',
    entityId: '1',
    before: before ?? null,
    after: patch,
    reason: 'maker-checker requested; awaiting second admin',
  });
  return approval;
}

// Flipping a member's market-leader status is payout-authorizing → maker-checker.
// Create a pending approval; the eligibility write happens only when a DIFFERENT
// members.write admin approves it (executor: applyMemberSetLeader).
export async function requestMemberSetLeader(
  sb: Sb,
  wallet: string,
  isLeader: boolean,
  reason: string | null,
  admin: AdminProfile,
) {
  const pk = w(wallet);
  const { data: before } = await sb
    .from('partner_accounts')
    .select('market_leader_status')
    .ilike('wallet_address', pk)
    .maybeSingle();
  const approval = await createApproval(sb, {
    action: APPROVAL_MEMBER_SET_LEADER,
    targetType: 'partner_accounts',
    targetId: pk,
    payload: { wallet: pk, isLeader, reason },
    requestedBy: admin.userId,
  });
  await writeAdminAudit(sb, {
    actorId: admin.userId,
    actorRole: admin.role,
    action: `${APPROVAL_MEMBER_SET_LEADER}.requested`,
    entityType: 'partner_accounts',
    entityId: pk,
    before: { market_leader_status: (before?.market_leader_status as string | null) ?? null },
    after: { market_leader_status: isLeader ? 'approved' : 'none' },
    reason: reason ?? 'maker-checker requested; awaiting second admin',
  });
  return approval;
}

export async function ackAlert(sb: Sb, id: string, admin: AdminProfile) {
  const { data: before } = await sb
    .from('security_alerts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) throw new HttpError(404, 'Alert not found');
  const { data: after, error } = await sb
    .from('security_alerts')
    .update({
      status: 'ack',
      acknowledged_by: admin.userId,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  await writeAdminAudit(sb, {
    actorId: admin.userId,
    actorRole: admin.role,
    action: 'security.alert.ack',
    entityType: 'security_alerts',
    entityId: id,
    before,
    after,
  });
  return after;
}

async function countOpenAlertsBySeverity(sb: Sb) {
  const sevs = ['P0', 'P1', 'P2', 'P3'] as const;
  const res = await Promise.all(
    sevs.map((s) =>
      sb
        .from('security_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .eq('severity', s)
    ),
  );
  const counts: Record<'P0' | 'P1' | 'P2' | 'P3', number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  sevs.forEach((s, i) => {
    counts[s] = res[i].count ?? 0;
  });
  return counts;
}

function requireSecurityWrite(admin: AdminProfile) {
  if (!adminHasPermission(admin, 'security.write')) {
    throw new HttpError(403, 'Missing security.write permission');
  }
}

async function dashboardStats(sb: Sb) {
  const [
    partners,
    members,
    openTickets,
    pendingWithdrawals,
    todayStakes,
  ] = await Promise.all([
    sb.from('partner_accounts').select('id', { count: 'exact', head: true }).eq('is_partner', true),
    sb.from('partner_accounts').select('id', { count: 'exact', head: true }),
    sb
      .from('partner_subsidy_tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'pending_info', 'under_review']),
    sb
      .from('partner_yield_withdrawals')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'signing', 'broadcasted', 'manual_review']),
    sb
      .from('partner_stake_positions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
  ]);

  return {
    partnerCount: partners.count ?? 0,
    memberCount: members.count ?? 0,
    openSubsidyTickets: openTickets.count ?? 0,
    pendingYieldWithdrawals: pendingWithdrawals.count ?? 0,
    activeStakePositions: todayStakes.count ?? 0,
  };
}

// ── Admin RBAC: role & admin management (feature/admin-redesign) ──────────────

function requireSuperadmin(admin: AdminProfile) {
  if (admin.role !== 'superadmin') {
    throw new HttpError(403, 'Superadmin required');
  }
}

function requirePermission(admin: AdminProfile, key: string) {
  if (!adminHasPermission(admin, key)) {
    throw new HttpError(403, `Missing ${key} permission`);
  }
}

// Shape of the permission catalog + role presets served to the Roles page.
function permissionCatalogResponse() {
  return {
    permissions: PERMISSION_CATALOG.map((p) => ({ key: p.key, label: p.label, group: p.group })),
    roles: ROLE_PRESETS.map((r) => ({ key: r.key, label: r.label, permissions: r.permissions })),
  };
}

async function listAdmins(sb: Sb) {
  const { data, error } = await sb
    .from('admin_users')
    .select('user_id, username, role, permissions, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  // Emails live in auth.users (not admin_users) — resolve them via the admin API
  // (service role). Best-effort: a failure just leaves email null.
  const emailById = new Map<string, string>();
  try {
    const { data: authData } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of authData?.users ?? []) emailById.set(u.id, (u.email as string) ?? '');
  } catch {
    /* email best-effort */
  }
  const rows = (data ?? []).map((r) => ({
    userId: r.user_id as string,
    username: r.username as string,
    email: emailById.get(r.user_id as string) ?? null,
    role: r.role as string,
    permissions: Array.isArray(r.permissions) ? (r.permissions as string[]) : [],
    createdAt: (r.created_at as string) ?? null,
  }));
  return { rows };
}

// Validate & normalise a PATCH/POST permissions array against the catalog.
function sanitizePermissions(input: unknown): string[] {
  if (!Array.isArray(input)) throw new HttpError(400, 'permissions must be an array');
  const out: string[] = [];
  for (const raw of input) {
    const key = String(raw);
    if (!isValidPermissionKey(key)) throw new HttpError(400, `Unknown permission: ${key}`);
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

async function patchAdmin(
  sb: Sb,
  targetUserId: string,
  body: { role?: string; permissions?: unknown },
  caller: AdminProfile,
) {
  const patch: { role?: string; permissions?: string[] } = {};
  if (body.role !== undefined) {
    if (!isValidRole(String(body.role))) throw new HttpError(400, `Unknown role: ${body.role}`);
    patch.role = String(body.role);
  }
  if (body.permissions !== undefined) {
    patch.permissions = sanitizePermissions(body.permissions);
  }
  if (patch.role === undefined && patch.permissions === undefined) {
    throw new HttpError(400, 'role or permissions required');
  }

  // Privilege-escalation / self-escalation guard (pure, unit-tested).
  assertCanManageAdmin(caller, targetUserId, patch);

  const { data: before, error: beforeErr } = await sb
    .from('admin_users')
    .select('user_id, username, role, permissions')
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (beforeErr) throw beforeErr;
  if (!before) throw new HttpError(404, 'Admin not found');

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.role !== undefined) update.role = patch.role;
  // Explicit permissions win; otherwise a role-only change resets permissions to
  // that role's preset so the stored grants stay consistent with the role.
  if (patch.permissions !== undefined) {
    update.permissions = patch.permissions;
  } else if (patch.role !== undefined) {
    update.permissions = permissionsForRole(patch.role);
  }

  const { data: after, error } = await sb
    .from('admin_users')
    .update(update)
    .eq('user_id', targetUserId)
    .select('user_id, username, role, permissions')
    .single();
  if (error) throw error;

  await writeAdminAudit(sb, {
    actorId: caller.userId,
    actorRole: caller.role,
    action: 'admin.update',
    entityType: 'admin_users',
    entityId: targetUserId,
    before: { role: before.role, permissions: before.permissions },
    after: { role: after.role, permissions: after.permissions },
  });

  return { admin: after };
}

// Find an existing auth user by email, or create one via the service-role admin
// API. Returns the auth user id. Fails with a clear error if the admin API is
// unavailable (e.g. running against a client-only Supabase instance).
async function findOrCreateAuthUser(sb: Sb, email: string): Promise<string> {
  const adminApi = (sb as { auth?: { admin?: unknown } }).auth?.admin as
    | {
        createUser: (a: { email: string; email_confirm?: boolean }) => Promise<{ data: { user: { id: string } | null }; error: { message?: string } | null }>;
        listUsers: (a?: { page?: number; perPage?: number }) => Promise<{ data: { users: Array<{ id: string; email?: string | null }> }; error: { message?: string } | null }>;
      }
    | undefined;
  if (!adminApi || typeof adminApi.createUser !== 'function') {
    throw new HttpError(503, 'Auth admin API unavailable; cannot provision admin user');
  }

  const created = await adminApi.createUser({ email, email_confirm: true });
  if (!created.error && created.data?.user?.id) {
    return created.data.user.id;
  }

  // Likely already registered — locate the existing user by email.
  if (typeof adminApi.listUsers === 'function') {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await adminApi.listUsers({ page, perPage: 200 });
      if (error) break;
      const users = data?.users ?? [];
      const match = users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
      if (match) return match.id;
      if (users.length < 200) break;
    }
  }
  throw new HttpError(400, created.error?.message ?? 'Could not create or find auth user');
}

async function createAdmin(
  sb: Sb,
  body: { email?: string; role?: string; permissions?: unknown; username?: string },
  caller: AdminProfile,
) {
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Valid email required');
  }
  const role = String(body.role ?? '');
  if (!isValidRole(role)) throw new HttpError(400, `Unknown role: ${body.role}`);
  const permissions =
    body.permissions !== undefined ? sanitizePermissions(body.permissions) : permissionsForRole(role);

  const userId = await findOrCreateAuthUser(sb, email);
  const username = String(body.username ?? '').trim() || email;

  const { data: after, error } = await sb
    .from('admin_users')
    .upsert(
      {
        user_id: userId,
        username,
        role,
        permissions,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('user_id, username, role, permissions, created_at')
    .single();
  if (error) throw error;

  await writeAdminAudit(sb, {
    actorId: caller.userId,
    actorRole: caller.role,
    action: 'admin.create',
    entityType: 'admin_users',
    entityId: userId,
    before: null,
    after: { email, role, permissions },
  });

  return { admin: after };
}

async function deleteAdmin(sb: Sb, targetUserId: string, caller: AdminProfile) {
  if (targetUserId === caller.userId) {
    throw new HttpError(400, 'Cannot revoke your own admin access');
  }
  const { data: before, error: beforeErr } = await sb
    .from('admin_users')
    .select('user_id, username, role, permissions')
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (beforeErr) throw beforeErr;
  if (!before) throw new HttpError(404, 'Admin not found');

  const { error } = await sb.from('admin_users').delete().eq('user_id', targetUserId);
  if (error) throw error;

  await writeAdminAudit(sb, {
    actorId: caller.userId,
    actorRole: caller.role,
    action: 'admin.delete',
    entityType: 'admin_users',
    entityId: targetUserId,
    before: { role: before.role, permissions: before.permissions },
    after: null,
  });

  return { removed: targetUserId };
}

// ── UD3 反向金 reward distribution for the admin order dialog — V3 model ───────
//
// V3 = "tier-coefficient × cumulative-difference" (_shared/ud3Reward.ts +
// ud3RewardConfig.ts, UD3_ALGO_VERSION_V3). The 网体 (network) reward is split
// across SIX fixed tier slots S1..S6; each slot is either paid to the nearest
// qualified + eligible up-chain ancestor (CALCULATED) or left UNALLOCATED. The
// GUIDE (引路人) reward is an independent ladder.
//
// This maps a partner_ud3_events row + its per-tier partner_ud3_ledger rows
// (migration 054 columns: reward_tier_code / reward_tier_rank / receiver_tier_* /
// tier_coefficient / incremental_rate / reward_status / unallocated_reason / …)
// into the audit payload the dialog renders. The tier ladder is ALWAYS returned
// as 6 rows S1..S6 (driven off the resolved config), with amount / status /
// receiver taken from the matching ledger row. Every money/rate field is a STRING
// so numeric(…) precision is preserved — never round-tripped through Number().
// Pure + exported so the row→payload mapping is unit-testable without a DB.

type Ud3EventRow = Record<string, unknown>;
type Ud3LedgerRow = Record<string, unknown>;

// First non-null/undefined value stringified (numbers stay strings to preserve
// the numeric(…) precision Supabase returns as text). null if all are absent.
function firstStr(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v !== null && v !== undefined) return String(v);
  }
  return null;
}

function decOf(v: unknown): Decimal {
  const s = firstStr(v);
  if (s === null || s === '') return new Decimal(0);
  try {
    return new Decimal(s);
  } catch {
    return new Decimal(0);
  }
}

// The reward amount lives in ud3_amount (NOT NULL); a future `reward_amount` alias wins.
function rowAmount(row: Ud3LedgerRow): string {
  return firstStr(row.reward_amount, row.ud3_amount) ?? '0';
}

// A V3 network tier-slot row carries a reward_tier_code ('S1'..'S6'). The guide
// (引路人) row is NOT a network slot even if legacy data stamped a tier code on it —
// exclude it so a guide at tier S1 can never shadow the network S1 slot.
function isV3TierRow(row: Ud3LedgerRow): boolean {
  if (row.reward_type === 'GUIDE_REWARD' || (row.reward_type == null && row.role === 'direct')) {
    return false;
  }
  return row.reward_tier_code != null && row.reward_tier_code !== '';
}

// A guide row is the independent 引路人 ladder line.
function isGuideRow(row: Ud3LedgerRow): boolean {
  if (row.reward_type === 'GUIDE_REWARD') return true;
  return row.reward_type == null && row.role === 'direct';
}

// Whether an order has V3 per-tier ledger rows (else it predates V3 → found:false).
function hasV3TierRows(rows: Ud3LedgerRow[]): boolean {
  return rows.some(isV3TierRow);
}

// Resolve the config for an order from its stored version, tolerant to an
// unknown/absent version (defaults to the latest so display never 500s).
function resolveUd3Config(version: string | null): Ud3RewardConfig {
  try {
    return getUd3RewardConfig(version ?? undefined);
  } catch {
    return getUd3RewardConfig();
  }
}

export function mapUd3OrderReward(eventRow: Ud3EventRow, ledgerRows: Ud3LedgerRow[]) {
  const rows = Array.isArray(ledgerRows) ? ledgerRows : [];

  const guideRow = rows.find(isGuideRow) ?? null;
  const tierRows = rows.filter(isV3TierRow);

  // Config version + algorithm version snapshot (prefer stored, else config default).
  const configVersion = firstStr(
    guideRow?.level_config_version,
    ...tierRows.map((r) => r.level_config_version),
    eventRow.level_config_version,
  );
  const config = resolveUd3Config(configVersion);
  const algorithmVersion = firstStr(
    guideRow?.reward_algorithm_version,
    ...tierRows.map((r) => r.reward_algorithm_version),
  ) ?? config.algorithmVersion;

  // ── 引路人 (guide) — independent ladder line ──
  const guide = guideRow
    ? {
        wallet: firstStr(guideRow.recipient_wallet),
        tierCode: firstStr(guideRow.receiver_tier_code, guideRow.beneficiary_level),
        coefficient: firstStr(guideRow.tier_coefficient),
        amount: rowAmount(guideRow),
        status: firstStr(guideRow.reward_status) ?? 'CALCULATED',
      }
    : null;

  // ── 网体 tier ladder — ALWAYS 6 rows S1..S6, ordered by rank, driven off config. ──
  const byCode = new Map<string, Ud3LedgerRow>();
  for (const r of tierRows) {
    const code = firstStr(r.reward_tier_code);
    if (code && !byCode.has(code)) byCode.set(code, r);
  }

  let networkTotal = new Decimal(0);
  let networkAllocated = new Decimal(0);
  let networkBurned = new Decimal(0);

  const tiers = [...config.tiers]
    .sort((a, b) => a.rank - b.rank)
    .map((tier) => {
      const r = byCode.get(tier.code) ?? null;
      const amount = r ? rowAmount(r) : '0';
      const amtDec = decOf(amount);
      networkTotal = networkTotal.plus(amtDec);

      // Status: CALCULATED (paid to a receiver) vs BURN (no qualified/eligible
      // ancestor → 记录销毁). A burned slot is reward_type=BURN and/or
      // reward_status=UNALLOCATED; both map to the display status 'BURN'.
      const rawStatus = firstStr(r?.reward_status);
      const status: 'CALCULATED' | 'BURN' =
        rawStatus === 'UNALLOCATED' || r?.reward_type === 'BURN' ? 'BURN' : 'CALCULATED';
      const allocated = status === 'CALCULATED';
      if (allocated) networkAllocated = networkAllocated.plus(amtDec);
      else networkBurned = networkBurned.plus(amtDec);

      // Ladder rates: prefer the stored snapshot string, else the config ladder.
      const coefficient = firstStr(r?.tier_coefficient) ?? tier.coefficient.toString();
      const cumulativeRate = firstStr(r?.cumulative_rate) ?? tier.cumulativeRate.toString();
      const previousCumulativeRate =
        firstStr(r?.previous_cumulative_rate, r?.previous_released_rate) ??
        ud3PreviousCumulativeRate(tier.code, config).toString();
      const incremental =
        firstStr(r?.incremental_rate) ?? ud3IncrementalRate(tier.code, config).toString();

      return {
        rewardTierCode: tier.code,
        rewardTierRank: tier.rank,
        coefficient,
        cumulativeRate,
        previousCumulativeRate,
        incrementalRate: incremental,
        amount,
        status,
        receiverWallet: allocated ? firstStr(r?.recipient_wallet) : null,
        receiverTierCode: allocated ? firstStr(r?.receiver_tier_code) : null,
        receiverTierRank:
          allocated && r?.receiver_tier_rank != null ? Number(r.receiver_tier_rank) : null,
        receiverRelationDepth:
          allocated && r?.relation_depth != null ? Number(r.relation_depth) : null,
        unallocatedReason: allocated ? null : firstStr(r?.unallocated_reason),
      };
    });

  // Conservation — allocated + burned must reconcile to the total exactly.
  const conserved = networkAllocated.plus(networkBurned).equals(networkTotal);

  return {
    order: {
      intentId: firstStr(eventRow.intent_id),
      depositorWallet: firstStr(eventRow.depositor_wallet),
      referrerWallet: firstStr(eventRow.referrer_wallet),
      principalUsdt: firstStr(
        eventRow.principal_amount,
        eventRow.deposit_usdt,
        guideRow?.principal_amount,
        ...tierRows.map((r) => r.principal_amount),
      ),
      networkRatePct: config.networkRate.toString(),
      algorithmVersion,
      configVersion: configVersion ?? config.version,
    },
    guide,
    tiers,
    networkTotalUd3: networkTotal.toString(),
    networkAllocatedUd3: networkAllocated.toString(),
    networkBurnedUd3: networkBurned.toString(),
    algorithmVersion,
    configVersion: configVersion ?? config.version,
    conserved,
  };
}

// Load a stake order's UD3 reward distribution by stake_intents.id. Selects `*`
// from both tables so the V3 per-tier snapshot columns are picked up. Orders with
// no V3 tier ledger rows (older/absent) return found:false gracefully.
async function getUd3OrderReward(sb: Sb, intentId: string) {
  const { data: event, error } = await sb
    .from('partner_ud3_events')
    .select('*')
    .eq('intent_id', intentId)
    .maybeSingle();
  if (error) throw error;
  if (!event) return { ok: true as const, found: false as const };

  const { data: ledger, error: ledgerErr } = await sb
    .from('partner_ud3_ledger')
    .select('*')
    .eq('event_id', event.id);
  if (ledgerErr) throw ledgerErr;

  const rows = (ledger ?? []) as Ud3LedgerRow[];
  if (!hasV3TierRows(rows)) return { ok: true as const, found: false as const };

  return {
    ok: true as const,
    found: true as const,
    ...mapUd3OrderReward(event as Ud3EventRow, rows),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const path = routePath(req);
  const sb = getSupabaseAdmin();

  try {
    if (req.method === 'GET' && path === '/health') {
      return jsonResponse({ ok: true, service: 'admin' });
    }

    const admin = await requireAdminUser(sb, req);

    if (req.method === 'GET' && path === '/me') {
      return jsonResponse({ ok: true, admin });
    }

    // Admin session login/logout event → audit_logs (for the 操作日志 page + 在线时长).
    if (req.method === 'POST' && path === '/session/event') {
      const body = await readJson<{ event?: 'login' | 'logout' }>(req).catch(() => ({} as { event?: string }));
      const ev = body.event === 'logout' ? 'logout' : 'login';
      await writeAuditLog(sb, {
        actorType: 'admin',
        actorId: admin.userId,
        action: `admin_${ev}`,
        entityType: 'admin_users',
        entityId: admin.userId,
        newValue: { at: new Date().toISOString(), username: admin.username },
      }).catch(() => {});
      return jsonResponse({ ok: true });
    }

    // Operation log (audit_logs) — every admin action + login/logout, newest first.
    if (req.method === 'GET' && path === '/audit-logs') {
      if (!adminHasPermission(admin, 'logs.read')) {
        throw new HttpError(403, 'Missing logs.read permission');
      }
      const url = new URL(req.url);
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? 300)));
      const action = url.searchParams.get('action');
      let q = sb
        .from('audit_logs')
        .select('*')
        // Only HUMAN admin actions — exclude system / turnkey_policy / webhook (代码操作).
        .eq('actor_type', 'admin')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (action) q = q.ilike('action', `%${action}%`);
      const { data, error } = await q;
      if (error) throw new HttpError(502, error.message);
      const rows = data ?? [];
      // Resolve admin usernames for actor_id so the UI shows who did what.
      const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[])];
      const nameMap = new Map<string, string>();
      if (ids.length) {
        const { data: admins } = await sb.from('admin_users').select('user_id, username').in('user_id', ids);
        for (const a of admins ?? []) nameMap.set(a.user_id as string, a.username as string);
      }
      return jsonResponse({
        ok: true,
        logs: rows.map((r) => ({ ...r, actor_name: nameMap.get(r.actor_id) ?? null })),
      });
    }

    if (req.method === 'GET' && path === '/dashboard') {
      return jsonResponse({ ok: true, ...(await dashboardStats(sb)) });
    }

    // ── Fund management: infra wallet balances (gas/treasury/settlement/flash) ──
    if (req.method === 'GET' && path === '/wallets') {
      return jsonResponse({ ok: true, ...(await getInfraWalletBalances(sb)) });
    }

    // One-click deposit-pool growth: derive N more deposit addresses (Turnkey HD).
    if (req.method === 'POST' && path === '/wallets/deposit-pool') {
      if (!adminHasPermission(admin, 'members.write')) {
        throw new HttpError(403, 'Insufficient permission');
      }
      const body = await readJson<{ count?: number }>(req).catch(() => ({}));
      const count = Math.max(1, Math.min(200, Math.floor(Number(body.count ?? 10))));
      const created = await deriveDepositAccounts(sb, count);
      await writeAuditLog(sb, {
        actorType: 'admin',
        actorId: admin.userId,
        action: 'deposit_pool_generate',
        entityType: 'wallet_accounts',
        entityId: null,
        newValue: { requested: count, created: created.length },
      });
      return jsonResponse({ ok: true, created: created.length });
    }

    // ── Treasury transfers (2/3 multisig) ──
    if (req.method === 'GET' && path === '/treasury/transfers') {
      const transfers = await listTreasuryTransfers(sb);
      return jsonResponse({ ok: true, transfers });
    }

    // Propose an outbound treasury transfer → submits a Turnkey multisig request.
    // T-A: dedicated treasury.write permission (superadmin bypasses).
    if (req.method === 'POST' && path === '/treasury/transfers') {
      if (!adminHasPermission(admin, 'treasury.write')) {
        throw new HttpError(403, 'Missing treasury.write permission');
      }
      const body = await readJson<{
        asset?: string;
        toAddress?: string;
        amount?: number | string;
        requestKey?: string;
        note?: string;
      }>(req).catch(() => ({}));
      const asset = body.asset === 'bnb' ? 'bnb' : 'usdt';
      const amount = Number(body.amount);
      if (!body.toAddress || !Number.isFinite(amount) || amount <= 0) {
        throw new HttpError(400, '收款地址与金额必填');
      }
      if (!body.requestKey?.trim()) {
        throw new HttpError(400, 'requestKey 必填（幂等键）');
      }
      // T-B: record who proposed so broadcast can enforce a different broadcaster.
      const row = await proposeTreasuryTransfer(sb, {
        asset,
        toAddress: String(body.toAddress),
        amount,
        requestKey: body.requestKey.trim(),
        createdBy: admin.userId,
        proposedBy: admin.userId,
        note: body.note,
      });
      await writeAdminAudit(sb, {
        actorId: admin.userId,
        actorRole: admin.role,
        action: 'treasury_transfer.propose',
        entityType: 'treasury_transfer_requests',
        entityId: row.id,
        before: null,
        after: { asset, to: row.to_address, amount, status: row.status, requestKey: row.request_key },
      });
      return jsonResponse({ ok: true, transfer: row });
    }

    // Broadcast an approved (2/3 quorum) transfer.
    // T-A: treasury.write. T-B: maker-checker enforced inside broadcastTreasuryTransfer.
    const broadcastMatch = path.match(/^\/treasury\/transfers\/([0-9a-f-]{36})\/broadcast$/);
    if (req.method === 'POST' && broadcastMatch) {
      if (!adminHasPermission(admin, 'treasury.write')) {
        throw new HttpError(403, 'Missing treasury.write permission');
      }
      const { data: beforeRow } = await sb
        .from('treasury_transfer_requests')
        .select('status, tx_hash, proposed_by')
        .eq('id', broadcastMatch[1])
        .maybeSingle();
      const row = await broadcastTreasuryTransfer(sb, broadcastMatch[1], admin.userId);
      await writeAdminAudit(sb, {
        actorId: admin.userId,
        actorRole: admin.role,
        action: 'treasury_transfer.broadcast',
        entityType: 'treasury_transfer_requests',
        entityId: row.id,
        before: beforeRow ?? null,
        after: { status: row.status, txHash: row.tx_hash },
        reason: `maker-checker broadcast (proposed_by=${row.proposed_by})`,
      });
      return jsonResponse({ ok: true, transfer: row });
    }

    // ── T-D: treasury destination allowlist management (treasury.write) ──
    if (req.method === 'GET' && path === '/treasury/allowlist') {
      const { data, error } = await sb
        .from('treasury_transfer_allowlist')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResponse({ ok: true, rows: data ?? [] });
    }

    if (req.method === 'POST' && path === '/treasury/allowlist') {
      if (!adminHasPermission(admin, 'treasury.write')) {
        throw new HttpError(403, 'Missing treasury.write permission');
      }
      const body = await readJson<{ address?: string; label?: string }>(req).catch(() => ({}));
      const address = String(body.address ?? '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        throw new HttpError(400, '无效的地址');
      }
      const { data, error } = await sb
        .from('treasury_transfer_allowlist')
        .upsert(
          { address, label: body.label ?? null, added_by: admin.userId },
          { onConflict: 'address' },
        )
        .select('*')
        .single();
      if (error) throw error;
      // Adding a destination widens what the treasury may pay out → audited.
      await writeAdminAudit(sb, {
        actorId: admin.userId,
        actorRole: admin.role,
        action: 'treasury_allowlist.add',
        entityType: 'treasury_transfer_allowlist',
        entityId: address,
        before: null,
        after: { address, label: body.label ?? null },
      });
      return jsonResponse({ ok: true, entry: data });
    }

    const allowlistDelMatch = path.match(/^\/treasury\/allowlist\/(0x[a-fA-F0-9]{40})$/);
    if (req.method === 'DELETE' && allowlistDelMatch) {
      if (!adminHasPermission(admin, 'treasury.write')) {
        throw new HttpError(403, 'Missing treasury.write permission');
      }
      const address = allowlistDelMatch[1];
      const { data: before } = await sb
        .from('treasury_transfer_allowlist')
        .select('*')
        .ilike('address', address)
        .maybeSingle();
      const { error } = await sb
        .from('treasury_transfer_allowlist')
        .delete()
        .ilike('address', address);
      if (error) throw error;
      await writeAdminAudit(sb, {
        actorId: admin.userId,
        actorRole: admin.role,
        action: 'treasury_allowlist.remove',
        entityType: 'treasury_transfer_allowlist',
        entityId: address,
        before: before ?? null,
        after: null,
      });
      return jsonResponse({ ok: true, removed: address });
    }

    if (req.method === 'GET' && path === '/members') {
      const url = new URL(req.url);
      return jsonResponse({ ok: true, ...(await listMembers(sb, url.searchParams)) });
    }

    // Member set-leader (payout-authorizing) → maker-checker approval flow.
    const leaderMatch = path.match(/^\/members\/(0x[a-fA-F0-9]{40})\/leader$/);
    if (req.method === 'POST' && leaderMatch) {
      if (!adminHasPermission(admin, 'members.write')) {
        throw new HttpError(403, 'Missing members.write permission');
      }
      const body = await readJson<{ isLeader?: boolean; reason?: string }>(req);
      if (typeof body.isLeader !== 'boolean') {
        throw new HttpError(400, 'isLeader (boolean) required');
      }
      const approval = await requestMemberSetLeader(
        sb,
        leaderMatch[1],
        body.isLeader,
        body.reason ?? null,
        admin,
      );
      return jsonResponse({ ok: true, pendingApproval: approval }, 202);
    }

    // Per-member subsidy-rate override (会员管理 / 合伙人管理). Separate `subsidies.rates`
    // permission; NOT payout-authorizing at set time (only future subsidy applications
    // use it, which have their own quota + maker-checker), so applied directly + audited.
    const rateMatch = path.match(/^\/members\/(0x[a-fA-F0-9]{40})\/subsidy-rate$/);
    if (req.method === 'POST' && rateMatch) {
      if (!adminHasPermission(admin, 'subsidies.rates')) {
        throw new HttpError(403, 'Missing subsidies.rates permission');
      }
      const body = await readJson<{ ratePct?: number | null }>(req);
      const ratePct = body.ratePct == null ? null : Number(body.ratePct);
      const result = await setMemberSubsidyRatePct(sb, rateMatch[1], ratePct);
      await writeAuditLog(sb, {
        actorType: 'admin',
        actorId: admin.userId,
        action: 'member_subsidy_rate_set',
        entityType: 'partner_accounts',
        entityId: rateMatch[1],
        newValue: { ratePct },
      }).catch(() => {});
      return jsonResponse({ ok: true, ...result });
    }

    const memberMatch = path.match(/^\/members\/(0x[a-fA-F0-9]{40})$/);
    if (req.method === 'GET' && memberMatch) {
      // Legacy detail bundle + compact mobile-UI contract. The new contract keys
      // (wallet/profile/stakeSummary/balances/referral) win on collision; the raw
      // legacy referrals row is preserved under `referralRow`.
      const legacy = await getMemberDetail(sb, memberMatch[1]);
      const bundle = await getMemberBundle(sb, memberMatch[1]);
      return jsonResponse({
        ok: true,
        ...legacy,
        referralRow: legacy.referral,
        ...bundle,
      });
    }

    // PATCH member remark (free-text admin note) → members.write, audited.
    if (req.method === 'PATCH' && memberMatch) {
      if (!adminHasPermission(admin, 'members.write')) {
        throw new HttpError(403, 'Missing members.write permission');
      }
      const body = await readJson<{ remark?: string }>(req);
      const pk = w(memberMatch[1]);
      const { data: before } = await sb
        .from('profiles')
        .select('remark')
        .ilike('wallet_address', pk)
        .maybeSingle();
      const { data: after, error } = await sb
        .from('profiles')
        .update({ remark: body.remark ?? null, updated_at: new Date().toISOString() })
        .ilike('wallet_address', pk)
        .select('wallet_address, remark')
        .maybeSingle();
      if (error) throw error;
      if (!after) throw new HttpError(404, 'Member profile not found');
      await writeAdminAudit(sb, {
        actorId: admin.userId,
        actorRole: admin.role,
        action: 'member.remark',
        entityType: 'profiles',
        entityId: pk,
        before: { remark: (before?.remark as string | null) ?? null },
        after: { remark: body.remark ?? null },
      });
      return jsonResponse({ ok: true, profile: after });
    }

    // Nested referral tree (bounded depth + node cap).
    if (req.method === 'GET' && path === '/referrals/tree') {
      const url = new URL(req.url);
      const root = (url.searchParams.get('root') ?? '').trim().toLowerCase();
      if (!/^0x[a-fA-F0-9]{40}$/.test(root)) {
        throw new HttpError(400, 'root wallet required');
      }
      const depth = Math.max(1, Math.min(5, Math.floor(Number(url.searchParams.get('depth') ?? 3))));
      const tree = await getReferralTree(sb, root, depth);
      return jsonResponse({ ok: true, ...tree });
    }

    if (req.method === 'GET' && path === '/referrals') {
      const url = new URL(req.url);
      return jsonResponse({ ok: true, ...(await listReferrals(sb, url.searchParams)) });
    }

    if (req.method === 'GET' && path === '/transactions') {
      const url = new URL(req.url);
      return jsonResponse({ ok: true, ...(await listTransactions(sb, url.searchParams)) });
    }

    if (req.method === 'GET' && path === '/partners') {
      const url = new URL(req.url);
      return jsonResponse({ ok: true, ...(await listPartners(sb, url.searchParams)) });
    }

    if (req.method === 'GET' && path === '/stakes') {
      const url = new URL(req.url);
      return jsonResponse({ ok: true, ...(await listStakes(sb, url.searchParams)) });
    }

    // A stake order's UD3 反向金 (bribe) reward distribution + burn, for the admin
    // order dialog. Read-only → stakes.read (superadmin bypasses).
    const ud3RewardMatch = path.match(/^\/orders\/([0-9a-f-]{36})\/ud3-reward$/);
    if (req.method === 'GET' && ud3RewardMatch) {
      if (!adminHasPermission(admin, 'stakes.read')) {
        throw new HttpError(403, 'Missing stakes.read permission');
      }
      return jsonResponse(await getUd3OrderReward(sb, ud3RewardMatch[1]));
    }

    if (req.method === 'GET' && path === '/subsidy-tickets') {
      const url = new URL(req.url);
      return jsonResponse({ ok: true, ...(await listSubsidyTickets(sb, url.searchParams)) });
    }

    if (req.method === 'GET' && path === '/program-settings') {
      const settings = await getPartnerProgramSettings(sb);
      return jsonResponse({ ok: true, settings });
    }

    if (req.method === 'PATCH' && path === '/program-settings') {
      if (!adminHasPermission(admin, 'subsidies.write')) {
        throw new HttpError(403, 'Missing subsidies.write permission');
      }
      const body = await readJson<{
        partnerSubsidyRatePct?: number;
        marketSubsidyRatePct?: number;
      }>(req);
      // Reward RATE fields scale every future payout -> maker-checker gated.
      // (All fields program-settings currently accepts are rate fields, so any
      // non-empty change is gated; a future cosmetic field would fall through
      // to the direct+audited apply below.)
      if (isPayoutAuthorizingChange(body)) {
        const before = await getPartnerProgramSettings(sb);
        const approval = await createApproval(sb, {
          action: APPROVAL_PROGRAM_SETTINGS,
          targetType: 'partner_program_settings',
          targetId: '1',
          payload: body,
          requestedBy: admin.userId,
        });
        // Record the request itself (no change applied yet).
        await writeAdminAudit(sb, {
          actorId: admin.userId,
          actorRole: admin.role,
          action: `${APPROVAL_PROGRAM_SETTINGS}.requested`,
          entityType: 'partner_program_settings',
          entityId: '1',
          before,
          after: body,
          reason: 'maker-checker requested; awaiting second admin',
        });
        return jsonResponse({ ok: true, pendingApproval: approval }, 202);
      }
      // Non-payout change: apply directly, but always audit.
      const before = await getPartnerProgramSettings(sb);
      const settings = await updatePartnerProgramSettings(sb, body, admin.username);
      await writeAdminAudit(sb, {
        actorId: admin.userId,
        actorRole: admin.role,
        action: APPROVAL_PROGRAM_SETTINGS,
        entityType: 'partner_program_settings',
        entityId: '1',
        before,
        after: settings,
      });
      return jsonResponse({ ok: true, settings });
    }

    // ── System parameters (参数管理) ──────────────────────────────────────────
    if (req.method === 'GET' && path === '/params') {
      requirePermission(admin, 'params.read');
      return jsonResponse({ ok: true, params: await getParams(sb) });
    }

    if (req.method === 'PATCH' && path === '/params') {
      requirePermission(admin, 'params.write');
      const body = await readJson<{ key?: string; value?: unknown }>(req);
      if (!body.key) throw new HttpError(400, 'key required');
      const before = (await getParams(sb)).find((p) => p.param_key === body.key) ?? null;
      const updated = await updateParam(sb, body.key, body.value, admin.username);
      await writeAdminAudit(sb, {
        actorId: admin.userId,
        actorRole: admin.role,
        action: 'params.update',
        entityType: 'system_params',
        entityId: body.key,
        before,
        after: updated,
      });
      return jsonResponse({ ok: true, param: updated });
    }

    // ── Heartbeat orders (心跳订单) ──────────────────────────────────────────
    if (req.method === 'GET' && path === '/heartbeat/config') {
      requirePermission(admin, 'params.read');
      const [config, stateRes] = await Promise.all([
        getHeartbeatConfig(sb),
        sb.from('heartbeat_state').select('last_tick_at, cumulative_count').eq('id', 'default').maybeSingle(),
      ]);
      return jsonResponse({ ok: true, config, state: stateRes.data ?? null });
    }

    if (req.method === 'PATCH' && path === '/heartbeat/config') {
      requirePermission(admin, 'params.write');
      const body = await readJson<{
        enabled?: boolean;
        intervalSeconds?: number;
        amountMin?: number;
        amountMax?: number;
      }>(req);
      const before = await getHeartbeatConfig(sb);
      const config = await updateHeartbeatConfig(sb, body, admin.username);
      await writeAdminAudit(sb, {
        actorId: admin.userId,
        actorRole: admin.role,
        action: 'heartbeat.config.update',
        entityType: 'heartbeat_config',
        entityId: 'default',
        before,
        after: config,
      });
      return jsonResponse({ ok: true, config });
    }

    if (req.method === 'GET' && path === '/heartbeat/orders') {
      requirePermission(admin, 'params.read');
      const [ordersRes, statsRes] = await Promise.all([
        sb
          .from('heartbeat_orders')
          .select('id, address, amount_usdt, d3, round, source, tx_hash, created_by, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        sb.from('heartbeat_stats').select('source, order_count, usdt_total'),
      ]);
      return jsonResponse({ ok: true, orders: ordersRes.data ?? [], stats: statsRes.data ?? [] });
    }

    if (req.method === 'POST' && path === '/heartbeat/orders') {
      requirePermission(admin, 'params.write');
      const body = await readJson<{ amountUsdt?: number; address?: string }>(req);
      if (body.amountUsdt == null) throw new HttpError(400, 'amountUsdt required');
      const order = await insertHeartbeatOrder(sb, {
        amountUsdt: Number(body.amountUsdt),
        address: body.address,
        source: 'manual',
        createdBy: admin.username,
      });
      await writeAdminAudit(sb, {
        actorId: admin.userId,
        actorRole: admin.role,
        action: 'heartbeat.order.add',
        entityType: 'heartbeat_orders',
        entityId: String((order as { id?: string }).id ?? ''),
        before: null,
        after: order,
      });
      return jsonResponse({ ok: true, order });
    }

    if (req.method === 'POST' && path === '/heartbeat/orders/generate') {
      requirePermission(admin, 'params.write');
      const order = await generateHeartbeatOrderNow(sb, admin.username);
      await writeAdminAudit(sb, {
        actorId: admin.userId,
        actorRole: admin.role,
        action: 'heartbeat.order.generate',
        entityType: 'heartbeat_orders',
        entityId: String((order as { id?: string }).id ?? ''),
        before: null,
        after: order,
      });
      return jsonResponse({ ok: true, order });
    }

    const ticketMatch = path.match(/^\/subsidy-tickets\/([0-9a-f-]{36})$/);
    if (req.method === 'GET' && ticketMatch) {
      return jsonResponse({ ok: true, ...(await getSubsidyTicket(sb, ticketMatch[1])) });
    }

    if (req.method === 'PATCH' && ticketMatch) {
      if (!adminHasPermission(admin, 'subsidies.write')) {
        throw new HttpError(403, 'Missing subsidies.write permission');
      }
      const body = await readJson<{
        status?: string;
        adminNote?: string;
        assignedAdmin?: string;
        marketLeaderStatus?: string;
      }>(req);
      const ticketId = ticketMatch[1];
      const { data: before } = await sb
        .from('partner_subsidy_tickets')
        .select('*')
        .eq('id', ticketId)
        .maybeSingle();
      if (!before) throw new HttpError(404, 'Ticket not found');

      // Flipping a ticket to approved/paid authorizes a disbursement ->
      // maker-checker gated. Other patches (notes, assignment, reject/close,
      // market-leader flag) are applied directly but always audited.
      if (isPayoutAuthorizingChange(body)) {
        const approval = await createApproval(sb, {
          action: APPROVAL_SUBSIDY_TICKET,
          targetType: 'partner_subsidy_tickets',
          targetId: ticketId,
          payload: body,
          requestedBy: admin.userId,
        });
        await writeAdminAudit(sb, {
          actorId: admin.userId,
          actorRole: admin.role,
          action: `${APPROVAL_SUBSIDY_TICKET}.requested`,
          entityType: 'partner_subsidy_tickets',
          entityId: ticketId,
          before,
          after: body,
          reason: 'maker-checker requested; awaiting second admin',
        });
        return jsonResponse({ ok: true, pendingApproval: approval }, 202);
      }

      const result = await patchSubsidyTicket(sb, ticketId, body, admin);
      await writeAdminAudit(sb, {
        actorId: admin.userId,
        actorRole: admin.role,
        action: APPROVAL_SUBSIDY_TICKET,
        entityType: 'partner_subsidy_tickets',
        entityId: ticketId,
        before,
        after: result.ticket,
      });
      // Any non-eligibility market_leader_status write (e.g. rejected/revoked)
      // still mutates partner_accounts -> capture it in its own audit row.
      if (result.marketLeader) {
        await writeAdminAudit(sb, {
          actorId: admin.userId,
          actorRole: admin.role,
          action: 'partner_account.market_leader_status',
          entityType: 'partner_accounts',
          entityId: result.marketLeader.wallet,
          before: { market_leader_status: result.marketLeader.before },
          after: { market_leader_status: result.marketLeader.after },
        });
      }
      return jsonResponse({ ok: true, ...result });
    }

    const msgMatch = path.match(/^\/subsidy-tickets\/([0-9a-f-]{36})\/messages$/);
    if (req.method === 'POST' && msgMatch) {
      if (!adminHasPermission(admin, 'subsidies.write')) {
        throw new HttpError(403, 'Missing subsidies.write permission');
      }
      const body = await readJson<{ body: string; requestInfo?: boolean }>(req);
      if (!body.body?.trim()) throw new HttpError(400, 'body required');
      const result = await addTicketMessage(sb, msgMatch[1], body.body.trim(), admin, body.requestInfo);
      // Adding a message is a mutation (may flip ticket status) -> audit it.
      await writeAdminAudit(sb, {
        actorId: admin.userId,
        actorRole: admin.role,
        action: 'subsidy_ticket.message',
        entityType: 'partner_subsidy_tickets',
        entityId: msgMatch[1],
        before: null,
        after: { body: body.body.trim(), requestInfo: Boolean(body.requestInfo) },
      });
      return jsonResponse({ ok: true, ...result });
    }

    // ── V-08 maker-checker approval queue ────────────────────────────────────
    if (req.method === 'GET' && path === '/approvals') {
      if (!adminHasPermission(admin, 'subsidies.write')) {
        throw new HttpError(403, 'Missing subsidies.write permission');
      }
      return jsonResponse({ ok: true, ...(await listPendingApprovals(sb)) });
    }

    const approveMatch = path.match(/^\/approvals\/([0-9a-f-]{36})\/approve$/);
    if (req.method === 'POST' && approveMatch) {
      // R-3: the permission required depends on the pending action, so the
      // check is done inside approveApproval once the approval is loaded
      // (subsidies.write for subsidy/program actions, security.write for
      // security/risk_limits actions). No coarse pre-gate here.
      return jsonResponse({ ok: true, ...(await approveApproval(sb, approveMatch[1], admin)) });
    }

    const rejectMatch = path.match(/^\/approvals\/([0-9a-f-]{36})\/reject$/);
    if (req.method === 'POST' && rejectMatch) {
      // R-3: same action-matched permission check inside rejectApproval.
      const body = await readJson<{ reason?: string }>(req).catch(() => ({}));
      return jsonResponse({ ok: true, ...(await rejectApproval(sb, rejectMatch[1], admin, body.reason)) });
    }

    // ── Security / circuit-breaker / alerts (Agent O) ─────────────────────────
    // Reads: any admin. Writes: security.write (or superadmin).
    if (req.method === 'GET' && path === '/security/overview') {
      const [pauseRes, limitsRes, alertCounts] = await Promise.all([
        sb
          .from('system_pause_flags')
          .select('flag, paused, reason, updated_at')
          .order('flag', { ascending: true }),
        sb.from('risk_limits').select('*').eq('id', 1).maybeSingle(),
        countOpenAlertsBySeverity(sb),
      ]);
      // computeSolvency reaches on-chain (turnkey/viem); dynamic import keeps
      // that heavy graph out of module load, and any failure degrades to
      // solvency:null so the panel still renders.
      let solvency: unknown = null;
      try {
        const { computeSolvency } = await import('../_shared/solvency.ts');
        solvency = await computeSolvency(sb);
      } catch (e) {
        console.error('[admin] computeSolvency failed', e);
        solvency = null;
      }
      return jsonResponse({
        ok: true,
        pauseFlags: pauseRes.data ?? [],
        limits: limitsRes.data ?? null,
        solvency,
        alertCounts,
      });
    }

    if (req.method === 'GET' && path === '/security/alerts') {
      const url = new URL(req.url);
      const status = url.searchParams.get('status') ?? 'open';
      const severity = url.searchParams.get('severity');
      let q = sb
        .from('security_alerts')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(200);
      if (severity) q = q.eq('severity', severity);
      const { data, error } = await q;
      if (error) throw error;
      return jsonResponse({ ok: true, rows: data ?? [] });
    }

    const alertAckMatch = path.match(/^\/security\/alerts\/([0-9a-f-]{36})\/ack$/);
    if (req.method === 'POST' && alertAckMatch) {
      requireSecurityWrite(admin);
      const alert = await ackAlert(sb, alertAckMatch[1], admin);
      return jsonResponse({ ok: true, alert });
    }

    if (req.method === 'POST' && path === '/security/pause') {
      requireSecurityWrite(admin);
      const body = await readJson<{ flag?: string; reason?: string }>(req);
      const flag = String(body.flag ?? '').trim();
      if (!isKnownPauseFlag(flag)) throw new HttpError(400, `Unknown pause flag: ${flag}`);
      const flagRow = await pauseFlag(sb, flag, body.reason ?? null, admin);
      return jsonResponse({ ok: true, flag: flagRow });
    }

    if (req.method === 'POST' && path === '/security/unpause') {
      requireSecurityWrite(admin);
      const body = await readJson<{ flag?: string; reason?: string }>(req);
      const flag = String(body.flag ?? '').trim();
      if (!isKnownPauseFlag(flag)) throw new HttpError(400, `Unknown pause flag: ${flag}`);
      const approval = await requestUnpause(sb, flag, body.reason ?? null, admin);
      return jsonResponse({ ok: true, pendingApproval: approval }, 202);
    }

    if (req.method === 'GET' && path === '/security/limits') {
      const { data, error } = await sb.from('risk_limits').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return jsonResponse({ ok: true, limits: data ?? null });
    }

    if (req.method === 'PATCH' && path === '/security/limits') {
      requireSecurityWrite(admin);
      const body = await readJson<Record<string, unknown>>(req);
      const patch = sanitizeRiskLimitsPatch(body);
      if (Object.keys(patch).length === 0) {
        throw new HttpError(400, 'No valid risk_limits fields to update');
      }
      const approval = await requestRiskLimitsUpdate(sb, patch, admin);
      return jsonResponse({ ok: true, pendingApproval: approval }, 202);
    }

    // ── Admin RBAC: roles & admin management ─────────────────────────────────
    // Permission catalog + role presets for the Roles page. Any admins.read holder
    // (superadmin bypasses).
    if (req.method === 'GET' && path === '/permissions') {
      requirePermission(admin, 'admins.read');
      return jsonResponse({ ok: true, ...permissionCatalogResponse() });
    }

    if (req.method === 'GET' && path === '/admins') {
      requirePermission(admin, 'admins.read');
      return jsonResponse({ ok: true, ...(await listAdmins(sb)) });
    }

    // Create an admin: provision/link the auth user, then upsert admin_users.
    // Superadmin only.
    if (req.method === 'POST' && path === '/admins') {
      requireSuperadmin(admin);
      const body = await readJson<{
        email?: string;
        role?: string;
        permissions?: unknown;
        username?: string;
      }>(req);
      return jsonResponse({ ok: true, ...(await createAdmin(sb, body, admin)) });
    }

    const adminUserMatch = path.match(/^\/admins\/([0-9a-fA-F-]{36})$/);
    // Update an admin's role and/or explicit permissions. Requires admins.manage
    // AND passes the privilege-escalation / self-escalation guard.
    if (req.method === 'PATCH' && adminUserMatch) {
      requirePermission(admin, 'admins.manage');
      const body = await readJson<{ role?: string; permissions?: unknown }>(req);
      return jsonResponse({ ok: true, ...(await patchAdmin(sb, adminUserMatch[1], body, admin)) });
    }

    // Revoke an admin. Superadmin only; cannot delete self.
    if (req.method === 'DELETE' && adminUserMatch) {
      requireSuperadmin(admin);
      return jsonResponse({ ok: true, ...(await deleteAdmin(sb, adminUserMatch[1], admin)) });
    }

    throw new HttpError(404, 'Not found');
  } catch (e) {
    if (e instanceof HttpError) {
      return jsonResponse({ error: e.message }, e.status);
    }
    console.error('[admin]', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
