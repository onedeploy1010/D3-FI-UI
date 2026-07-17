import { corsHeaders, jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { DEMO_POC_SCORE, isDemoModeRequest, isDemoWalletAddress } from '../_shared/demo.ts';
import { resetDemoPartnerSession } from '../_shared/demoPartnerReset.ts';
import { getPrivyToken } from '../_shared/privy.ts';
import { clientIpFromRequest, issueNonce, verifySiweAndIssueToken, verifySiweSession } from '../_shared/siwe.ts';
import {
  createPrivyTreasuryWallet,
  executePrivyWalletRpc,
  signRpcBodyWithPrivateKey,
  signRpcBodyWithUserJwt,
} from '../_shared/privyApi.ts';
import {
  buildDividendAttestationRpcBody,
  getTreasuryAuthPrivateKey,
  isPrivyOnchainEnabled,
} from '../_shared/privySign.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import {
  collectPartnerDownlineWallets,
  fetchPartnerDirectLineStats,
  fetchPartnerMemberWallets,
  fetchPartnerReferralNodeStats,
  fetchPartnerTeamStats,
} from '../_shared/partnerPerformance.ts';
import { fetchPartnerAccountBundle } from '../_shared/partnerSettlement.ts';
import {
  isReferralRegistryConfigured,
  upsertReferralFromChain,
  verifyOnchainBinding,
} from '../_shared/referralRegistry.ts';
import {
  addApplicantTicketMessage,
  createPartnerSubsidyTicket,
  listWalletSubsidyTickets,
} from '../_shared/partnerSubsidyTickets.ts';
import {
  computeSubsidyQuota,
  getPartnerProgramSettings,
  signSubsidyReceiptUploads,
} from '../_shared/partnerSubsidySettings.ts';
import {
  HttpError,
  isEthAddress,
  shortWallet,
  walletEquals,
} from '../_shared/wallet.ts';
import { requireActorWallet } from '../_shared/requireActor.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

type Sb = ReturnType<typeof getSupabaseAdmin>;

async function findProfileByWallet(sb: Sb, wallet: string) {
  const exact = await sb.from('profiles').select('*').eq('wallet_address', wallet).maybeSingle();
  if (exact.data) return exact.data;
  const { data } = await sb
    .from('profiles')
    .select('*')
    .ilike('wallet_address', wallet.toLowerCase())
    .maybeSingle();
  return data;
}

