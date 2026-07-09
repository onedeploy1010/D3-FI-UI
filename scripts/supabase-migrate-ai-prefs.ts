import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', '.env') });

const PROJECT_REF = 'gvyvdnegsxiykxffddwb';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const sql = fs.readFileSync(
  path.resolve(__dirname, '..', 'supabase/migrations/003_ai_preferences.sql'),
  'utf-8',
);

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});

if (!res.ok) {
  console.error('Failed:', res.status, await res.text());
  process.exit(1);
}
console.log('✓ 003_ai_preferences.sql');
