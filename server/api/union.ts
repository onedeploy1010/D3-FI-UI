import { Router, type Request, type Response, type NextFunction } from 'express';
import { getSupabaseAdmin, isSupabaseConfigured } from '../lib/supabase.js';
import { getWalletFromRequest, requireWallet, shortWallet, walletEquals } from '../lib/walletAuth.js';
import { getBearerToken, isPrivyAuthConfigured, verifyPrivyAccessToken } from '../lib/privyAuth.js';

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
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });

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
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });
    const wallet = requireWallet(req);
    if (!assertWalletMatch(req, wallet, res)) return;

    const sb = getSupabaseAdmin();
    const profile = await findProfileByWallet(sb, wallet);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const pk = profile.wallet_address as string;

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

    let lineId = (teamNode.data as { line_id?: string } | null)?.line_id ?? null;
    if (!lineId) {
      const { data: leaderLine } = await sb
        .from('union_lines')
        .select('id')
        .eq('line_leader_wallet', pk)
        .maybeSingle();
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
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });

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
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });

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
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });

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
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });

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

  return router;
}

function isEthAddress(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}
