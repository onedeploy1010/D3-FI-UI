/**
 * Seed the 超级合伙人 (super_partner) accounts for the multisig system.
 *
 * For each email it ensures a Supabase Auth user exists (creates one if missing)
 * and upserts an `admin_users` row with role = 'super_partner'. These are the same
 * people who hold the Turnkey root-quorum seats — so app-level identity lines up
 * with the on-chain signers.
 *
 * SAFE: dry-run by default. Pass `-- --execute` to apply. New auth users are
 * created email-confirmed with a temporary password (`--password`) that each
 * super-partner should change on first login.
 *
 * Usage:
 *   # dry-run — prints what it would do
 *   tsx scripts/multisig-seed-super-partners.ts -- \
 *     --email a@gmail.com --email b@gmail.com --email c@gmail.com --email d@gmail.com
 *
 *   # apply (creates missing auth users with the temp password + sets super_partner)
 *   tsx scripts/multisig-seed-super-partners.ts -- \
 *     --email a@gmail.com --email b@gmail.com --email c@gmail.com --email d@gmail.com \
 *     --password 'TempPass#2026' --execute
 *
 *   # emails may also come from env (comma-separated):
 *   SUPER_PARTNER_EMAILS='a@x,b@y' tsx scripts/multisig-seed-super-partners.ts -- --execute
 *
 * Env (.env): SUPABASE_URL, SUPABASE_SECRET_KEY (service-role).
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', '.env') });

const execute = process.argv.includes('--execute');

function argValues(flag: string): string[] {
  const out: string[] = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1]) out.push(argv[i + 1]);
  }
  return out;
}
function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) die('Missing SUPABASE_URL / SUPABASE_SECRET_KEY in .env');

const emails = [
  ...argValues('--email'),
  ...(process.env.SUPER_PARTNER_EMAILS?.split(',') ?? []),
]
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

if (emails.length === 0) {
  die('No emails. Pass --email <addr> (repeatable) or SUPER_PARTNER_EMAILS=a,b,c');
}

const tempPassword = argValue('--password');

// super_partner permission preset (mirror _shared/adminAuth.ts).
const SUPER_PARTNER_PERMS = ['dashboard.read', 'treasury.read', 'treasury.write', 'transactions.read', 'security.read'];

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  // Paginate listUsers (no direct getByEmail in supabase-js admin API).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) die(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit) return { id: hit.id };
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  console.log(`\n=== multisig super_partner seed ${execute ? '(EXECUTE)' : '(dry-run)'} ===`);
  console.log(`Emails (${emails.length}): ${emails.join(', ')}`);
  console.log(`Role: super_partner · Perms: ${SUPER_PARTNER_PERMS.join(', ')}\n`);

  for (const email of emails) {
    const existing = await findAuthUserByEmail(email);
    const username = email.split('@')[0];

    if (!existing && !execute) {
      console.log(`  ${email}: would CREATE auth user + super_partner admin_users row`);
      continue;
    }
    if (existing && !execute) {
      console.log(`  ${email}: auth user exists (${existing.id}) → would set role=super_partner`);
      continue;
    }

    // EXECUTE
    let userId = existing?.id;
    if (!userId) {
      if (!tempPassword) die(`Creating ${email} needs --password <temp> (they change it on first login)`);
      const { data, error } = await sb.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });
      if (error) {
        console.error(`  ${email}: createUser FAILED: ${error.message}`);
        continue;
      }
      userId = data.user.id;
      console.log(`  ${email}: created auth user ${userId}`);
    }

    const { error: upErr } = await sb.from('admin_users').upsert(
      { user_id: userId, username, role: 'super_partner', permissions: SUPER_PARTNER_PERMS },
      { onConflict: 'user_id' },
    );
    if (upErr) {
      console.error(`  ${email}: admin_users upsert FAILED: ${upErr.message}`);
      continue;
    }
    console.log(`  ${email}: ✓ super_partner set`);
  }

  console.log(`\n${execute ? 'Done.' : 'Dry-run only. Re-run with `-- --execute` (and --password for new users).'}`);
}

main().catch((e) => die(String(e?.stack || e)));
