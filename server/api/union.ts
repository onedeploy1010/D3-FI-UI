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
    if (req.method === 'GET' && req.path === '/health') return next();
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

  router.get('/profile/:wallet', async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });
    const wallet = requireWallet(req);
    if (!assertWalletMatch(req, wallet, res)) return;

    const sb = getSupabaseAdmin();
    const profile = await findProfileByWallet(sb, wallet);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const pk = profile.wallet_address as string;

    const [shareholder, usd3, d3, referrals, dividends, fiPositions] = await Promise.all([
      sb.from('shareholders').select('*').eq('wallet_address', pk).maybeSingle(),
      sb.from('usd3_accounts').select('*').eq('wallet_address', pk).maybeSingle(),
      sb.from('d3_accounts').select('*').eq('wallet_address', pk).maybeSingle(),
      sb.from('referrals').select('*').eq('wallet_address', pk),
      sb.from('dividend_accruals').select('*').eq('wallet_address', pk).order('created_at', { ascending: false }).limit(20),
      sb.from('fi_positions').select('*').eq('wallet_address', pk).eq('status', 'active'),
    ]);

    res.json({
      profile,
      shareholder: shareholder.data,
      usd3Account: usd3.data,
      d3Account: d3.data,
      referrals: referrals.data ?? [],
      dividends: dividends.data ?? [],
      fiPositions: fiPositions.data ?? [],
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

  return router;
}

function isEthAddress(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}
