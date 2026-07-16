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
        sd3Balance: Number(a?.sd3_balance ?? 0),
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

  const { data: sd3Transfers } = await sb
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

  const { data: sd3Settlements } = await sb
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
    sd3Transfers: sd3Transfers ?? [],
    yieldSettlements: yieldSettlements ?? [],
    sd3Settlements: sd3Settlements ?? [],
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
      note: 'sD3 质押通过伞下转账入众筹；以下为 sD3 转账记录。',
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

  if (existing.kind === 'market_leader' && body.status === 'approved') {
    await sb
      .from('partner_accounts')
      .update({ market_leader_status: 'approved', updated_at: now })
      .ilike('wallet_address', w(existing.wallet_address as string));
  }
  if (existing.kind === 'market_leader' && body.status === 'rejected') {
    await sb
      .from('partner_accounts')
      .update({ market_leader_status: 'rejected', updated_at: now })
      .ilike('wallet_address', w(existing.wallet_address as string));
  }
  if (body.marketLeaderStatus) {
    await sb
      .from('partner_accounts')
      .update({ market_leader_status: body.marketLeaderStatus, updated_at: now })
      .ilike('wallet_address', w(existing.wallet_address as string));
  }

  await sb.from('partner_subsidy_messages').insert({
    ticket_id: ticketId,
    author_type: 'system',
    author_name: admin.username,
    body: `状态更新为 ${body.status ?? '—'}`,
  });

  return { ticket };
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

// Approve a pending request: enforce separation of duties, apply the original
// change, mark it executed, and write the immutable admin audit row.
async function approveApproval(sb: Sb, id: string, admin: AdminProfile) {
  const approval = await loadPendingApproval(sb, id);
  // Separation of duties: approver MUST differ from the requester.
  assertDifferentApprover(approval.requested_by as string, admin.userId);

  const payload = (approval.payload ?? {}) as Record<string, unknown>;
  let before: unknown = null;
  let after: unknown = null;

  if (approval.action === APPROVAL_PROGRAM_SETTINGS) {
    before = await getPartnerProgramSettings(sb);
    after = await updatePartnerProgramSettings(sb, payload, admin.username);
  } else if (approval.action === APPROVAL_SUBSIDY_TICKET) {
    const { data: existing } = await sb
      .from('partner_subsidy_tickets')
      .select('*')
      .eq('id', approval.target_id as string)
      .maybeSingle();
    before = existing ?? null;
    const res = await patchSubsidyTicket(sb, approval.target_id as string, payload, admin);
    after = res.ticket;
  } else {
    throw new HttpError(400, `Unknown approval action: ${approval.action}`);
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await sb
    .from('admin_action_approvals')
    .update({ status: 'executed', approved_by: admin.userId, approved_at: now })
    .eq('id', id)
    .eq('status', 'pending') // guard against a concurrent approve
    .select('*')
    .single();
  if (error) throw error;

  await writeAdminAudit(sb, {
    actorId: admin.userId,
    actorRole: admin.role,
    action: approval.action as string,
    entityType: approval.target_type as string,
    entityId: approval.target_id as string,
    before,
    after,
    reason: `maker-checker approved (requested_by=${approval.requested_by})`,
  });

  return { approval: updated };
}

async function rejectApproval(
  sb: Sb,
  id: string,
  admin: AdminProfile,
  reason?: string,
) {
  const approval = await loadPendingApproval(sb, id);
  // Separation of duties applies to rejection too.
  assertDifferentApprover(approval.requested_by as string, admin.userId);

  const now = new Date().toISOString();
  const { data: updated, error } = await sb
    .from('admin_action_approvals')
    .update({
      status: 'rejected',
      approved_by: admin.userId,
      approved_at: now,
      reason: reason ?? null,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .single();
  if (error) throw error;

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

  return { approval: updated };
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

    throw new HttpError(404, 'Not found');
  } catch (e) {
    if (e instanceof HttpError) {
      return jsonResponse({ error: e.message }, e.status);
    }
    console.error('[admin]', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
