import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { isDemoModeRequest } from '../_shared/demo.ts';
import {
  createStakeIntent,
  creditDepositDemo,
  getDepositStatus,
  isIntentCredited,
  reportDepositTx,
} from '../_shared/deposit.ts';
import {
  isYieldWithdrawDemoRequest,
  requestPartnerYieldWithdraw,
} from '../_shared/partnerYieldWithdraw.ts';
import { transferPartnerSd3 } from '../_shared/partnerSd3Transfer.ts';
import { stakePartnerSd3 } from '../_shared/partnerSd3Stake.ts';
import { runTreasuryPipeline } from '../_shared/sweep.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { isTurnkeyConfigured, treasuryAddressFromEnv, treasuryWalletIdFromEnv, isTurnkeyConsensusError } from '../_shared/turnkey.ts';
import {
  ensureInfrastructureWallets,
  getInfrastructureSummary,
} from '../_shared/wallets.ts';
import {
  getDepositPoolStats,
  replenishDepositPool,
  replenishDepositPoolIfLow,
} from '../_shared/depositPool.ts';
import { ensureDepositsHdWallet } from '../_shared/depositsHd.ts';
import {
  approveAllConsensusActivities,
  getConsensusDiagnostics,
} from '../_shared/turnkeyConsensus.ts';
import { syncReferralBindingsFromChain } from '../_shared/referralRegistry.ts';
import { anchorDailyState, getStateProof } from '../_shared/merkleAnchor.ts';
import { computeSolvency } from '../_shared/solvency.ts';
import { HttpError } from '../_shared/wallet.ts';
import { assertMoneyAmount, requireActorWallet } from '../_shared/requireActor.ts';
import { assertSettlementTokenSafe } from '../_shared/tokens.ts';

function routePath(req: Request): string {
  const url = new URL(req.url);
  let p = url.pathname;
  if (p.startsWith('/treasury')) p = p.slice('/treasury'.length) || '/';
  return p || '/';
}

async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

