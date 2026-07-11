import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './wallet.ts';

export type AdminProfile = {
  userId: string;
  username: string;
  role: 'superadmin' | 'admin' | 'support';
  permissions: string[];
};

export async function requireAdminUser(
  sb: SupabaseClient,
  req: Request,
): Promise<AdminProfile> {
  const authHeader = req.headers.get('Authorization')?.trim();
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Authorization Bearer token required');
  }
  const token = authHeader.slice('Bearer '.length);
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData.user) {
    throw new HttpError(401, 'Invalid or expired session');
  }

  const { data: row, error } = await sb
    .from('admin_users')
    .select('username, role, permissions')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!row) throw new HttpError(403, 'Not an admin user');

  return {
    userId: userData.user.id,
    username: row.username as string,
    role: row.role as AdminProfile['role'],
    permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : [],
  };
}

export function adminHasPermission(admin: AdminProfile, key: string): boolean {
  if (admin.role === 'superadmin') return true;
  return admin.permissions.includes(key);
}
