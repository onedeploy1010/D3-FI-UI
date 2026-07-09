import { corsHeaders, jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { isDemoModeRequest } from '../_shared/demo.ts';
import { createPrivyTreasuryWallet } from '../_shared/privyApi.ts';
import { isPrivyOnchainEnabled } from '../_shared/privySign.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { HttpError, shortWallet } from '../_shared/wallet.ts';

const PARTNER_TREASURY_ROW_ID = '00000000-0000-4000-8000-000000000040';

type Sb = ReturnType<typeof getSupabaseAdmin>;

type TreasuryFields = {
  treasury_address: string;
  short_address: string;
  privy_wallet_id: string | null;
  privy_key_quorum_id: string | null;
};

function partnerDaoQuorumId(): string | null {
  return Deno.env.get('PRIVY_DAO_KEY_QUORUM_ID') ?? Deno.env.get('PRIVY_LINE_KEY_QUORUM_ID') ?? null;
}

async function resolvePartnerTreasuryFields(): Promise<TreasuryFields> {
  const fallback: TreasuryFields = {
    treasury_address: '0x4a8c1f2e9b0d3c6a5f8e7d1c0b9a8f7e6d5c4b3a',
    short_address: '0x4a8c…b3a',
    privy_wallet_id: null,
    privy_key_quorum_id: null,
  };
  if (!isPrivyOnchainEnabled()) return fallback;
  const quorumId = partnerDaoQuorumId();
  if (!quorumId) return fallback;
  try {
    const pw = await createPrivyTreasuryWallet(
      quorumId,
      'D3 Partner Crowdfund',
      'd3-partner-global-treasury',
    );
    return {
      treasury_address: pw.address,
      short_address: shortWallet(pw.address),
      privy_wallet_id: pw.id,
      privy_key_quorum_id: quorumId,
    };
  } catch (e) {
    console.warn('[privy] create partner treasury:', e);
    return fallback;
  }
}

function needsPrivyUpgrade(ms: Record<string, unknown>): boolean {
  return Boolean(!ms.privy_wallet_id && isPrivyOnchainEnabled() && partnerDaoQuorumId());
}

async function provisionPrivyTreasury(sb: Sb, ms: Record<string, unknown>) {
  if (!needsPrivyUpgrade(ms)) return ms;
  try {
    const fields = await resolvePartnerTreasuryFields();
    if (!fields.privy_wallet_id) return ms;
    const { data: updated } = await sb
      .from('multisig_wallets')
      .update(fields)
      .eq('id', ms.id as string)
      .select()
      .single();
    return updated ?? ms;
  } catch (e) {
    console.warn('[privy] provision partner treasury:', e);
    return ms;
  }
}

/** Single global wallet for partner join + crowdfund USDT (company multisig). */
async function ensurePartnerTreasury(sb: Sb) {
  let { data: ms } = await sb
    .from('multisig_wallets')
    .select('*')
    .eq('wallet_type', 'partner')
    .maybeSingle();

  if (!ms) {
    const fields = await resolvePartnerTreasuryFields();
    const { data: created, error } = await sb
      .from('multisig_wallets')
      .insert({
        id: PARTNER_TREASURY_ROW_ID,
        line_id: null,
        wallet_type: 'partner',
        ...fields,
        label_zh: '合伙人众筹金库',
        label_en: 'Partner crowdfund treasury',
        threshold: 3,
        total_signers: 5,
        balance_usd3: 0,
        balance_d3: 0,
      })
      .select()
      .single();
    if (error) throw error;
    ms = created;
  } else if (needsPrivyUpgrade(ms as Record<string, unknown>)) {
    ms = (await provisionPrivyTreasury(sb, ms as Record<string, unknown>)) as typeof ms;
  }

  const { data: committee } = await sb
    .from('committee_members')
    .select('signer_wallet, role_zh, role_en, sort_order')
    .eq('multisig_wallet_id', ms!.id as string)
    .order('sort_order');

  return { treasury: ms, committee: committee ?? [] };
}

function routePath(req: Request): string {
  const url = new URL(req.url);
  let p = url.pathname;
  if (p.startsWith('/partner')) p = p.slice('/partner'.length) || '/';
  return p || '/';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const path = routePath(req);
  const sb = getSupabaseAdmin();

  try {
    const publicGet = req.method === 'GET' && path === '/treasury';
    const demoMode = isDemoModeRequest(req);
    if (!publicGet && !demoMode) {
      // Partner writes will require Privy auth in production; reads are public for now.
    }

    if (req.method === 'GET' && path === '/treasury') {
      const { treasury, committee } = await ensurePartnerTreasury(sb);
      return jsonResponse({
        treasuryAddress: treasury!.treasury_address,
        shortAddress: treasury!.short_address,
        labelZh: treasury!.label_zh,
        labelEn: treasury!.label_en,
        threshold: treasury!.threshold,
        totalSigners: treasury!.total_signers,
        privyWalletId: treasury!.privy_wallet_id ?? null,
        multisigType: 'partner',
        committee,
      });
    }

    if (req.method === 'GET' && path === '/health') {
      return jsonResponse({ ok: true, service: 'partner' });
    }

    throw new HttpError(404, 'Not found');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: message }, status);
  }
});
