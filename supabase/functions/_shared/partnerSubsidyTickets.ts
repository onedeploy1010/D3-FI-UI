import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fetchPartnerTeamStats } from './partnerPerformance.ts';
import { HttpError } from './wallet.ts';
import {
  assertReceiptPathsOwnedByWallet,
  assertSubsidyAmountWithinQuota,
  type SubsidyApplicationType,
  type SubsidyTicketKind,
} from './partnerSubsidySettings.ts';

type Sb = SupabaseClient;

export type { SubsidyTicketKind, SubsidyApplicationType };

export async function createPartnerSubsidyTicket(
  sb: Sb,
  wallet: string,
  input: {
    kind: SubsidyTicketKind;
    amountUsd?: number;
    purpose?: string;
    applicationType?: SubsidyApplicationType;
    receiptPaths?: string[];
  },
) {
  const { data: account } = await sb
    .from('partner_accounts')
    .select('is_partner, market_leader_status')
    .ilike('wallet_address', wallet)
    .maybeSingle();

  if (!account?.is_partner) {
    throw new HttpError(403, 'Partner account required');
  }

  if (input.kind === 'market_subsidy' || input.kind === 'market_leader') {
    if (account.market_leader_status !== 'approved') {
      throw new HttpError(400, 'Market leader approval required');
    }
  }

  if (input.kind === 'market_leader') {
    const { data: existing } = await sb
      .from('partner_subsidy_tickets')
      .select('id')
      .ilike('wallet_address', wallet)
      .eq('kind', 'market_leader')
      .in('status', ['open', 'pending_info', 'under_review', 'approved'])
      .maybeSingle();
    if (existing) throw new HttpError(409, 'Market leader application already in progress');

    await sb
      .from('partner_accounts')
      .update({ market_leader_status: 'pending', updated_at: new Date().toISOString() })
      .ilike('wallet_address', wallet);
  }

  const stats = await fetchPartnerTeamStats(sb, wallet);
  const amountUsd = input.kind === 'market_leader' ? null : Number(input.amountUsd ?? 0);
  if (input.kind !== 'market_leader' && (!Number.isFinite(amountUsd) || amountUsd <= 0)) {
    throw new HttpError(400, 'amountUsd required');
  }

  let applicationType: SubsidyApplicationType | null = null;
  let receiptPaths: string[] = [];

  if (input.kind !== 'market_leader') {
    applicationType = input.applicationType ?? 'reserve';
    if (applicationType !== 'reserve' && applicationType !== 'reimbursement') {
      throw new HttpError(400, 'Invalid applicationType');
    }
    receiptPaths = (input.receiptPaths ?? []).filter(Boolean);
    if (applicationType === 'reimbursement' && receiptPaths.length === 0) {
      throw new HttpError(400, 'Receipt attachments required for reimbursement');
    }
    assertReceiptPathsOwnedByWallet(wallet, receiptPaths);
    await assertSubsidyAmountWithinQuota(sb, wallet, input.kind, amountUsd!);
  }

  const { data: ticket, error } = await sb
    .from('partner_subsidy_tickets')
    .insert({
      wallet_address: wallet,
      kind: input.kind,
      amount_usd: amountUsd,
      purpose: input.purpose?.trim() ?? '',
      application_type: applicationType,
      receipt_paths: receiptPaths,
      status: 'open',
      team_performance_usd: stats.teamPerformanceUsd,
      daily_new_performance_usd: stats.dailyNewPerformanceUsd,
      personal_performance_usd: stats.personalPerformanceUsd,
    })
    .select('*')
    .single();
  if (error) throw error;

  const typeLabel =
    applicationType === 'reimbursement' ? '报销' : applicationType === 'reserve' ? '预备金' : '';
  const bodyParts = [
    typeLabel ? `类型：${typeLabel}` : null,
    input.purpose?.trim() || '提交申请',
    receiptPaths.length ? `附件 ${receiptPaths.length} 个` : null,
  ].filter(Boolean);

  await sb.from('partner_subsidy_messages').insert({
    ticket_id: ticket.id,
    author_type: 'applicant',
    author_name: wallet.slice(0, 10),
    body: bodyParts.join(' · '),
  });

  return ticket;
}

export async function listWalletSubsidyTickets(sb: Sb, wallet: string) {
  const { data, error } = await sb
    .from('partner_subsidy_tickets')
    .select('*')
    .ilike('wallet_address', wallet)
    .order('applied_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addApplicantTicketMessage(
  sb: Sb,
  wallet: string,
  ticketId: string,
  body: string,
) {
  const { data: ticket } = await sb
    .from('partner_subsidy_tickets')
    .select('id, wallet_address, status')
    .eq('id', ticketId)
    .maybeSingle();
  if (!ticket || ticket.wallet_address.toLowerCase() !== wallet.toLowerCase()) {
    throw new HttpError(404, 'Ticket not found');
  }
  if (!['open', 'pending_info', 'under_review'].includes(ticket.status as string)) {
    throw new HttpError(400, 'Ticket is closed');
  }

  const { data: msg, error } = await sb
    .from('partner_subsidy_messages')
    .insert({
      ticket_id: ticketId,
      author_type: 'applicant',
      author_name: wallet.slice(0, 10),
      body,
    })
    .select('*')
    .single();
  if (error) throw error;

  if (ticket.status === 'pending_info') {
    await sb
      .from('partner_subsidy_tickets')
      .update({ status: 'under_review', updated_at: new Date().toISOString() })
      .eq('id', ticketId);
  }

  return msg;
}
