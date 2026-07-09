import { Router, type Request, type Response, type NextFunction } from 'express';
import { getSupabaseAdmin, isSupabaseConfigured } from '../lib/supabase.js';
import { getWalletFromRequest, requireWallet, shortWallet, walletEquals } from '../lib/walletAuth.js';
import { getBearerToken, isPrivyAuthConfigured, verifyPrivyAccessToken } from '../lib/privyAuth.js';

const DEMO_WALLET = '0x1234567890AbCdEf1234567890AbCdEf12345678';

const DEMO_POC_SCORE = {
  epoch_label: '#42',
  level_label: 'V5',
  composite_score: 78.4,
  level_diff_rate: 28.6,
  diff_floor_pct: 16,
  diff_ceil_pct: 38,
  dim_h: 72,
  dim_c: 85,
  dim_a: 68,
  dim_r: 91,
  dim_e: 56,
  raw_h_zh: '质押 D3 价值 $3,200',
  raw_h_en: 'Staked D3 value $3,200',
  raw_c_zh: '大区+小区总业绩 $556,400',
  raw_c_en: 'Large+small area $556,400',
  raw_a_zh: '30天新增 $42,000',
  raw_a_en: '30d new deposits $42,000',
  raw_r_zh: '续投+未提现比例 91%',
  raw_r_en: 'Renewal + unwithdrawn 91%',
  raw_e_zh: '新增有效户 12 (≥100U)',
  raw_e_en: '12 new valid (≥100U)',
  settled_at: '2026-07-06T00:00:00Z',
} as const;

async function ensureDemoPocScore(sb: ReturnType<typeof getSupabaseAdmin>, pk: string) {
  if (!walletEquals(pk, DEMO_WALLET)) return;
  const { data: row } = await sb.from('poc_scores').select('composite_score').eq('wallet_address', pk).maybeSingle();
  if (row && Number(row.composite_score) > 0) return;
  await sb.from('poc_scores').upsert({ wallet_address: pk, ...DEMO_POC_SCORE }, { onConflict: 'wallet_address' });
}

function walletQuery(sb: ReturnType<typeof getSupabaseAdmin>, wallet: string) {
  return sb.from('profiles').select('*').eq('wallet_address', wallet).maybeSingle();
}

async function findProfileByWallet(sb: ReturnType<typeof getSupabaseAdmin>, wallet: string) {
  const exact = await sb.from('profiles').select('*').eq('wallet_address', wallet).maybeSingle();
  if (exact.data) return exact.data;
  const { data } = await sb.from('profiles').select('*').ilike('wallet_address', wallet.toLowerCase()).maybeSingle();
  return data;
}

function assertWalletMatch(req: Request, wallet: string, res: Response): boolean {
  const headerWallet = getWalletFromRequest(req);
  if (headerWallet && !walletEquals(headerWallet, wallet)) {
    res.status(403).json({ error: 'Wallet header mismatch' });
    return false;
  }
  return true;
}

