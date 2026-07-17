import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { adminHasPermission, requireAdminUser } from '../_shared/adminAuth.ts';
import { fetchPartnerTeamStats } from '../_shared/partnerPerformance.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { HttpError } from '../_shared/wallet.ts';
import {
  getPartnerProgramSettings,
  signSubsidyReceiptDownloads,
  updatePartnerProgramSettings,
} from '../_shared/partnerSubsidySettings.ts';
import {
  assertDifferentApprover,
  isPayoutAuthorizingChange,
  writeAdminAudit,
} from '../_shared/audit.ts';
import type { AdminProfile } from '../_shared/adminAuth.ts';

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
      'wallet_address, is_partner, sd3_balance, pending_usdt_yield, market_leader_status, joined_at, created_at',
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

  const rows = await Promise.all(
    allWallets.map(async (pk) => {
      const a = accountMap.get(pk);
      const stats = await fetchPartnerTeamStats(sb, pk).catch(() => null);
      const ref = referralMap.get(pk);
      return {
        walletAddress: pk,
        isPartner: Boolean(a?.is_partner),
        ud3Balance: Number(a?.sd3_balance ?? 0),
        pendingUsdtYield: Number(a?.pending_usdt_yield ?? 0),
        marketLeaderStatus: a?.market_leader_status ?? 'none',
        joinedAt: a?.joined_at ?? null,
        createdAt: a?.created_at ?? ref?.referredAt ?? null,
        sponsorWallet: ref?.sponsor ?? null,
        referredAt: ref?.referredAt ?? null,
        teamPerformanceUsd: stats?.teamPerformanceUsd ?? 0,
        personalPerformanceUsd: stats?.personalPerformanceUsd ?? 0,
        dailyNewPerformanceUsd: stats?.dailyNewPerformanceUsd ?? 0,
      };
    }),
  );

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
  const limit = Math.min(Number(params.get('limit') ?? 100), 500);

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

  const { data: positions, error } = await sb
    .from('partner_stake_positions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return { kind: 'usdt', rows: positions ?? [] };
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
};

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
  ];
  if (!KNOWN_ACTIONS.includes(action)) {
    throw new HttpError(400, `Unknown approval action: ${action}`);
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

    if (req.method === 'GET' && path === '/dashboard') {
      return jsonResponse({ ok: true, ...(await dashboardStats(sb)) });
    }

    if (req.method === 'GET' && path === '/members') {
      const url = new URL(req.url);
      return jsonResponse({ ok: true, ...(await listMembers(sb, url.searchParams)) });
    }

    const memberMatch = path.match(/^\/members\/(0x[a-fA-F0-9]{40})$/);
    if (req.method === 'GET' && memberMatch) {
      return jsonResponse({ ok: true, ...(await getMemberDetail(sb, memberMatch[1])) });
    }

    if (req.method === 'GET' && path === '/referrals') {
      const url = new URL(req.url);
      return jsonResponse({ ok: true, ...(await listReferrals(sb, url.searchParams)) });
    }

    if (req.method === 'GET' && path === '/partners') {
      const url = new URL(req.url);
      return jsonResponse({ ok: true, ...(await listPartners(sb, url.searchParams)) });
    }

    if (req.method === 'GET' && path === '/stakes') {
      const url = new URL(req.url);
      return jsonResponse({ ok: true, ...(await listStakes(sb, url.searchParams)) });
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
      if (!adminHasPermission(admin, 'subsidies.write')) {
        throw new HttpError(403, 'Missing subsidies.write permission');
      }
      return jsonResponse({ ok: true, ...(await approveApproval(sb, approveMatch[1], admin)) });
    }

    const rejectMatch = path.match(/^\/approvals\/([0-9a-f-]{36})\/reject$/);
    if (req.method === 'POST' && rejectMatch) {
      if (!adminHasPermission(admin, 'subsidies.write')) {
        throw new HttpError(403, 'Missing subsidies.write permission');
      }
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

    throw new HttpError(404, 'Not found');
  } catch (e) {
    if (e instanceof HttpError) {
      return jsonResponse({ error: e.message }, e.status);
    }
    console.error('[admin]', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
