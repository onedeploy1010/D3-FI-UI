import { isSupabaseClientConfigured, supabaseAnonKey, supabaseUrl } from './supabase';

export type PartnerTreasury = {
  treasuryAddress: string;
  shortAddress: string;
  labelZh: string;
  labelEn: string;
  threshold: number;
  totalSigners: number;
  privyWalletId: string | null;
  multisigType: 'partner';
};

export async function fetchPartnerTreasury(): Promise<PartnerTreasury> {
  if (!isSupabaseClientConfigured || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('Backend service not configured');
  }
  const res = await fetch(`${supabaseUrl}/functions/v1/partner/treasury`, {
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return body as PartnerTreasury;
}
