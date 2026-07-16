import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { BSC_USDT_CONTRACT, BSC_USDT_DECIMALS } from './tokens.ts';
import { getErc20Balance } from './turnkey.ts';
import { getFlashSwapWallet, getTreasuryWallet } from './wallets.ts';
import { getD3PriceUsdt } from './d3Price.ts';

type Sb = SupabaseClient;

function solvencyMinRatio(): number {
  const raw = Deno.env.get('SOLVENCY_MIN_RATIO');
  const n = raw ? Number(raw) : 1.0;
  return Number.isFinite(n) && n > 0 ? n : 1.0;
}

function fromWei(wei: bigint): number {
  return Number(wei) / 10 ** BSC_USDT_DECIMALS;
}

/** Sum a numeric column across all partner_accounts (paginated). */
async function sumColumn(sb: Sb, column: string): Promise<number> {
  let total = 0;
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await sb
      .from('partner_accounts')
      .select(column)
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) total += Number((r as Record<string, unknown>)[column] ?? 0);
    if (data.length < page) break;
    from += page;
  }
  return Math.round(total * 1e6) / 1e6;
}

export type SolvencyReport = {
  d3Price: number;
  pendingD3: number;
  liabilityUsdt: number; // pendingD3 valued at current price — what users could flash-swap now
  flashSwapReserveUsdt: number;
  treasuryReserveUsdt: number;
  ratio: number; // flash-swap reserve / liability
  ratioWithTreasury: number;
  minRatio: number;
  healthy: boolean;
  warning: string | null;
};

/**
 * Flash-swap solvency: the only real USDT liability is released-but-unswapped D3
 * (pending_d3_yield) valued at the current D3 price. Compare against the flash-swap
 * wallet's on-chain USDT balance (+ treasury as a secondary backstop).
 */
export async function computeSolvency(sb: Sb): Promise<SolvencyReport> {
  const [d3Price, pendingD3, flashWallet, treasuryWallet] = await Promise.all([
    getD3PriceUsdt(sb),
    sumColumn(sb, 'pending_d3_yield'),
    getFlashSwapWallet(sb),
    getTreasuryWallet(sb),
  ]);

  const liabilityUsdt = Math.round(pendingD3 * d3Price * 1e6) / 1e6;

  const [flashBal, treasuryBal] = await Promise.all([
    flashWallet ? getErc20Balance(BSC_USDT_CONTRACT, flashWallet.address) : Promise.resolve(0n),
    treasuryWallet ? getErc20Balance(BSC_USDT_CONTRACT, treasuryWallet.address) : Promise.resolve(0n),
  ]);
  const flashSwapReserveUsdt = fromWei(flashBal);
  const treasuryReserveUsdt = fromWei(treasuryBal);

  const ratio = liabilityUsdt > 0 ? flashSwapReserveUsdt / liabilityUsdt : Infinity;
  const ratioWithTreasury =
    liabilityUsdt > 0 ? (flashSwapReserveUsdt + treasuryReserveUsdt) / liabilityUsdt : Infinity;

  const minRatio = solvencyMinRatio();
  const healthy = ratio >= minRatio;
  const warning = healthy
    ? null
    : `Flash-swap reserve ${flashSwapReserveUsdt.toFixed(2)} USDT covers only ${(ratio * 100).toFixed(1)}% of ${liabilityUsdt.toFixed(2)} USDT liability (min ${(minRatio * 100).toFixed(0)}%). Top up the flash-swap wallet.`;

  return {
    d3Price,
    pendingD3,
    liabilityUsdt,
    flashSwapReserveUsdt,
    treasuryReserveUsdt,
    ratio: ratio === Infinity ? -1 : Math.round(ratio * 10000) / 10000,
    ratioWithTreasury: ratioWithTreasury === Infinity ? -1 : Math.round(ratioWithTreasury * 10000) / 10000,
    minRatio,
    healthy,
    warning,
  };
}
