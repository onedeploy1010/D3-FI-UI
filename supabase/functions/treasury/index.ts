import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { isDemoModeRequest } from '../_shared/demo.ts';
import {
  createStakeIntent,
  creditDepositDemo,
  getDepositStatus,
  isIntentCredited,
  reportDepositTx,
} from '../_shared/deposit.ts';
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
import { HttpError, requireWallet } from '../_shared/wallet.ts';

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

function requireCronSecret(req: Request): void {
  const secret = Deno.env.get('TREASURY_CRON_SECRET');
  if (!secret) throw new HttpError(503, 'TREASURY_CRON_SECRET not configured');
  const header = req.headers.get('X-Treasury-Cron-Secret');
  if (header !== secret) throw new HttpError(401, 'Unauthorized');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const path = routePath(req);
  const sb = getSupabaseAdmin();

  try {
    if (req.method === 'GET' && path === '/health') {
      const summary = await getInfrastructureSummary(sb).catch(() => null);
      const depositPool = await getDepositPoolStats(sb).catch(() => null);
      return jsonResponse({
        ok: true,
        service: 'treasury',
        turnkey: isTurnkeyConfigured(),
        treasuryAddress: treasuryAddressFromEnv() ? 'configured' : 'missing',
        treasuryWalletId: treasuryWalletIdFromEnv() ? 'configured' : 'missing',
        infrastructure: summary,
        depositPool,
      });
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

    const wallet = requireWallet(req);
    const demoMode = isDemoModeRequest(req);

    if (req.method === 'POST' && path === '/partner/join') {
      const body = await readJson<{ amountUsdt?: number }>(req);
      const amount = body.amountUsdt ?? 1;
      const intent = await createStakeIntent(sb, wallet, 'partner_join', amount);
      return jsonResponse(intent);
    }

    if (req.method === 'POST' && path === '/crowdfunding/stake-intent') {
      const body = await readJson<{ amountUsdt: number }>(req);
      if (!body.amountUsdt || body.amountUsdt <= 0) {
        throw new HttpError(400, 'amountUsdt required');
      }
      const intent = await createStakeIntent(sb, wallet, 'crowdfund_stake', body.amountUsdt);
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
