import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { DEMO_WALLET_ADDRESS } from './demo.ts';

type Sb = SupabaseClient;

const DEMO_WALLET = DEMO_WALLET_ADDRESS;
const DEMO_SPONSOR = '0xabcdef1234567890abcdef1234567890abcdef01';

const DEMO_SETTLED_UD3 = 4960;

/** Restore demo line-leader to fresh entry: settled UD3 + team perf, no partner/stakes/transfers. */
export async function resetDemoPartnerSession(sb: Sb): Promise<{ ok: true }> {
  const { data: allIntents } = await sb
    .from('stake_intents')
    .select('id')
    .ilike('wallet_address', DEMO_WALLET);

  const intentIds = (allIntents ?? []).map((row) => row.id as string);

  if (intentIds.length) {
    await sb.from('partner_stake_positions').delete().in('intent_id', intentIds);
    await sb.from('deposit_records').delete().in('intent_id', intentIds);
    await sb.from('stake_intents').delete().in('id', intentIds);
  }

  const { data: orphanPositions } = await sb
    .from('partner_stake_positions')
    .select('id')
    .ilike('wallet_address', DEMO_WALLET);

  const orphanIds = (orphanPositions ?? []).map((row) => row.id as string);
  if (orphanIds.length) {
    await sb.from('partner_stake_positions').delete().in('id', orphanIds);
  }

  await sb.from('partner_yield_withdrawals').delete().ilike('wallet_address', DEMO_WALLET);
  await sb.from('partner_ud3_transfers').delete().ilike('from_wallet', DEMO_WALLET);

  await sb.from('partner_accounts').upsert(
    {
      wallet_address: DEMO_WALLET,
      is_partner: false,
      ud3_balance: DEMO_SETTLED_UD3,
      lifetime_ud3_earned: DEMO_SETTLED_UD3,
      pending_d3_yield: 0,
      lifetime_d3_yield: 0,
      lifetime_usdt_yield: 0,
      pending_usdt_yield: 0,
      joined_at: null,
      market_leader_status: 'approved',
    },
    { onConflict: 'wallet_address' },
  );

  await sb
    .from('referrals')
    .update({ performance_weight: 6500 })
    .ilike('wallet_address', DEMO_WALLET)
    .ilike('sponsor_wallet_address', DEMO_SPONSOR);

  try {
    const { resetDemoPartnerSimState } = await import('./demoPartnerDailyTick.ts');
    await resetDemoPartnerSimState(sb);
  } catch (e) {
    console.warn('[demo-reset] sim state reset skipped:', e instanceof Error ? e.message : e);
  }

  return { ok: true };
}
