import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', '.env') });

const PROJECT_REF = 'gvyvdnegsxiykxffddwb';
const DEMO = '0x1234567890AbCdEf1234567890AbCdEf12345678';

async function runSql(token: string, query: string, label: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    console.error(`${label} failed:`, res.status, await res.text());
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!token || !url || !key) {
    console.error('Missing SUPABASE_ACCESS_TOKEN, SUPABASE_URL, or SUPABASE_SECRET_KEY');
    process.exit(1);
  }

  const migration = fs.readFileSync(
    path.resolve(__dirname, '..', 'supabase/migrations/004_poc_scores.sql'),
    'utf-8',
  );
  await runSql(token, migration, 'migration 004_poc_scores');

  const query = `
insert into public.poc_scores (
  wallet_address, epoch_label, level_label, composite_score, level_diff_rate,
  diff_floor_pct, diff_ceil_pct,
  dim_h, dim_c, dim_a, dim_r, dim_e,
  raw_h_zh, raw_h_en, raw_c_zh, raw_c_en, raw_a_zh, raw_a_en,
  raw_r_zh, raw_r_en, raw_e_zh, raw_e_en, settled_at
)
select
  p.wallet_address, '#42', 'V5', 78.4, 28.6, 16, 38,
  72, 85, 68, 91, 56,
  '质押 D3 价值 $3,200', 'Staked D3 value $3,200',
  '大区+小区总业绩 $556,400', 'Large+small area $556,400',
  '30天新增 $42,000', '30d new deposits $42,000',
  '续投+未提现比例 91%', 'Renewal + unwithdrawn 91%',
  '新增有效户 12 (≥100U)', '12 new valid (≥100U)',
  '2026-07-06'::timestamptz
from public.profiles p
where lower(p.wallet_address) = lower('${DEMO}')
on conflict (wallet_address) do update set
  composite_score = excluded.composite_score,
  level_diff_rate = excluded.level_diff_rate,
  epoch_label = excluded.epoch_label,
  level_label = excluded.level_label,
  diff_floor_pct = excluded.diff_floor_pct,
  diff_ceil_pct = excluded.diff_ceil_pct,
  dim_h = excluded.dim_h,
  dim_c = excluded.dim_c,
  dim_a = excluded.dim_a,
  dim_r = excluded.dim_r,
  dim_e = excluded.dim_e,
  raw_h_zh = excluded.raw_h_zh,
  raw_h_en = excluded.raw_h_en,
  raw_c_zh = excluded.raw_c_zh,
  raw_c_en = excluded.raw_c_en,
  raw_a_zh = excluded.raw_a_zh,
  raw_a_en = excluded.raw_a_en,
  raw_r_zh = excluded.raw_r_zh,
  raw_r_en = excluded.raw_r_en,
  raw_e_zh = excluded.raw_e_zh,
  raw_e_en = excluded.raw_e_en,
  settled_at = excluded.settled_at,
  updated_at = now();
`;

  await runSql(token, query, 'demo poc_scores upsert');

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from('poc_scores')
    .select('wallet_address, composite_score, level_label, level_diff_rate, dim_h, dim_c')
    .ilike('wallet_address', DEMO.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error('verify error:', error.message);
    process.exit(1);
  }
  console.log('verify:', data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
