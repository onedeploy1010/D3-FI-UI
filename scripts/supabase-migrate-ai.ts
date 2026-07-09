import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', '.env') });

const PROJECT_REF = 'gvyvdnegsxiykxffddwb';
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in .env');
  process.exit(1);
}

async function runSql(label: string, sql: string) {
  console.log(`Running ${label}...`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Failed ${label}:`, res.status, text);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

const unionMigration = fs.readFileSync(
  path.resolve(__dirname, '..', 'supabase/migrations/001_d3_union_schema.sql'),
  'utf-8',
);
const migration = fs.readFileSync(
  path.resolve(__dirname, '..', 'supabase/migrations/002_d3_ai_schema.sql'),
  'utf-8',
);
const seed = fs.readFileSync(path.resolve(__dirname, '..', 'supabase/seed_ai.sql'), 'utf-8');

await runSql('001_d3_union_schema.sql', unionMigration);
await runSql('002_d3_ai_schema.sql', migration);
await runSql('seed_ai.sql', seed);
console.log('AI schema migration complete.');
