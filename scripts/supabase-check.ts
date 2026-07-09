import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', '.env') });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await sb.from('profiles').select('wallet_address').limit(1);

if (error) {
  if (
    error.message.includes('does not exist') ||
    error.message.includes('schema cache') ||
    error.code === '42P01' ||
    error.code === 'PGRST205'
  ) {
    console.log('Connected to Supabase, but tables not created yet.');
    console.log('Run supabase/migrations/001_d3_union_schema.sql in SQL Editor.');
    process.exit(2);
  }
  console.error('Supabase error:', error.message);
  process.exit(1);
}

console.log('Supabase OK — profiles table reachable', data);