async function ensureProfile(
  sb: ReturnType<typeof getSupabaseAdmin>,
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

async function findUnionLineByLeader(sb: ReturnType<typeof getSupabaseAdmin>, wallet: string) {
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

/** Active shareholders get their own union line + multisig treasury if missing */
async function ensureShareholderLineInfra(sb: ReturnType<typeof getSupabaseAdmin>, wallet: string) {
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
    const treasury = pk;
    const { data: newMs, error } = await sb
      .from('multisig_wallets')
      .insert({
        line_id: lineId,
        wallet_type: 'line',
        treasury_address: treasury,
        short_address: shortWallet(treasury),
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

export function createUnionRouter(): Router {
  const router = Router();

  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && req.path === '/health') return next();
    const wallet = getWalletFromRequest(req);
    if (wallet) res.locals.wallet = wallet;
    next();
  });

  router.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && (req.path === '/health' || req.path === '/protocol')) return next();
    if (!isPrivyAuthConfigured()) return next();

    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Privy access token required' });
      return;
    }

    try {
      const claims = await verifyPrivyAccessToken(token);
      res.locals.privyUserId = claims.sub;
      next();
    } catch (e) {
      res.status(401).json({ error: e instanceof Error ? e.message : 'Invalid Privy token' });
    }
  });

  router.get('/health', async (_req, res) => {
    if (!isSupabaseConfigured()) return res.json({ ok: false, configured: false });
    try {
      const sb = getSupabaseAdmin();
      const { error } = await sb.from('profiles').select('wallet_address').limit(1);
      if (error?.message.includes('schema cache') || error?.code === 'PGRST205') {
        return res.json({ ok: false, configured: true, migrated: false });
      }
      if (error) return res.status(502).json({ ok: false, configured: true, error: error.message });
      res.json({ ok: true, configured: true, migrated: true });
    } catch (e) {
      res.status(502).json({ ok: false, configured: true, error: String(e) });
    }
  });

  router.get('/protocol', async (_req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });

    const sb = getSupabaseAdmin();
    const { data: epoch, error: epochErr } = await sb
      .from('protocol_epochs')
      .select('*')
      .eq('is_current', true)
      .maybeSingle();

    if (epochErr?.code === 'PGRST205' || epochErr?.message?.includes('schema cache')) {
      return res.json({ epoch: null, bribeProjects: [], migrated: false });
    }
    if (epochErr) return res.status(502).json({ error: epochErr.message });

    let bribeProjects: unknown[] = [];
    if (epoch) {
      const { data: projects, error: projErr } = await sb
        .from('bribe_projects')
        .select('*')
        .eq('epoch_number', epoch.epoch_number)
        .order('sort_order');
      if (projErr && !projErr.message?.includes('schema cache')) {
        return res.status(502).json({ error: projErr.message });
      }
      bribeProjects = projects ?? [];
    }

    res.json({ epoch: epoch ?? null, bribeProjects, migrated: true });
  });

  router.get('/profile/:wallet', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });
    const wallet = requireWallet(req);
    if (!assertWalletMatch(req, wallet, res)) return;

    const sb = getSupabaseAdmin();
    const profile = await findProfileByWallet(sb, wallet);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const pk = profile.wallet_address as string;
    await ensureDemoPocScore(sb, pk);

    const [shareholder, usd3, d3, referrals, dividends, fiPositions, teamNode, directReferrals, pocScore] = await Promise.all([
      sb.from('shareholders').select('*').eq('wallet_address', pk).maybeSingle(),
      sb.from('usd3_accounts').select('*').eq('wallet_address', pk).maybeSingle(),
      sb.from('d3_accounts').select('*').eq('wallet_address', pk).maybeSingle(),
      sb.from('referrals').select('*').eq('wallet_address', pk),
      sb.from('dividend_accruals').select('*').eq('wallet_address', pk).order('created_at', { ascending: false }).limit(50),
      sb.from('fi_positions').select('*').eq('wallet_address', pk).eq('status', 'active'),
      sb.from('team_nodes').select('*').eq('wallet_address', pk).maybeSingle(),
      sb.from('referrals').select('wallet_address, referred_at, status, referral_type').eq('sponsor_wallet_address', pk).eq('status', 'active'),
      sb.from('poc_scores').select('*').eq('wallet_address', pk).maybeSingle(),
    ]);

    if (shareholder.data?.is_shareholder && shareholder.data.status === 'active') {
      try {
        await ensureShareholderLineInfra(sb, pk);
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
      lineId ? sb.from('union_lines').select('*').eq('id', lineId).maybeSingle() : Promise.resolve({ data: null }),
      lineId ? sb.from('team_nodes').select('*').eq('line_id', lineId) : Promise.resolve({ data: [] }),
      lineId ? sb.from('multisig_wallets').select('*').eq('line_id', lineId) : Promise.resolve({ data: [] }),
      sb.from('multisig_wallets').select('*').eq('wallet_type', 'dao').maybeSingle(),
    ]);

    const multisigList = [
      ...(lineMultisigs.data ?? []),
      ...(daoMultisig.data ? [daoMultisig.data] : []),
    ];
    const multisigIds = multisigList.map((m) => m.id as string);

    const [committeeMembers, multisigProposals] = await Promise.all([
      multisigIds.length
        ? sb.from('committee_members').select('*').in('multisig_wallet_id', multisigIds).order('sort_order')
        : Promise.resolve({ data: [] }),
      multisigIds.length
        ? sb.from('multisig_proposals').select('*').in('multisig_wallet_id', multisigIds).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const proposalIds = (multisigProposals.data ?? []).map((p) => p.id as string);
    const { data: multisigSignatures } = proposalIds.length
      ? await sb.from('multisig_signatures').select('*').in('proposal_id', proposalIds)
      : { data: [] };

    res.json({
      profile,
      shareholder: shareholder.data,
      usd3Account: usd3.data,
      d3Account: d3.data,
      referrals: referrals.data ?? [],
      dividends: dividends.data ?? [],
      fiPositions: fiPositions.data ?? [],
      teamNode: teamNode.data,
      directReferrals: directReferrals.data ?? [],
      unionLine: unionLine.data,
      lineTeamNodes: lineTeamNodes.data ?? [],
      multisigWallets: multisigList,
      committeeMembers: committeeMembers.data ?? [],
      multisigProposals: multisigProposals.data ?? [],
      multisigSignatures: multisigSignatures ?? [],
      pocScore: pocScore.data,
    });
  });

  router.post('/profile', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });

    const wallet = requireWallet(req);
    const { privyUserId: bodyPrivyUserId, displayName, lang } = req.body as {
      privyUserId?: string;
      displayName?: string;
      lang?: 'zh' | 'en';
    };
    const privyUserId = (res.locals.privyUserId as string | undefined) ?? bodyPrivyUserId;

    const sb = getSupabaseAdmin();
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
      if (error) return res.status(502).json({ error: error.message });
      return res.json({ profile: data, created: false });
    }

    try {
      const profile = await ensureProfile(sb, wallet, lang ?? 'zh', privyUserId);
      res.json({ profile, created: true });
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  router.post('/shareholders/join', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });

    const wallet = requireWallet(req);
    const { joinTxHash, sponsorWallet } = req.body as { joinTxHash?: string; sponsorWallet?: string };

    const sb = getSupabaseAdmin();
    await ensureProfile(sb, wallet);

    const { data: shareholder, error } = await sb
      .from('shareholders')
      .upsert({
        wallet_address: wallet,
        is_shareholder: true,
        genesis_dt_count: 1,
        joined_at: new Date().toISOString(),
        join_tx_hash: joinTxHash ?? null,
        status: 'active',
      }, { onConflict: 'wallet_address' })
      .select()
      .single();

    if (error) return res.status(502).json({ error: error.message });

    try {
      await ensureShareholderLineInfra(sb, wallet);
    } catch (e) {
      console.warn('[union] ensureShareholderLineInfra on join:', e);
    }

    if (sponsorWallet && isEthAddress(sponsorWallet)) {
      const sponsor = await findProfileByWallet(sb, sponsorWallet.trim());
      if (sponsor) {
        await sb.from('referrals').upsert({
          wallet_address: wallet,
          sponsor_wallet_address: sponsor.wallet_address,
          referral_type: 'shareholder',
          status: 'active',
          join_tx_hash: joinTxHash ?? null,
        }, { onConflict: 'wallet_address,sponsor_wallet_address' });
      }
    }

    res.json({ shareholder });
  });

  router.post('/usd3/claim', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });

    const wallet = requireWallet(req);
    const sb = getSupabaseAdmin();
    const profile = await findProfileByWallet(sb, wallet);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const pk = profile.wallet_address as string;
    const { data: account, error: accErr } = await sb.from('usd3_accounts').select('*').eq('wallet_address', pk).single();
    if (accErr) return res.status(502).json({ error: accErr.message });
    if (!account || account.pending_usd3 <= 0) return res.status(400).json({ error: 'Nothing to claim' });

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

    if (error) return res.status(502).json({ error: error.message });

    await sb
      .from('dividend_accruals')
      .update({ status: 'claimed', claimed_at: new Date().toISOString() })
      .eq('wallet_address', pk)
      .eq('asset_type', 'usd3')
      .in('status', ['pending', 'claimable']);

    res.json({ usd3Account: updated });
  });

  router.post('/referrals/bind', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });

    const wallet = requireWallet(req);
    const { sponsorWallet, referralType } = req.body as {
      sponsorWallet?: string;
      referralType?: 'partner' | 'shareholder';
    };

    if (!sponsorWallet || !isEthAddress(sponsorWallet)) {
      return res.status(400).json({ error: 'Invalid sponsor wallet' });
    }
    if (walletEquals(wallet, sponsorWallet)) {
      return res.status(400).json({ error: 'Cannot refer yourself' });
    }

    const sb = getSupabaseAdmin();
    await ensureProfile(sb, wallet);
    await ensureProfile(sb, sponsorWallet.trim());
    const sponsor = await findProfileByWallet(sb, sponsorWallet.trim());
    if (!sponsor) {
      return res.status(404).json({ error: 'Sponsor profile not found' });
    }

    const { data: existingList } = await sb
      .from('referrals')
      .select('*')
      .eq('wallet_address', wallet)
      .eq('status', 'active')
      .limit(1);

    const existing = existingList?.[0];
    if (existing) {
      return res.status(409).json({
        error: 'Referral already bound',
        referral: existing,
      });
    }

    const type = referralType === 'shareholder' ? 'shareholder' : 'partner';
    const { data, error } = await sb
      .from('referrals')
      .upsert(
        {
          wallet_address: wallet,
          sponsor_wallet_address: sponsor.wallet_address,
          referral_type: type,
          status: 'active',
        },
        { onConflict: 'wallet_address,sponsor_wallet_address' },
      )
      .select()
      .single();

    if (error) return res.status(502).json({ error: error.message });
    res.json({ referral: data, created: true });
  });

  router.get('/notifications', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });
    const wallet = requireWallet(req);
    if (!assertWalletMatch(req, wallet, res)) return;

    const unreadOnly = req.query.unreadOnly === 'true';
    const sb = getSupabaseAdmin();
    const profile = await findProfileByWallet(sb, wallet);
    if (!profile) return res.json({ notifications: [], migrated: true });

    let q = sb
      .from('user_notifications')
      .select('*')
      .eq('wallet_address', profile.wallet_address)
      .order('created_at', { ascending: false })
      .limit(50);

    if (unreadOnly) q = q.eq('is_read', false);

    const { data, error } = await q;
    if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
      return res.json({ notifications: [], migrated: false });
    }
    if (error) return res.status(502).json({ error: error.message });

    res.json({ notifications: data ?? [], migrated: true });
  });

  router.post('/notifications/:id/read', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });
    const wallet = requireWallet(req);
    if (!assertWalletMatch(req, wallet, res)) return;

    const sb = getSupabaseAdmin();
    const profile = await findProfileByWallet(sb, wallet);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const { error } = await sb
      .from('user_notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .eq('wallet_address', profile.wallet_address);

    if (error) return res.status(502).json({ error: error.message });
    res.json({ ok: true, id: req.params.id });
  });

  router.post('/notifications/read-all', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });
    const wallet = requireWallet(req);
    if (!assertWalletMatch(req, wallet, res)) return;

    const sb = getSupabaseAdmin();
    const profile = await findProfileByWallet(sb, wallet);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const { error } = await sb
      .from('user_notifications')
      .update({ is_read: true })
      .eq('wallet_address', profile.wallet_address)
      .eq('is_read', false);

    if (error) return res.status(502).json({ error: error.message });
    res.json({ ok: true });
  });

  router.post('/multisig/proposals', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });
    const wallet = requireWallet(req);
    if (!assertWalletMatch(req, wallet, res)) return;

    const sb = getSupabaseAdmin();
    const ctx = await resolveLineMultisigContext(sb, wallet);
    if (!ctx.lineMultisig) return res.status(404).json({ error: 'Line multisig not found' });
    if (!ctx.isLineLeader) return res.status(403).json({ error: 'Only line leader can create proposals' });

    const { periodZh, periodEn, beneficiaryCount } = req.body as {
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

    const { data: proposal, error } = await sb
      .from('multisig_proposals')
      .insert({
        multisig_wallet_id: ctx.lineMultisig.id,
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
      })
      .select()
      .single();

    if (error) return res.status(502).json({ error: error.message });

    const proposalId = proposal.id as string;

    if (wallets.length) {
      await sb
        .from('dividend_accruals')
        .update({ status: 'multisig_pending', multisig_proposal_id: proposalId })
        .in('wallet_address', wallets)
        .eq('cycle_type', 'monthly')
        .in('stream_id', ['treasury', 'line'])
        .in('status', ['pending']);
    }

    await sb.from('multisig_signatures').upsert(
      {
        proposal_id: proposalId,
        signer_wallet: wallet,
        signed_at: new Date().toISOString(),
      },
      { onConflict: 'proposal_id,signer_wallet' },
    );

    res.json({ proposal });
  });

  router.post('/multisig/proposals/:id/sign', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });
    const wallet = requireWallet(req);
    if (!assertWalletMatch(req, wallet, res)) return;

    const sb = getSupabaseAdmin();
    const ctx = await resolveLineMultisigContext(sb, wallet);
    if (!ctx.isCommitteeMember) return res.status(403).json({ error: 'Not a committee member' });

    const proposalId = req.params.id;
    const { data: proposal, error: pErr } = await sb
      .from('multisig_proposals')
      .select('*')
      .eq('id', proposalId)
      .maybeSingle();
    if (pErr) return res.status(502).json({ error: pErr.message });
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'pending') return res.status(400).json({ error: 'Proposal not pending' });

    const member = ctx.committeeMembers.find(
      (m) => m.multisig_wallet_id === proposal.multisig_wallet_id,
    );
    if (!member) return res.status(403).json({ error: 'Not a signer for this wallet' });

    await sb.from('multisig_signatures').upsert(
      {
        proposal_id: proposalId,
        signer_wallet: wallet,
        signed_at: new Date().toISOString(),
      },
      { onConflict: 'proposal_id,signer_wallet' },
    );

    const { data: msWallet } = await sb
      .from('multisig_wallets')
      .select('threshold')
      .eq('id', proposal.multisig_wallet_id)
      .single();

    const { data: sigs } = await sb
      .from('multisig_signatures')
      .select('signer_wallet, signed_at')
      .eq('proposal_id', proposalId)
      .not('signed_at', 'is', null);

    const signedCount = sigs?.length ?? 0;
    const threshold = Number(msWallet?.threshold ?? 2);

    if (signedCount >= threshold) {
      await executeMultisigProposal(sb, proposalId);
    }

    res.json({ ok: true, signedCount, threshold, executed: signedCount >= threshold });
  });

  router.post('/multisig/committee', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });
    const wallet = requireWallet(req);
    if (!assertWalletMatch(req, wallet, res)) return;

    const { signerWallet, roleZh, roleEn, dividendWeightPct } = req.body as {
      signerWallet?: string;
      roleZh?: string;
      roleEn?: string;
      dividendWeightPct?: number;
    };

    if (!signerWallet || !isEthAddress(signerWallet)) {
      return res.status(400).json({ error: 'Invalid signer wallet' });
    }

    const sb = getSupabaseAdmin();
    const ctx = await resolveLineMultisigContext(sb, wallet);
    if (!ctx.lineMultisig) return res.status(404).json({ error: 'Line multisig not found' });
    if (!ctx.isLineLeader) return res.status(403).json({ error: 'Only line leader can manage committee' });

    const total = ctx.committeeMembers.filter((m) => m.multisig_wallet_id === ctx.lineMultisig!.id).length;
    if (total >= ctx.lineMultisig.total_signers) {
      return res.status(400).json({ error: 'Committee is full' });
    }

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

    if (error) return res.status(502).json({ error: error.message });
    res.json({ member: data });
  });

  router.patch('/multisig/committee/:memberId', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });
    const wallet = requireWallet(req);
    if (!assertWalletMatch(req, wallet, res)) return;

    const sb = getSupabaseAdmin();
    const ctx = await resolveLineMultisigContext(sb, wallet);
    if (!ctx.isLineLeader) return res.status(403).json({ error: 'Only line leader can update committee' });

    const { roleZh, roleEn, dividendWeightPct } = req.body as {
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
      .eq('id', req.params.memberId)
      .eq('multisig_wallet_id', ctx.lineMultisig?.id ?? '')
      .select()
      .single();

    if (error) return res.status(502).json({ error: error.message });
    res.json({ member: data });
  });

  router.delete('/multisig/committee/:memberId', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service not configured' });
    const wallet = requireWallet(req);
    if (!assertWalletMatch(req, wallet, res)) return;

    const sb = getSupabaseAdmin();
    const ctx = await resolveLineMultisigContext(sb, wallet);
    if (!ctx.isLineLeader) return res.status(403).json({ error: 'Only line leader can remove committee members' });

    const { data: target } = await sb
      .from('committee_members')
      .select('*')
      .eq('id', req.params.memberId)
      .maybeSingle();

    if (!target || target.multisig_wallet_id !== ctx.lineMultisig?.id) {
      return res.status(404).json({ error: 'Member not found' });
    }
    if (target.is_line_leader) return res.status(400).json({ error: 'Cannot remove line leader' });

    const { error } = await sb.from('committee_members').delete().eq('id', req.params.memberId);
    if (error) return res.status(502).json({ error: error.message });
    res.json({ ok: true });
  });

  return router;
}