async function ensureProfile(
  sb: Sb,
  wallet: string,
  lang: 'zh' | 'en' = 'zh',
  privyUserId?: string,
) {
  const existing = await findProfileByWallet(sb, wallet);
  if (existing) return existing;

  const { data, error } = await sb
    .from('profiles')
    .insert({
      wallet_address: wallet,
      short_address: shortWallet(wallet),
      lang,
      privy_user_id: privyUserId ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  await Promise.all([
    sb.from('shareholders').insert({ wallet_address: wallet, status: 'locked' }),
    sb.from('usd3_accounts').insert({ wallet_address: wallet }),
    sb.from('d3_accounts').insert({ wallet_address: wallet, claim_wallet_address: wallet }),
    sb.from('poc_scores').insert({ wallet_address: wallet, level_label: 'V0' }),
  ]);
  return data;
}

async function findUnionLineByLeader(sb: Sb, wallet: string) {
  const profile = await findProfileByWallet(sb, wallet);
  const pk = (profile?.wallet_address as string | undefined) ?? wallet;
  const exact = await sb.from('union_lines').select('*').eq('line_leader_wallet', pk).maybeSingle();
  if (exact.data) return exact.data;
  const { data } = await sb
    .from('union_lines')
    .select('*')
    .ilike('line_leader_wallet', wallet.toLowerCase())
    .maybeSingle();
  return data;
}

async function ensureShareholderLineInfra(sb: Sb, wallet: string) {
  const profile = await findProfileByWallet(sb, wallet);
  if (!profile) return null;
  const pk = profile.wallet_address as string;

  const { data: sh } = await sb
    .from('shareholders')
    .select('is_shareholder, status')
    .eq('wallet_address', pk)
    .maybeSingle();
  if (!sh?.is_shareholder || sh.status !== 'active') return null;

  let line = await findUnionLineByLeader(sb, pk);
  if (!line) {
    const { data: newLine, error } = await sb
      .from('union_lines')
      .insert({
        line_leader_wallet: pk,
        root_wallet: pk,
        name: `${shortWallet(pk)} 线`,
        total_members: 1,
        total_performance_usd: 0,
      })
      .select()
      .single();
    if (error) throw error;
    line = newLine;
  }

  const lineId = line.id as string;
  const { data: existingNode } = await sb
    .from('team_nodes')
    .select('id')
    .eq('line_id', lineId)
    .ilike('wallet_address', pk)
    .maybeSingle();
  if (!existingNode) {
    await sb.from('team_nodes').insert({
      line_id: lineId,
      wallet_address: pk,
      parent_node_id: null,
      level_label: '发起人',
      personal_usd: 0,
      team_usd: 0,
      direct_count: 0,
      team_count: 1,
      is_direct: false,
    });
  }

  let { data: ms } = await sb
    .from('multisig_wallets')
    .select('*')
    .eq('line_id', lineId)
    .eq('wallet_type', 'line')
    .maybeSingle();

  if (!ms) {
    const treasuryFields = await resolveLineTreasuryFields(pk, lineId);
    const { data: newMs, error } = await sb
      .from('multisig_wallets')
      .insert({
        line_id: lineId,
        wallet_type: 'line',
        ...treasuryFields,
        label_zh: '本线收益金库',
        label_en: 'Line treasury',
        threshold: 2,
        total_signers: 3,
        balance_usd3: 0,
        balance_d3: 0,
      })
      .select()
      .single();
    if (error) throw error;
    ms = newMs;
  } else if (treasuryNeedsPrivyUpgrade(ms as Record<string, unknown>)) {
    ms = (await provisionPrivyTreasury(sb, ms as Record<string, unknown>, pk)) as typeof ms;
  }

  const msId = ms.id as string;
  const { data: leaderMember } = await sb
    .from('committee_members')
    .select('id, is_line_leader')
    .eq('multisig_wallet_id', msId)
    .ilike('signer_wallet', pk)
    .maybeSingle();

  if (!leaderMember) {
    await sb.from('committee_members').insert({
      multisig_wallet_id: msId,
      signer_wallet: pk,
      role_zh: '线长',
      role_en: 'Line leader',
      is_line_leader: true,
      sort_order: 0,
      dividend_weight_pct: 100,
    });
  } else if (!leaderMember.is_line_leader) {
    await sb
      .from('committee_members')
      .update({ is_line_leader: true, role_zh: '线长', role_en: 'Line leader' })
      .eq('id', leaderMember.id);
  }
  return { lineId, line, multisig: ms };
}

type LineTreasuryFields = {
  treasury_address: string;
  short_address: string;
  privy_wallet_id: string | null;
  privy_key_quorum_id: string | null;
};

/** Create a dedicated Privy-owned treasury for this line (one wallet per line_id). */
async function resolveLineTreasuryFields(lineLeader: string, lineId: string): Promise<LineTreasuryFields> {
  const fallback: LineTreasuryFields = {
    treasury_address: lineLeader,
    short_address: shortWallet(lineLeader),
    privy_wallet_id: null,
    privy_key_quorum_id: null,
  };
  if (!isPrivyOnchainEnabled()) return fallback;
  const quorumId = Deno.env.get('PRIVY_LINE_KEY_QUORUM_ID');
  if (!quorumId) return fallback;
  try {
    const pw = await createPrivyTreasuryWallet(
      quorumId,
      `D3 Line ${shortWallet(lineLeader)}`,
      `d3-line-treasury-${lineId}`,
    );
    return {
      treasury_address: pw.address,
      short_address: shortWallet(pw.address),
      privy_wallet_id: pw.id,
      privy_key_quorum_id: quorumId,
    };
  } catch (e) {
    console.warn('[privy] create line treasury:', e);
    return fallback;
  }
}

function treasuryNeedsPrivyUpgrade(ms: Record<string, unknown>): boolean {
  return Boolean(!ms.privy_wallet_id && isPrivyOnchainEnabled());
}

async function provisionPrivyTreasury(sb: Sb, ms: Record<string, unknown>, lineLeader: string) {
  if (!isPrivyOnchainEnabled() || ms.privy_wallet_id) return ms;
  const lineId = String(ms.line_id ?? '');
  if (!lineId) return ms;
  if (!treasuryNeedsPrivyUpgrade(ms)) return ms;
  try {
    const fields = await resolveLineTreasuryFields(lineLeader, lineId);
    if (!fields.privy_wallet_id) return ms;
    const { data: updated } = await sb
      .from('multisig_wallets')
      .update(fields)
      .eq('id', ms.id as string)
      .select()
      .single();
    return updated ?? ms;
  } catch (e) {
    console.warn('[privy] provision treasury:', e);
    return ms;
  }
}

async function ensureShareholderLineInfraWithPrivy(sb: Sb, wallet: string) {
  const result = await ensureShareholderLineInfra(sb, wallet);
  if (!result?.multisig) return result;
  const pk = (await findProfileByWallet(sb, wallet))?.wallet_address as string;
  const ms = await provisionPrivyTreasury(sb, result.multisig as Record<string, unknown>, pk ?? wallet);
  return { ...result, multisig: ms };
}

async function resolveLineMultisigContext(sb: Sb, wallet: string) {
  const profile = await findProfileByWallet(sb, wallet);
  const pk = profile?.wallet_address as string | undefined;

  if (pk) {
    try {
      await ensureShareholderLineInfraWithPrivy(sb, pk);
    } catch {
      /* best-effort */
    }
  }

  let lineId: string | null = null;
  if (pk) {
    const { data: teamNode } = await sb
      .from('team_nodes')
      .select('line_id')
      .eq('wallet_address', pk)
      .maybeSingle();
    lineId = teamNode?.line_id ?? null;
    if (!lineId) {
      const leaderLine = await findUnionLineByLeader(sb, pk);
      lineId = leaderLine?.id ?? null;
    }
  }

  const { data: lineMultisigs } = lineId
    ? await sb.from('multisig_wallets').select('*').eq('line_id', lineId).eq('wallet_type', 'line')
    : { data: [] };
  const lineMultisig = lineMultisigs?.[0] ?? null;

  const multisigIds = lineMultisig ? [lineMultisig.id as string] : [];
  const { data: committeeMembers } = multisigIds.length
    ? await sb.from('committee_members').select('*').in('multisig_wallet_id', multisigIds)
    : { data: [] };

  const members = committeeMembers ?? [];
  const isLineLeader =
    members.some(
      (m) => m.is_line_leader && String(m.signer_wallet).toLowerCase() === wallet.toLowerCase(),
    ) ||
    Boolean(
      lineId &&
        pk &&
        (await findUnionLineByLeader(sb, pk))?.line_leader_wallet?.toLowerCase() ===
          wallet.toLowerCase(),
    );
  const isCommitteeMember = members.some(
    (m) => String(m.signer_wallet).toLowerCase() === wallet.toLowerCase(),
  );

  return { lineId, lineMultisig, committeeMembers: members, isLineLeader, isCommitteeMember };
}

async function executeMultisigProposal(sb: Sb, proposalId: string) {
  const executedAt = new Date().toISOString();
  const { data: proposal } = await sb
    .from('multisig_proposals')
    .select('*')
    .eq('id', proposalId)
    .maybeSingle();
  if (!proposal) return;

  const { data: msWallet } = await sb
    .from('multisig_wallets')
    .select('*')
    .eq('id', proposal.multisig_wallet_id)
    .maybeSingle();

  let txHash = `0x${'ab'.repeat(32)}`;
  let onchainStatus: string = 'off';

  const rpcBody = proposal.privy_rpc_body as Record<string, unknown> | null;
  const privyWalletId = msWallet?.privy_wallet_id as string | undefined;

  if (privyWalletId && rpcBody && isPrivyOnchainEnabled()) {
    const { data: sigRows } = await sb
      .from('multisig_signatures')
      .select('authorization_signature')
      .eq('proposal_id', proposalId);
    const authSigs = (sigRows ?? [])
      .map((r) => r.authorization_signature as string | null)
      .filter((s): s is string => Boolean(s));

    const treasuryKey = getTreasuryAuthPrivateKey();
    if (treasuryKey) {
      try {
        const serverSig = await signRpcBodyWithPrivateKey(privyWalletId, rpcBody, treasuryKey);
        if (!authSigs.includes(serverSig)) authSigs.push(serverSig);
      } catch (e) {
        console.warn('[privy] server co-sign:', e);
      }
    }

    const threshold = Number(msWallet?.threshold ?? 2);
    if (authSigs.length >= threshold) {
      try {
        const result = await executePrivyWalletRpc(privyWalletId, rpcBody, authSigs);
        if (result.hash) {
          txHash = result.hash;
          onchainStatus = 'submitted';
        } else {
          onchainStatus = 'failed';
        }
      } catch (e) {
        console.error('[privy] execute rpc:', e);
        onchainStatus = 'failed';
      }
    } else {
      onchainStatus = 'awaiting_signatures';
    }
  }

  await sb
    .from('multisig_proposals')
    .update({
      status: 'executed',
      executed_at: executedAt,
      tx_hash: txHash,
      onchain_status: onchainStatus,
    })
    .eq('id', proposalId);

  const { data: dividends } = await sb
    .from('dividend_accruals')
    .select('*')
    .eq('multisig_proposal_id', proposalId)
    .eq('status', 'multisig_pending');

  for (const d of dividends ?? []) {
    const amount = Number(d.amount ?? 0);
    const w = d.wallet_address as string;
    if (d.asset_type === 'usd3') {
      await sb.from('dividend_accruals').update({ status: 'pending' }).eq('id', d.id);
      const { data: acc } = await sb.from('usd3_accounts').select('*').eq('wallet_address', w).maybeSingle();
      if (acc) {
        await sb
          .from('usd3_accounts')
          .update({ pending_usd3: Number(acc.pending_usd3 ?? 0) + amount })
          .eq('wallet_address', w);
      }
    } else {
      await sb.from('dividend_accruals').update({ status: 'claimable' }).eq('id', d.id);
      const { data: acc } = await sb.from('d3_accounts').select('*').eq('wallet_address', w).maybeSingle();
      if (acc) {
        await sb
          .from('d3_accounts')
          .update({ pending_d3: Number(acc.pending_d3 ?? 0) + amount })
          .eq('wallet_address', w);
      }
    }
  }
}

function assertWalletMatch(headerWallet: string | null, wallet: string) {
  if (headerWallet && !walletEquals(headerWallet, wallet)) {
    throw new HttpError(403, 'Wallet header mismatch');
  }
}

async function ensureDemoPocScore(sb: Sb, pk: string) {
  if (!isDemoWalletAddress(pk)) return;
  const { data: row } = await sb.from('poc_scores').select('composite_score').eq('wallet_address', pk).maybeSingle();
  if (row && Number(row.composite_score) > 0) return;
  await sb.from('poc_scores').upsert(
    { wallet_address: pk, ...DEMO_POC_SCORE },
    { onConflict: 'wallet_address' },
  );
}

const DEMO_PARTNER_SPONSOR =
  Deno.env.get('DEMO_PARTNER_SPONSOR_WALLET') ?? '0xabcdef1234567890abcdef1234567890abcdef01';

async function ensureDemoPartnerReferral(sb: Sb, pk: string) {
  if (!isDemoWalletAddress(pk)) return;
  const { data: existing } = await sb
    .from('referrals')
    .select('id')
    .eq('wallet_address', pk)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) return;
  await ensureProfile(sb, DEMO_PARTNER_SPONSOR);
  await sb.from('referrals').upsert(
    {
      wallet_address: pk,
      sponsor_wallet_address: DEMO_PARTNER_SPONSOR,
      referral_type: 'partner',
      status: 'active',
    },
    { onConflict: 'wallet_address,sponsor_wallet_address' },
  );
}

async function fetchProfileBundle(sb: Sb, wallet: string) {
  const profile = await findProfileByWallet(sb, wallet);
  if (!profile) throw new HttpError(404, 'Profile not found');

  const pk = profile.wallet_address as string;
  await ensureDemoPocScore(sb, pk);
  await ensureDemoPartnerReferral(sb, pk);
  const [
    shareholder,
    usd3,
    d3,
    referrals,
    dividends,
    fiPositions,
    teamNode,
    directReferrals,
    pocScore,
  ] = await Promise.all([
    sb.from('shareholders').select('*').eq('wallet_address', pk).maybeSingle(),
    sb.from('usd3_accounts').select('*').eq('wallet_address', pk).maybeSingle(),
    sb.from('d3_accounts').select('*').eq('wallet_address', pk).maybeSingle(),
    sb.from('referrals').select('*').eq('wallet_address', pk),
    sb
      .from('dividend_accruals')
      .select('*')
      .eq('wallet_address', pk)
      .order('created_at', { ascending: false })
      .limit(50),
    sb.from('fi_positions').select('*').eq('wallet_address', pk).eq('status', 'active'),
    sb
      .from('team_nodes')
      .select('*')
      .eq('wallet_address', pk)
      .order('created_at', { ascending: true })
      .limit(1)
      .then(({ data }) => ({ data: data?.[0] ?? null })),
    sb
      .from('referrals')
      .select('wallet_address, referred_at, status, referral_type, performance_weight')
      .eq('sponsor_wallet_address', pk)
      .eq('status', 'active'),
    sb.from('poc_scores').select('*').eq('wallet_address', pk).maybeSingle(),
  ]);

  if (shareholder.data?.is_shareholder && shareholder.data.status === 'active') {
    try {
      await ensureShareholderLineInfraWithPrivy(sb, pk);
    } catch (e) {
      console.warn('[union] ensureShareholderLineInfra:', e);
    }
  }

  let lineId = (teamNode.data as { line_id?: string } | null)?.line_id ?? null;
  if (!lineId) {
    const leaderLine = await findUnionLineByLeader(sb, pk);
    lineId = leaderLine?.id ?? null;
  }

  const [unionLine, lineTeamNodes, lineMultisigs, daoMultisig] = await Promise.all([
    lineId
      ? sb.from('union_lines').select('*').eq('id', lineId).maybeSingle()
      : Promise.resolve({ data: null }),
    lineId
      ? sb.from('team_nodes').select('*').eq('line_id', lineId)
      : Promise.resolve({ data: [] }),
    lineId
      ? sb.from('multisig_wallets').select('*').eq('line_id', lineId)
      : Promise.resolve({ data: [] }),
    sb.from('multisig_wallets').select('*').eq('wallet_type', 'dao').maybeSingle(),
  ]);

  const multisigList = [...(lineMultisigs.data ?? []), ...(daoMultisig.data ? [daoMultisig.data] : [])];
  const multisigIds = multisigList.map((m) => m.id as string);

  const [committeeMembers, multisigProposals] = await Promise.all([
    multisigIds.length
      ? sb.from('committee_members').select('*').in('multisig_wallet_id', multisigIds).order('sort_order')
      : Promise.resolve({ data: [] }),
    multisigIds.length
      ? sb
          .from('multisig_proposals')
          .select('*')
          .in('multisig_wallet_id', multisigIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const proposalIds = (multisigProposals.data ?? []).map((p) => p.id as string);
  const { data: multisigSignatures } = proposalIds.length
    ? await sb.from('multisig_signatures').select('*').in('proposal_id', proposalIds)
    : { data: [] };

  const partnerTeamStats = await fetchPartnerTeamStats(sb, pk).catch(() => ({
    personalPerformanceUsd: 0,
    teamPerformanceUsd: 0,
    dailyNewPerformanceUsd: 0,
    smallAreaPerformanceUsd: 0,
    smallAreaNewPerformanceUsd: 0,
    largeAreaPerformanceUsd: 0,
    largeAreaNewPerformanceUsd: 0,
  }));

  const partnerDirectLineStats = await fetchPartnerDirectLineStats(sb, pk).catch(() => []);

  const partnerDirectReferrals = (directReferrals.data ?? []).filter(
    (r) => r.referral_type === 'partner' && r.status === 'active',
  );
  const enrichedDirectReferrals = await Promise.all(
    partnerDirectReferrals.map(async (ref) => {
      const nodeStats = await fetchPartnerReferralNodeStats(sb, ref.wallet_address as string).catch(
        () => ({
          personalPerformanceUsd: Number(ref.performance_weight ?? 0),
          teamPerformanceUsd: 0,
          teamCount: 0,
        }),
      );
      return {
        ...ref,
        personal_performance_usd: nodeStats.personalPerformanceUsd,
        team_performance_usd: nodeStats.teamPerformanceUsd,
        team_count: nodeStats.teamCount,
      };
    }),
  );

  const profileWallets = new Set<string>([pk]);
  for (const row of lineTeamNodes.data ?? []) {
    profileWallets.add(String(row.wallet_address));
  }
  for (const ref of directReferrals.data ?? []) {
    profileWallets.add(String(ref.wallet_address));
  }
  const partnerMemberWallets = await fetchPartnerMemberWallets(sb, [...profileWallets]).catch(
    () => [] as string[],
  );
  const partnerBundle = await fetchPartnerAccountBundle(sb, pk).catch(() => ({
    account: null,
    stakePositions: [],
    ud3Settlements: [],
    ud3Allocations: [],
    yieldSettlements: [],
    ud3Transfers: [],
    yieldWithdrawals: [],
  }));
  const partnerDownlineWallets = await collectPartnerDownlineWallets(sb, pk).catch(() => [] as string[]);

  // Full multi-level downline edges (wallet -> sponsor) so the client can nest the
  // referral tree beyond direct referrals (下下线 and deeper), even when team_nodes
  // has no rows for these wallets.
  const partnerDownlineTree = partnerDownlineWallets.length > 0
    ? ((await sb
        .from('referrals')
        .select('wallet_address, sponsor_wallet_address, performance_weight')
        .in('wallet_address', partnerDownlineWallets)
        .eq('referral_type', 'partner')
        .eq('status', 'active')).data ?? [])
    : [];

  const isPartner = Boolean(partnerBundle.account?.is_partner);
  // Daily UD3 (贿赂金) is abolished; the reward is now UD3 credited per deposit.
  // Field kept at 0 for client compatibility until Batch B renames the response.
  const pendingUd3Earned = 0;

  return {
    profile,
    shareholder: shareholder.data,
    usd3Account: usd3.data,
    d3Account: d3.data,
    referrals: referrals.data ?? [],
    dividends: dividends.data ?? [],
    fiPositions: fiPositions.data ?? [],
    teamNode: teamNode.data,
    directReferrals: enrichedDirectReferrals,
    unionLine: unionLine.data,
    lineTeamNodes: lineTeamNodes.data ?? [],
    multisigWallets: multisigList,
    committeeMembers: committeeMembers.data ?? [],
    multisigProposals: multisigProposals.data ?? [],
    multisigSignatures: multisigSignatures ?? [],
    pocScore: pocScore.data,
    partnerTeamStats,
    partnerDirectLineStats,
    pendingUd3Earned,
    partnerMemberWallets,
    partnerAccount: partnerBundle.account,
    partnerStakePositions: partnerBundle.stakePositions,
    partnerUd3Settlements: partnerBundle.ud3Settlements,
    partnerUd3Allocations: partnerBundle.ud3Allocations,
    partnerUd3Transfers: partnerBundle.ud3Transfers,
    partnerYieldSettlements: partnerBundle.yieldSettlements,
    partnerYieldWithdrawals: partnerBundle.yieldWithdrawals,
    partnerDownlineWallets,
    partnerDownlineTree,
  };
}

async function handleHealth(sb: Sb) {
  const { error } = await sb.from('profiles').select('wallet_address').limit(1);
  if (error?.message.includes('schema cache') || error?.code === 'PGRST205') {
    return { ok: false, configured: true, migrated: false };
  }
  if (error) throw new HttpError(502, error.message);
  return { ok: true, configured: true, migrated: true };
}

async function handleProtocol(sb: Sb) {
  const { data: epoch, error: epochErr } = await sb
    .from('protocol_epochs')
    .select('*')
    .eq('is_current', true)
    .maybeSingle();

  if (epochErr?.code === 'PGRST205' || epochErr?.message?.includes('schema cache')) {
    return { epoch: null, bribeProjects: [], migrated: false };
  }
  if (epochErr) throw new HttpError(502, epochErr.message);

  let bribeProjects: unknown[] = [];
  if (epoch) {
    const { data: projects, error: projErr } = await sb
      .from('bribe_projects')
      .select('*')
      .eq('epoch_number', epoch.epoch_number)
      .order('sort_order');
    if (projErr && !projErr.message?.includes('schema cache')) {
      throw new HttpError(502, projErr.message);
    }
    bribeProjects = projects ?? [];
  }
  return { epoch: epoch ?? null, bribeProjects, migrated: true };
}

function routePath(req: Request): string {
  const url = new URL(req.url);
  let p = url.pathname;
  if (p.startsWith('/union')) p = p.slice('/union'.length) || '/';
  return p || '/';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const path = routePath(req);
  const sb = getSupabaseAdmin();

  try {
    const sponsorReg = path.match(/^\/sponsor\/(0x[0-9a-fA-F]{40})\/registered$/);
    const publicGet =
      req.method === 'GET' &&
      (path === '/health' || path === '/protocol' || Boolean(sponsorReg));
    // Public SIWE auth handshake — apikey only, no wallet/session auth required.
    const authRoute =
      req.method === 'POST' && (path === '/auth/nonce' || path === '/auth/verify');
    const demoMode = isDemoModeRequest(req);
    // Actor identity now comes from the SIWE session (X-Session-Token); the proven,
    // lowercased wallet address doubles as the stable user id written to profiles.
    let privyUserId: string | undefined;
    if (!publicGet && !authRoute && !demoMode) {
      privyUserId = await verifySiweSession(req);
    }

    // POST /auth/nonce — issue a single-use SIWE nonce for {address}.
    if (req.method === 'POST' && path === '/auth/nonce') {
      // This handshake runs pre-auth (verify_jwt=false), so throttle it to keep
      // the siwe_nonces table from being spammed unbounded. Generous limits so
      // real users/testers are never blocked; keyed by client IP AND address.
      const ip = clientIpFromRequest(req);
      await enforceRateLimit(sb, { key: `union:/auth/nonce:ip:${ip}`, limit: 30, windowSec: 60 });
      const body = await req.json().catch(() => ({}));
      const { address } = body as { address?: string };
      if (!address || !isEthAddress(address)) throw new HttpError(400, 'Invalid address');
      await enforceRateLimit(sb, {
        key: `union:/auth/nonce:addr:${address.toLowerCase()}`,
        limit: 30,
        windowSec: 60,
      });
      return jsonResponse(await issueNonce(sb, address));
    }

    // POST /auth/verify — verify the SIWE signature and mint a session token.
    if (req.method === 'POST' && path === '/auth/verify') {
      // Pre-auth route that runs viem signature recovery (CPU) per call — throttle
      // by client IP to blunt a DoS. Generous limit so legit retries are fine.
      const ip = clientIpFromRequest(req);
      await enforceRateLimit(sb, { key: `union:/auth/verify:ip:${ip}`, limit: 20, windowSec: 60 });
      const body = await req.json().catch(() => ({}));
      const { message, signature } = body as { message?: string; signature?: string };
      if (typeof message !== 'string' || typeof signature !== 'string') {
        throw new HttpError(400, 'message and signature required');
      }
      // The SIWE `domain` is validated against the server-side SIWE_ALLOWED_DOMAINS
      // allowlist inside verifySiweAndIssueToken — the request Origin/Host is
      // deliberately NOT trusted (it is attacker-controlled under phishing).
      return jsonResponse(await verifySiweAndIssueToken(sb, { message, signature }));
    }

    // GET /health
    if (req.method === 'GET' && path === '/health') {
      return jsonResponse(await handleHealth(sb));
    }

    // GET /protocol
    if (req.method === 'GET' && path === '/protocol') {
      return jsonResponse(await handleProtocol(sb));
    }

    if (req.method === 'GET' && sponsorReg) {
      const sponsorWallet = sponsorReg[1];
      if (!isEthAddress(sponsorWallet)) throw new HttpError(400, 'Invalid wallet');
      const profile = await findProfileByWallet(sb, sponsorWallet);
      return jsonResponse({ registered: Boolean(profile) });
    }

    const profileGet = path.match(/^\/profile\/(0x[0-9a-fA-F]{40})$/);
    if (req.method === 'GET' && profileGet) {
      const headerWallet = await requireActorWallet(sb, req, { allowDemo: true });
      const urlWallet = profileGet[1];
      assertWalletMatch(headerWallet, urlWallet);
      return jsonResponse(await fetchProfileBundle(sb, urlWallet));
    }

    // POST /profile
    if (req.method === 'POST' && path === '/profile') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const body = await req.json().catch(() => ({}));
      const { displayName, lang } = body as {
        displayName?: string;
        lang?: 'zh' | 'en';
      };

      const existing = await findProfileByWallet(sb, wallet);
      if (existing) {
        const { data, error } = await sb
          .from('profiles')
          .update({
            privy_user_id: privyUserId ?? null,
            display_name: displayName ?? null,
            short_address: shortWallet(wallet),
            lang: lang ?? 'zh',
          })
          .eq('wallet_address', existing.wallet_address)
          .select()
          .single();
        if (error) throw new HttpError(502, error.message);
        return jsonResponse({ profile: data, created: false });
      }

      const profile = await ensureProfile(sb, wallet, lang ?? 'zh', privyUserId);
      return jsonResponse({ profile, created: true });
    }

    // POST /shareholders/join
    if (req.method === 'POST' && path === '/shareholders/join') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const body = await req.json().catch(() => ({}));
      const { joinTxHash, sponsorWallet } = body as { joinTxHash?: string; sponsorWallet?: string };

      await ensureProfile(sb, wallet);
      const { data: shareholder, error } = await sb
        .from('shareholders')
        .upsert(
          {
            wallet_address: wallet,
            is_shareholder: true,
            genesis_dt_count: 1,
            joined_at: new Date().toISOString(),
            join_tx_hash: joinTxHash ?? null,
            status: 'active',
          },
          { onConflict: 'wallet_address' },
        )
        .select()
        .single();
      if (error) throw new HttpError(502, error.message);

      try {
        await ensureShareholderLineInfraWithPrivy(sb, wallet);
      } catch (e) {
        console.warn('[union] ensureShareholderLineInfra on join:', e);
      }

      if (sponsorWallet && isEthAddress(sponsorWallet)) {
        const sponsor = await findProfileByWallet(sb, sponsorWallet.trim());
        if (sponsor) {
          await sb.from('referrals').upsert(
            {
              wallet_address: wallet,
              sponsor_wallet_address: sponsor.wallet_address,
              referral_type: 'shareholder',
              status: 'active',
              join_tx_hash: joinTxHash ?? null,
            },
            { onConflict: 'wallet_address,sponsor_wallet_address' },
          );
        }
      }
      return jsonResponse({ shareholder });
    }

    // POST /usd3/claim
    if (req.method === 'POST' && path === '/usd3/claim') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      // V-16: 10/min per wallet.
      await enforceRateLimit(sb, { key: `union:/usd3/claim:${wallet}`, limit: 10, windowSec: 60 });
      const profile = await findProfileByWallet(sb, wallet);
      if (!profile) throw new HttpError(404, 'Profile not found');

      const pk = profile.wallet_address as string;
      const { data: account, error: accErr } = await sb
        .from('usd3_accounts')
        .select('*')
        .eq('wallet_address', pk)
        .single();
      if (accErr) throw new HttpError(502, accErr.message);
      if (!account || account.pending_usd3 <= 0) throw new HttpError(400, 'Nothing to claim');

      const pending = Number(account.pending_usd3);
      const self = Math.round(pending * 0.5 * 10) / 10;
      const transferable = Math.round((pending - self) * 10) / 10;

      const { data: updated, error } = await sb
        .from('usd3_accounts')
        .update({
          pending_usd3: 0,
          claimed_lifetime_usd3: Number(account.claimed_lifetime_usd3) + pending,
          balance: Number(account.balance) + pending,
          available: Number(account.available) + pending,
          self_pool_remaining: Number(account.self_pool_remaining) + self,
          downline_pool_remaining: Number(account.downline_pool_remaining) + transferable,
          self_quota: Number(account.self_quota) + self,
          downline_quota: Number(account.downline_quota) + transferable,
        })
        .eq('wallet_address', pk)
        .select()
        .single();
      if (error) throw new HttpError(502, error.message);

      await sb
        .from('dividend_accruals')
        .update({ status: 'claimed', claimed_at: new Date().toISOString() })
        .eq('wallet_address', pk)
        .eq('asset_type', 'usd3')
        .in('status', ['pending', 'claimable']);

      return jsonResponse({ usd3Account: updated });
    }

    // GET /partner/program-settings
    if (req.method === 'GET' && path === '/partner/program-settings') {
      const settings = await getPartnerProgramSettings(sb);
      return jsonResponse({ ok: true, settings });
    }

    // POST /partner/demo-reset — restore seeded demo partner data on each demo login
    if (req.method === 'POST' && path === '/partner/demo-reset') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      if (!demoMode || !isDemoWalletAddress(wallet)) {
        throw new HttpError(403, 'Demo reset requires demo mode');
      }
      return jsonResponse(await resetDemoPartnerSession(sb));
    }

    // POST /partner/subsidy-receipts/sign
    if (req.method === 'POST' && path === '/partner/subsidy-receipts/sign') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const body = await req.json().catch(() => ({}));
      const { files } = body as {
        files?: Array<{ name: string; contentType: string; size: number }>;
      };
      if (!Array.isArray(files) || !files.length) throw new HttpError(400, 'files required');
      const signed = await signSubsidyReceiptUploads(sb, wallet, files);
      return jsonResponse({ ok: true, ...signed });
    }

    // POST /partner/subsidy-tickets
    if (req.method === 'POST' && path === '/partner/subsidy-tickets') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const body = await req.json().catch(() => ({}));
      const { kind, amountUsd, purpose, applicationType, receiptPaths } = body as {
        kind?: 'partner_subsidy' | 'market_subsidy' | 'market_leader';
        amountUsd?: number;
        purpose?: string;
        applicationType?: 'reserve' | 'reimbursement';
        receiptPaths?: string[];
      };
      if (!kind) throw new HttpError(400, 'kind required');
      const ticket = await createPartnerSubsidyTicket(sb, wallet, {
        kind,
        amountUsd,
        purpose,
        applicationType,
        receiptPaths,
      });
      return jsonResponse({ ok: true, ticket });
    }

    // GET /partner/subsidy-quota?kind=partner_subsidy
    if (req.method === 'GET' && path === '/partner/subsidy-quota') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const url = new URL(req.url);
      const kind = url.searchParams.get('kind');
      if (kind !== 'partner_subsidy' && kind !== 'market_subsidy') {
        throw new HttpError(400, 'kind must be partner_subsidy or market_subsidy');
      }
      const [settings, quota] = await Promise.all([
        getPartnerProgramSettings(sb),
        computeSubsidyQuota(sb, wallet, kind),
      ]);
      return jsonResponse({ ok: true, settings, quota });
    }

    // GET /partner/subsidy-tickets
    if (req.method === 'GET' && path === '/partner/subsidy-tickets') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const tickets = await listWalletSubsidyTickets(sb, wallet);
      return jsonResponse({ ok: true, tickets });
    }

    const ticketMsgMatch = path.match(/^\/partner\/subsidy-tickets\/([0-9a-f-]{36})\/messages$/);
    if (req.method === 'POST' && ticketMsgMatch) {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const body = await req.json().catch(() => ({}));
      const { body: messageBody } = body as { body?: string };
      if (!messageBody?.trim()) throw new HttpError(400, 'body required');
      const message = await addApplicantTicketMessage(sb, wallet, ticketMsgMatch[1], messageBody.trim());
      return jsonResponse({ ok: true, message });
    }

    // POST /referrals/bind
    if (req.method === 'POST' && path === '/referrals/bind') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      // V-16: 5/min per wallet.
      await enforceRateLimit(sb, { key: `union:/referrals/bind:${wallet}`, limit: 5, windowSec: 60 });
      const body = await req.json().catch(() => ({}));
      const { sponsorWallet, referralType, txHash } = body as {
        sponsorWallet?: string;
        referralType?: 'partner' | 'shareholder';
        txHash?: string;
      };

      if (!sponsorWallet || !isEthAddress(sponsorWallet)) {
        throw new HttpError(400, 'Invalid sponsor wallet');
      }
      if (walletEquals(wallet, sponsorWallet)) throw new HttpError(400, 'Cannot refer yourself');

      await ensureProfile(sb, wallet);

      const { data: existingList } = await sb
        .from('referrals')
        .select('*')
        .eq('wallet_address', wallet)
        .eq('status', 'active')
        .limit(1);
      const existing = existingList?.[0];
      if (existing) {
        throw new HttpError(409, 'Referral already bound', { referral: existing });
      }

      const type = referralType === 'shareholder' ? 'shareholder' : 'partner';

      // When the on-chain registry is configured, the binding MUST exist on-chain
      // (the user bound directly and paid gas). On-chain is the source of truth, so
      // we do NOT require the sponsor to have an off-chain profile first — a genesis
      // root legitimately has none. verifyOnchainBinding proves the edge, and
      // upsertReferralFromChain materializes both profiles from the chain address.
      if (isReferralRegistryConfigured()) {
        const { ok, upline } = await verifyOnchainBinding({
          user: wallet,
          expectedUpline: sponsorWallet.trim(),
          txHash,
        });
        if (!ok) {
          throw new HttpError(
            409,
            'On-chain binding not found — call ReferralRegistry.bind() first',
            { onchainUpline: upline },
          );
        }
        await upsertReferralFromChain(sb, wallet, sponsorWallet.trim(), txHash);
        const { data: synced } = await sb
          .from('referrals')
          .select('*')
          .ilike('wallet_address', wallet.toLowerCase())
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        return jsonResponse({ referral: synced, created: true, onchain: true });
      }

      // Legacy path (no on-chain registry): the sponsor must be a registered profile.
      const sponsor = await findProfileByWallet(sb, sponsorWallet.trim());
      if (!sponsor) throw new HttpError(404, 'Sponsor not registered');

      const { data, error } = await sb
        .from('referrals')
        .upsert(
          {
            wallet_address: wallet,
            sponsor_wallet_address: sponsor.wallet_address,
            referral_type: type,
            status: 'active',
            ...(txHash ? { join_tx_hash: txHash } : {}),
          },
          { onConflict: 'wallet_address,sponsor_wallet_address' },
        )
        .select()
        .single();
      if (error) throw new HttpError(502, error.message);
      return jsonResponse({ referral: data, created: true });
    }

    // GET /notifications
    if (req.method === 'GET' && path === '/notifications') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const url = new URL(req.url);
      const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
      const profile = await findProfileByWallet(sb, wallet);
      if (!profile) return jsonResponse({ notifications: [], migrated: true });

      let q = sb
        .from('user_notifications')
        .select('*')
        .eq('wallet_address', profile.wallet_address)
        .order('created_at', { ascending: false })
        .limit(50);
      if (unreadOnly) q = q.eq('is_read', false);

      const { data, error } = await q;
      if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
        return jsonResponse({ notifications: [], migrated: false });
      }
      if (error) throw new HttpError(502, error.message);
      return jsonResponse({ notifications: data ?? [], migrated: true });
    }

    // POST /notifications/:id/read
    const notifRead = path.match(/^\/notifications\/([^/]+)\/read$/);
    if (req.method === 'POST' && notifRead) {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const profile = await findProfileByWallet(sb, wallet);
      if (!profile) throw new HttpError(404, 'Profile not found');

      const { error } = await sb
        .from('user_notifications')
        .update({ is_read: true })
        .eq('id', notifRead[1])
        .eq('wallet_address', profile.wallet_address);
      if (error) throw new HttpError(502, error.message);
      return jsonResponse({ ok: true, id: notifRead[1] });
    }

    // POST /notifications/read-all
    if (req.method === 'POST' && path === '/notifications/read-all') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const profile = await findProfileByWallet(sb, wallet);
      if (!profile) throw new HttpError(404, 'Profile not found');

      const { error } = await sb
        .from('user_notifications')
        .update({ is_read: true })
        .eq('wallet_address', profile.wallet_address)
        .eq('is_read', false);
      if (error) throw new HttpError(502, error.message);
      return jsonResponse({ ok: true });
    }

    // POST /multisig/proposals
    if (req.method === 'POST' && path === '/multisig/proposals') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      // V-16: 10/min per wallet.
      await enforceRateLimit(sb, { key: `union:/multisig/proposals:${wallet}`, limit: 10, windowSec: 60 });
      const body = await req.json().catch(() => ({}));
      const ctx = await resolveLineMultisigContext(sb, wallet);
      if (!ctx.lineMultisig) throw new HttpError(404, 'Line multisig not found');
      if (!ctx.isLineLeader) throw new HttpError(403, 'Only line leader can create proposals');

      const { periodZh, periodEn, beneficiaryCount } = body as {
        periodZh?: string;
        periodEn?: string;
        beneficiaryCount?: number;
      };

      const now = new Date();
      const monthZh = periodZh ?? `${now.getFullYear()}年${now.getMonth() + 1}月`;
      const monthEn = periodEn ?? now.toLocaleString('en', { month: 'short', year: 'numeric' });

      const { data: lineWallets } = await sb
        .from('team_nodes')
        .select('wallet_address')
        .eq('line_id', ctx.lineId!);
      const wallets = (lineWallets ?? []).map((r) => r.wallet_address as string);

      const { data: monthlyDivs } = wallets.length
        ? await sb
            .from('dividend_accruals')
            .select('*')
            .in('wallet_address', wallets)
            .eq('cycle_type', 'monthly')
            .in('stream_id', ['treasury', 'line'])
            .in('status', ['pending', 'multisig_pending'])
        : { data: [] };

      const usd3Amount = (monthlyDivs ?? [])
        .filter((d) => d.asset_type === 'usd3')
        .reduce((s, d) => s + Number(d.amount ?? 0), 0);
      const d3Amount = (monthlyDivs ?? [])
        .filter((d) => d.asset_type === 'd3')
        .reduce((s, d) => s + Number(d.amount ?? 0), 0);
      const teamCount = beneficiaryCount ?? wallets.length;
      const expiresAt = new Date(now.getTime() + 7 * 86400000).toISOString();

      const lineMs = ctx.lineMultisig as Record<string, unknown>;
      if (isPrivyOnchainEnabled() && !lineMs.privy_wallet_id && ctx.lineId) {
        await provisionPrivyTreasury(sb, lineMs, wallet);
      }
      const { data: refreshedMs } = await sb
        .from('multisig_wallets')
        .select('*')
        .eq('id', ctx.lineMultisig.id)
        .maybeSingle();
      const activeMs = refreshedMs ?? ctx.lineMultisig;

      const { data: proposal, error } = await sb
        .from('multisig_proposals')
        .insert({
          multisig_wallet_id: activeMs.id,
          wallet_type: 'line',
          title_zh: `${monthZh}本线分红发放`,
          title_en: `${monthEn} line dividend distribution`,
          desc_zh: `向本线 ${teamCount} 名成员按业绩分配 USD3 + D3`,
          desc_en: `Distribute USD3 + D3 to ${teamCount} line members by performance`,
          period_zh: monthZh,
          period_en: monthEn,
          usd3_amount: usd3Amount,
          d3_amount: d3Amount,
          beneficiary_count: teamCount,
          proposer_wallet: wallet,
          status: 'pending',
          expires_at: expiresAt,
          onchain_status: isPrivyOnchainEnabled() && activeMs.privy_wallet_id ? 'awaiting_signatures' : 'off',
        })
        .select()
        .single();
      if (error) throw new HttpError(502, error.message);

      const proposalId = proposal.id as string;
      let privyRpcBody: Record<string, unknown> | null = null;
      const privyWalletId = activeMs.privy_wallet_id as string | undefined;
      if (privyWalletId && isPrivyOnchainEnabled()) {
        privyRpcBody = buildDividendAttestationRpcBody(proposalId, wallet);
        await sb
          .from('multisig_proposals')
          .update({ privy_rpc_body: privyRpcBody })
          .eq('id', proposalId);
      }

      if (wallets.length) {
        await sb
          .from('dividend_accruals')
          .update({ status: 'multisig_pending', multisig_proposal_id: proposalId })
          .in('wallet_address', wallets)
          .eq('cycle_type', 'monthly')
          .in('stream_id', ['treasury', 'line'])
          .in('status', ['pending']);
      }

      let proposerAuthSig: string | null = null;
      const privyToken = getPrivyToken(req);
      if (privyWalletId && privyRpcBody) {
        if (privyToken) {
          proposerAuthSig = await signRpcBodyWithUserJwt(privyWalletId, privyRpcBody, privyToken);
        }
        if (!proposerAuthSig) {
          const treasuryKey = getTreasuryAuthPrivateKey();
          if (treasuryKey) {
            try {
              proposerAuthSig = await signRpcBodyWithPrivateKey(privyWalletId, privyRpcBody, treasuryKey);
            } catch (e) {
              console.warn('[privy] proposer server sign:', e);
            }
          }
        }
      }

      await sb.from('multisig_signatures').upsert(
        {
          proposal_id: proposalId,
          signer_wallet: wallet,
          signed_at: new Date().toISOString(),
          authorization_signature: proposerAuthSig,
        },
        { onConflict: 'proposal_id,signer_wallet' },
      );
      return jsonResponse({
        proposal: { ...proposal, privy_rpc_body: privyRpcBody },
        privyOnchain: Boolean(privyWalletId),
      });
    }

    // POST /multisig/proposals/:id/sign
    const signMatch = path.match(/^\/multisig\/proposals\/([^/]+)\/sign$/);
    if (req.method === 'POST' && signMatch) {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      // V-16: 10/min per wallet.
      await enforceRateLimit(sb, { key: `union:/multisig/proposals/sign:${wallet}`, limit: 10, windowSec: 60 });
      const signBody = await req.json().catch(() => ({}));
      const ctx = await resolveLineMultisigContext(sb, wallet);
      if (!ctx.isCommitteeMember) throw new HttpError(403, 'Not a committee member');

      const proposalId = signMatch[1];
      const { data: proposal, error: pErr } = await sb
        .from('multisig_proposals')
        .select('*')
        .eq('id', proposalId)
        .maybeSingle();
      if (pErr) throw new HttpError(502, pErr.message);
      if (!proposal) throw new HttpError(404, 'Proposal not found');
      if (proposal.status !== 'pending') throw new HttpError(400, 'Proposal not pending');

      const member = ctx.committeeMembers.find(
        (m) => m.multisig_wallet_id === proposal.multisig_wallet_id,
      );
      if (!member) throw new HttpError(403, 'Not a signer for this wallet');

      const { data: msWallet } = await sb
        .from('multisig_wallets')
        .select('*')
        .eq('id', proposal.multisig_wallet_id)
        .single();

      const privyWalletId = msWallet?.privy_wallet_id as string | undefined;
      const rpcBody = proposal.privy_rpc_body as Record<string, unknown> | null;
      let authSig = (signBody as { authorizationSignature?: string }).authorizationSignature ?? null;

      if (!authSig && privyWalletId && rpcBody) {
        const privyToken = getPrivyToken(req);
        if (privyToken) {
          authSig = await signRpcBodyWithUserJwt(privyWalletId, rpcBody, privyToken);
        }
        if (!authSig) {
          const treasuryKey = getTreasuryAuthPrivateKey();
          if (treasuryKey) {
            try {
              authSig = await signRpcBodyWithPrivateKey(privyWalletId, rpcBody, treasuryKey);
            } catch (e) {
              console.warn('[privy] committee server sign:', e);
            }
          }
        }
      }

      await sb.from('multisig_signatures').upsert(
        {
          proposal_id: proposalId,
          signer_wallet: wallet,
          signed_at: new Date().toISOString(),
          authorization_signature: authSig,
        },
        { onConflict: 'proposal_id,signer_wallet' },
      );

      const { data: sigs } = await sb
        .from('multisig_signatures')
        .select('signer_wallet, signed_at, authorization_signature')
        .eq('proposal_id', proposalId)
        .not('signed_at', 'is', null);

      const signedCount = sigs?.length ?? 0;
      const threshold = Number(msWallet?.threshold ?? 2);
      const privyAuthCount = (sigs ?? []).filter((s) => s.authorization_signature).length;
      const executed = signedCount >= threshold;
      if (executed) await executeMultisigProposal(sb, proposalId);

      return jsonResponse({
        ok: true,
        signedCount,
        threshold,
        privyAuthCount,
        executed,
        privyOnchain: Boolean(privyWalletId),
      });
    }

    // POST /multisig/committee
    if (req.method === 'POST' && path === '/multisig/committee') {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const body = await req.json().catch(() => ({}));
      const { signerWallet, roleZh, roleEn, dividendWeightPct } = body as {
        signerWallet?: string;
        roleZh?: string;
        roleEn?: string;
        dividendWeightPct?: number;
      };
      if (!signerWallet || !isEthAddress(signerWallet)) {
        throw new HttpError(400, 'Invalid signer wallet');
      }

      const ctx = await resolveLineMultisigContext(sb, wallet);
      if (!ctx.lineMultisig) throw new HttpError(404, 'Line multisig not found');
      if (!ctx.isLineLeader) throw new HttpError(403, 'Only line leader can manage committee');

      const total = ctx.committeeMembers.filter((m) => m.multisig_wallet_id === ctx.lineMultisig!.id).length;
      if (total >= ctx.lineMultisig.total_signers) throw new HttpError(400, 'Committee is full');

      const { data, error } = await sb
        .from('committee_members')
        .insert({
          multisig_wallet_id: ctx.lineMultisig.id,
          signer_wallet: signerWallet.trim(),
          role_zh: roleZh ?? '委员',
          role_en: roleEn ?? 'Committee',
          is_line_leader: false,
          sort_order: total,
          dividend_weight_pct: dividendWeightPct ?? null,
        })
        .select()
        .single();
      if (error) throw new HttpError(502, error.message);
      return jsonResponse({ member: data });
    }

    // PATCH /multisig/committee/:memberId
    const patchMember = path.match(/^\/multisig\/committee\/([^/]+)$/);
    if (req.method === 'PATCH' && patchMember) {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const body = await req.json().catch(() => ({}));
      const ctx = await resolveLineMultisigContext(sb, wallet);
      if (!ctx.isLineLeader) throw new HttpError(403, 'Only line leader can update committee');

      const { roleZh, roleEn, dividendWeightPct } = body as {
        roleZh?: string;
        roleEn?: string;
        dividendWeightPct?: number;
      };
      const patch: Record<string, unknown> = {};
      if (roleZh !== undefined) patch.role_zh = roleZh;
      if (roleEn !== undefined) patch.role_en = roleEn;
      if (dividendWeightPct !== undefined) patch.dividend_weight_pct = dividendWeightPct;

      const { data, error } = await sb
        .from('committee_members')
        .update(patch)
        .eq('id', patchMember[1])
        .eq('multisig_wallet_id', ctx.lineMultisig?.id ?? '')
        .select()
        .single();
      if (error) throw new HttpError(502, error.message);
      return jsonResponse({ member: data });
    }

    // DELETE /multisig/committee/:memberId
    if (req.method === 'DELETE' && patchMember) {
      const wallet = await requireActorWallet(sb, req, { allowDemo: true });
      const ctx = await resolveLineMultisigContext(sb, wallet);
      if (!ctx.isLineLeader) throw new HttpError(403, 'Only line leader can remove committee members');

      const { data: target } = await sb
        .from('committee_members')
        .select('*')
        .eq('id', patchMember[1])
        .maybeSingle();
      if (!target || target.multisig_wallet_id !== ctx.lineMultisig?.id) {
        throw new HttpError(404, 'Member not found');
      }
      if (target.is_line_leader) throw new HttpError(400, 'Cannot remove line leader');

      const { error } = await sb.from('committee_members').delete().eq('id', patchMember[1]);
      if (error) throw new HttpError(502, error.message);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (e) {
    if (e instanceof HttpError) {
      return jsonResponse({ error: e.message, ...e.body }, e.status);
    }
    console.error('[union]', e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