/** Constant-time string comparison to avoid leaking the secret via timing (V-14). */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  // Fold the length difference into the accumulator so the loop runs a fixed
  // number of iterations regardless of input, still returning false on mismatch.
  let diff = ba.length ^ bb.length;
  const len = Math.max(ba.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function requireCronSecret(req: Request): void {
  const secret = Deno.env.get('TREASURY_CRON_SECRET');
  if (!secret) throw new HttpError(503, 'TREASURY_CRON_SECRET not configured');
  const header = req.headers.get('X-Treasury-Cron-Secret') ?? '';
  if (!timingSafeEqual(header, secret)) throw new HttpError(401, 'Unauthorized');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const path = routePath(req);
  const sb = getSupabaseAdmin();

  try {
    if (req.method === 'GET' && path === '/health') {
      const summary = await getInfrastructureSummary(sb).catch(() => null);
      const depositPool = await getDepositPoolStats(sb).catch(() => null);
      const solvency = await computeSolvency(sb).catch(() => null);
      return jsonResponse({
        ok: true,
        service: 'treasury',
        turnkey: isTurnkeyConfigured(),
        treasuryAddress: treasuryAddressFromEnv() ? 'configured' : 'missing',
        treasuryWalletId: treasuryWalletIdFromEnv() ? 'configured' : 'missing',
        infrastructure: summary,
        depositPool,
        solvency,
      });
    }

    if (req.method === 'POST' && path === '/internal/partner-settlement/run') {
      requireCronSecret(req);
      const body = await readJson<{ settlementDate?: string }>(req).catch(
        () => ({} as { settlementDate?: string }),
      );
      const { runDailyPartnerSettlement } = await import('../_shared/partnerSettlement.ts');
      const result = await runDailyPartnerSettlement(sb, body.settlementDate);
      // Anchor the day's balances on-chain (tamper-evidence). Non-fatal on failure.
      const anchor = await anchorDailyState(sb, body.settlementDate).catch((e) => ({
        error: e instanceof Error ? e.message : String(e),
      }));
      return jsonResponse({ ok: true, ...result, anchor });
    }

    if (req.method === 'POST' && path === '/admin/anchor-daily-state') {
      requireCronSecret(req);
      const body = await readJson<{ settlementDate?: string }>(req).catch(
        () => ({} as { settlementDate?: string }),
      );
      const result = await anchorDailyState(sb, body.settlementDate);
      return jsonResponse({ ok: true, ...result });
    }

    if (req.method === 'GET' && path === '/admin/solvency') {
      requireCronSecret(req);
      const report = await computeSolvency(sb);
      return jsonResponse({ ok: true, ...report });
    }

    if (req.method === 'POST' && path === '/internal/partner-demo-tick') {
      requireCronSecret(req);
      const { runDemoPartnerDailyTick } = await import('../_shared/demoPartnerDailyTick.ts');
      const result = await runDemoPartnerDailyTick(sb);
      return jsonResponse({ ok: true, ...result });
    }

    if (req.method === 'POST' && path === '/internal/run') {
      requireCronSecret(req);
      const body = await readJson<{ maxSweepJobs?: number; maxMonitor?: number }>(req).catch(
        () => ({} as { maxSweepJobs?: number; maxMonitor?: number }),
      );
      const result = await runTreasuryPipeline(sb, {
        maxSweepJobs: body.maxSweepJobs ?? 10,
        maxMonitor: body.maxMonitor ?? 20,
      });
      await replenishDepositPoolIfLow(sb).catch(() => {});
      return jsonResponse({ ok: true, ...result });
    }

    if (req.method === 'POST' && path === '/admin/bootstrap') {
      requireCronSecret(req);
      const boot = await ensureInfrastructureWallets(sb);
      let depositsHd = null;
      const warnings = [...(boot.warnings ?? [])];
      try {
        depositsHd = await ensureDepositsHdWallet(sb);
      } catch (e) {
        if (isTurnkeyConsensusError(e) || (e instanceof Error && e.message.includes('CONSENSUS_NEEDED'))) {
          warnings.push(e instanceof Error ? e.message : String(e));
        } else {
          throw e;
        }
      }
      return jsonResponse({ ok: true, ...boot, depositsHd, warnings });
    }

    if (req.method === 'POST' && path === '/admin/bootstrap-deposit-pool') {
      requireCronSecret(req);
      const body = await readJson<{ target?: number; batchSize?: number }>(req).catch(
        () => ({} as { target?: number; batchSize?: number }),
      );
      const result = await replenishDepositPool(sb, body);
      return jsonResponse({ ok: true, ...result });
    }

    if (req.method === 'POST' && path === '/admin/referrals/sync-onchain') {
      requireCronSecret(req);
      const result = await syncReferralBindingsFromChain(sb);
      return jsonResponse({ ok: true, ...result });
    }

    if (req.method === 'GET' && path === '/admin/turnkey/consensus-status') {
      requireCronSecret(req);
      if (!isTurnkeyConfigured()) throw new HttpError(503, 'Turnkey not configured');
      const diagnostics = await getConsensusDiagnostics();
      return jsonResponse({ ok: true, ...diagnostics });
    }

    if (req.method === 'POST' && path === '/admin/turnkey/approve-consensus') {
      requireCronSecret(req);
      if (!isTurnkeyConfigured()) throw new HttpError(503, 'Turnkey not configured');
      const result = await approveAllConsensusActivities();
      const diagnostics = await getConsensusDiagnostics().catch(() => null);
      return jsonResponse({ ok: true, ...result, diagnostics });
    }

    // V-01/F2: bind the acting wallet to the verified Privy JWT. Demo PoC routes
    // are allowed to use the seeded demo wallet only when demo mode is active
    // (which is OFF by default in production — see V-17).
    const wallet = await requireActorWallet(sb, req, { allowDemo: true });
    const demoMode = isDemoModeRequest(req);

    if (req.method === 'GET' && path === '/partner/state-proof') {
      const url = new URL(req.url);
      const date = url.searchParams.get('date');
      if (!date) throw new HttpError(400, 'date (YYYY-MM-DD) required');
      const proof = await getStateProof(sb, date, wallet);
      return jsonResponse({ ok: true, ...proof });
    }

    if (req.method === 'POST' && path === '/partner/yield-withdraw') {
      // Flash-swap released D3 -> USDT. Accepts amountD3 (preferred); amountUsdt kept
      // as a legacy alias (valued 1:1 as D3 quantity) until the client migrates.
      assertSettlementTokenSafe();
      const body = await readJson<{ amountD3?: number; amountUsdt?: number }>(req);
      const amountD3 = assertMoneyAmount(body.amountD3 ?? body.amountUsdt);
      const result = await requestPartnerYieldWithdraw(sb, wallet, amountD3, {
        demoMode: isYieldWithdrawDemoRequest(req),
      });
      return jsonResponse({ ok: true, ...result });
    }

    if (req.method === 'POST' && path === '/partner/sd3-transfer') {
      assertSettlementTokenSafe();
      const body = await readJson<{ toWallet: string; amountSd3: number }>(req);
      if (!body.toWallet?.trim()) throw new HttpError(400, 'toWallet required');
      const amountSd3 = assertMoneyAmount(body.amountSd3);
      const result = await transferPartnerSd3(sb, wallet, body.toWallet.trim(), amountSd3);
      return jsonResponse({ ok: true, ...result });
    }

    if (req.method === 'POST' && path === '/partner/sd3-stake') {
      assertSettlementTokenSafe();
      const body = await readJson<{ amountSd3: number }>(req);
      const amountSd3 = assertMoneyAmount(body.amountSd3);
      const result = await stakePartnerSd3(sb, wallet, amountSd3);
      return jsonResponse({ ok: true, ...result });
    }

    if (req.method === 'POST' && path === '/partner/join') {
      assertSettlementTokenSafe();
      const body = await readJson<{ amountUsdt?: number }>(req);
      const amount = assertMoneyAmount(body.amountUsdt ?? 5000);
      const intent = await createStakeIntent(sb, wallet, 'partner_join', amount);
      return jsonResponse(intent);
    }

    if (req.method === 'POST' && path === '/crowdfunding/stake-intent') {
      assertSettlementTokenSafe();
      const body = await readJson<{ amountUsdt: number }>(req);
      const amountUsdt = assertMoneyAmount(body.amountUsdt);
      const intent = await createStakeIntent(sb, wallet, 'crowdfund_stake', amountUsdt);
      return jsonResponse(intent);
    }

    if (req.method === 'GET' && path === '/deposit/status') {
      const intentId = new URL(req.url).searchParams.get('intent_id');
      if (!intentId) throw new HttpError(400, 'intent_id required');
      const status = await getDepositStatus(sb, wallet, intentId);
      return jsonResponse(status);
    }

    if (req.method === 'GET' && path === '/deposit/address') {
      const intentId = new URL(req.url).searchParams.get('intent_id');
      if (!intentId) throw new HttpError(400, 'intent_id required');
      const status = await getDepositStatus(sb, wallet, intentId);
      return jsonResponse(status);
    }

    if (req.method === 'POST' && path === '/deposit/report-tx') {
      const body = await readJson<{ intentId: string; txHash: string }>(req);
      if (!body.intentId || !body.txHash) throw new HttpError(400, 'intentId and txHash required');
      const status = await reportDepositTx(sb, wallet, body.intentId, body.txHash);
      return jsonResponse(status);
    }

    if (req.method === 'POST' && path === '/deposit/demo-credit' && demoMode) {
      const body = await readJson<{ intentId: string }>(req);
      if (!body.intentId) throw new HttpError(400, 'intentId required');
      const status = await creditDepositDemo(sb, wallet, body.intentId);
      return jsonResponse(status);
    }

    throw new HttpError(404, 'Not found');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: message, credited: false }, status);
  }
});

export { isIntentCredited };