async function resolveLineMultisigContext(sb: ReturnType<typeof getSupabaseAdmin>, wallet: string) {
  const profile = await findProfileByWallet(sb, wallet);
  const pk = profile?.wallet_address as string | undefined;

  if (pk) {
    try {
      await ensureShareholderLineInfra(sb, pk);
    } catch {
      /* best-effort */
    }
  }

  let lineId: string | null = null;
  if (pk) {
    const { data: teamNode } = await sb.from('team_nodes').select('line_id').eq('wallet_address', pk).maybeSingle();
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
    Boolean(lineId && pk && (await findUnionLineByLeader(sb, pk))?.line_leader_wallet?.toLowerCase() === wallet.toLowerCase());
  const isCommitteeMember = members.some(
    (m) => String(m.signer_wallet).toLowerCase() === wallet.toLowerCase(),
  );

  return { lineId, lineMultisig, committeeMembers: members, isLineLeader, isCommitteeMember };
}

async function executeMultisigProposal(sb: ReturnType<typeof getSupabaseAdmin>, proposalId: string) {
  const executedAt = new Date().toISOString();
  const txHash = `0x${'ab'.repeat(32)}`;

  await sb
    .from('multisig_proposals')
    .update({ status: 'executed', executed_at: executedAt, tx_hash: txHash })
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
        await sb.from('usd3_accounts').update({
          pending_usd3: Number(acc.pending_usd3 ?? 0) + amount,
        }).eq('wallet_address', w);
      }
    } else {
      await sb.from('dividend_accruals').update({ status: 'claimable' }).eq('id', d.id);
      const { data: acc } = await sb.from('d3_accounts').select('*').eq('wallet_address', w).maybeSingle();
      if (acc) {
        await sb.from('d3_accounts').update({
          pending_d3: Number(acc.pending_d3 ?? 0) + amount,
        }).eq('wallet_address', w);
      }
    }
  }
}

function isEthAddress(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}
