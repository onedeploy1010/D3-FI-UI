import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fetchPartnerTeamStats } from './partnerPerformance.ts';
import { HttpError } from './wallet.ts';

type Sb = SupabaseClient;

export type PartnerProgramSettings = {
  partnerSubsidyRatePct: number;
  marketSubsidyRatePct: number;
};

export type SubsidyTicketKind = 'partner_subsidy' | 'market_subsidy' | 'market_leader';
export type SubsidyApplicationType = 'reserve' | 'reimbursement';

const DEFAULT_SETTINGS: PartnerProgramSettings = {
  partnerSubsidyRatePct: 10,
  marketSubsidyRatePct: 5,
};

export async function getPartnerProgramSettings(sb: Sb): Promise<PartnerProgramSettings> {
  const { data, error } = await sb
    .from('partner_program_settings')
    .select('partner_subsidy_rate_pct, market_subsidy_rate_pct')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  return {
    partnerSubsidyRatePct: Number(data.partner_subsidy_rate_pct ?? DEFAULT_SETTINGS.partnerSubsidyRatePct),
    marketSubsidyRatePct: Number(data.market_subsidy_rate_pct ?? DEFAULT_SETTINGS.marketSubsidyRatePct),
  };
}

export async function updatePartnerProgramSettings(
  sb: Sb,
  input: { partnerSubsidyRatePct?: number; marketSubsidyRatePct?: number },
  updatedBy?: string,
) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.partnerSubsidyRatePct != null) {
    const v = Number(input.partnerSubsidyRatePct);
    if (!Number.isFinite(v) || v < 0 || v > 100) throw new HttpError(400, 'Invalid partnerSubsidyRatePct');
    patch.partner_subsidy_rate_pct = v;
  }
  if (input.marketSubsidyRatePct != null) {
    const v = Number(input.marketSubsidyRatePct);
    if (!Number.isFinite(v) || v < 0 || v > 100) throw new HttpError(400, 'Invalid marketSubsidyRatePct');
    patch.market_subsidy_rate_pct = v;
  }
  if (updatedBy) patch.updated_by = updatedBy;

  const { data, error } = await sb
    .from('partner_program_settings')
    .update(patch)
    .eq('id', 1)
    .select('*')
    .single();
  if (error) throw error;
  return {
    partnerSubsidyRatePct: Number(data.partner_subsidy_rate_pct),
    marketSubsidyRatePct: Number(data.market_subsidy_rate_pct),
  };
}

function activeTicketStatuses() {
  return ['open', 'pending_info', 'under_review', 'approved', 'paid'];
}

export async function computeSubsidyQuota(
  sb: Sb,
  wallet: string,
  kind: 'partner_subsidy' | 'market_subsidy',
) {
  const [settings, stats, tickets] = await Promise.all([
    getPartnerProgramSettings(sb),
    fetchPartnerTeamStats(sb, wallet),
    sb
      .from('partner_subsidy_tickets')
      .select('kind, amount_usd, status')
      .ilike('wallet_address', wallet)
      .eq('kind', kind)
      .in('status', activeTicketStatuses()),
  ]);

  const ratePct =
    kind === 'partner_subsidy' ? settings.partnerSubsidyRatePct : settings.marketSubsidyRatePct;
  const rate = ratePct / 100;
  const base = stats.dailyNewPerformanceUsd;
  const cap = Math.round(base * rate * 100) / 100;
  const reserved = (tickets.data ?? []).reduce((s, t) => s + Number(t.amount_usd ?? 0), 0);
  const remaining = Math.max(0, Math.round((cap - reserved) * 100) / 100);

  return {
    ratePct,
    basePerformanceUsd: base,
    cap,
    reserved,
    remaining,
  };
}

export async function assertSubsidyAmountWithinQuota(
  sb: Sb,
  wallet: string,
  kind: 'partner_subsidy' | 'market_subsidy',
  amountUsd: number,
) {
  const quota = await computeSubsidyQuota(sb, wallet, kind);
  if (amountUsd > quota.remaining) {
    throw new HttpError(400, 'Amount exceeds subsidy quota', { quota });
  }
  return quota;
}

const RECEIPT_BUCKET = 'partner-subsidy-receipts';
const MAX_RECEIPT_BYTES = 52_428_800;

export async function signSubsidyReceiptUploads(
  sb: Sb,
  wallet: string,
  files: Array<{ name: string; contentType: string; size: number }>,
) {
  if (!files.length) throw new HttpError(400, 'files required');
  if (files.length > 12) throw new HttpError(400, 'Too many files (max 12)');

  const uploads: Array<{ path: string; signedUrl: string; token: string; contentType: string }> = [];

  for (const file of files) {
    if (file.size <= 0 || file.size > MAX_RECEIPT_BYTES) {
      throw new HttpError(400, `File too large: ${file.name}`);
    }
    const safeExt = (file.name.split('.').pop() ?? 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'bin';
    const path = `${wallet.toLowerCase()}/${crypto.randomUUID()}.${safeExt}`;
    const { data, error } = await sb.storage.from(RECEIPT_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new HttpError(502, error?.message ?? 'Failed to sign upload');
    uploads.push({
      path,
      signedUrl: data.signedUrl,
      token: data.token,
      contentType: file.contentType,
    });
  }

  return { bucket: RECEIPT_BUCKET, uploads };
}

export async function signSubsidyReceiptDownloads(sb: Sb, paths: string[]) {
  const out: Array<{ path: string; signedUrl: string }> = [];
  for (const path of paths) {
    const { data, error } = await sb.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) continue;
    out.push({ path, signedUrl: data.signedUrl });
  }
  return out;
}

export function assertReceiptPathsOwnedByWallet(wallet: string, paths: string[]) {
  const prefix = `${wallet.toLowerCase()}/`;
  for (const path of paths) {
    if (!path.startsWith(prefix)) {
      throw new HttpError(400, 'Invalid receipt path');
    }
  }
}
