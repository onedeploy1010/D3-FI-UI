import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './wallet.ts';

// Expanded RBAC role set. The original three (superadmin/admin/support) are kept
// for back-compat; `finance` and `auditor` are added by the RBAC redesign;
// `super_partner` (项目方/超级合伙人) is the fund-authority identity used by the
// standalone multisig system. Migration 051/052 relax the admin_users.role CHECK
// constraint to match this union.
export type AdminRole = 'superadmin' | 'admin' | 'finance' | 'support' | 'auditor' | 'super_partner';

export type AdminProfile = {
  userId: string;
  username: string;
  role: AdminRole;
  permissions: string[];
};

// ── RBAC: granular permission catalog ────────────────────────────────────────
// Single source of truth consumed by GET /permissions and every route guard.
// {key,label,group} — group is the Chinese UI section the permission belongs to.
export type PermissionDef = { key: string; label: string; group: string };

export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  { key: 'dashboard.read', label: '查看仪表盘', group: '概览' },
  { key: 'members.read', label: '查看会员', group: '会员' },
  { key: 'members.write', label: '管理会员', group: '会员' },
  { key: 'stakes.read', label: '查看质押', group: '质押' },
  { key: 'transactions.read', label: '查看交易', group: '交易' },
  { key: 'referrals.read', label: '查看推荐', group: '推荐' },
  { key: 'partners.read', label: '查看合伙人', group: '推荐' },
  { key: 'subsidies.read', label: '查看补贴', group: '补贴' },
  { key: 'subsidies.write', label: '管理补贴', group: '补贴' },
  { key: 'subsidies.rates', label: '修改补贴比例', group: '补贴' },
  { key: 'security.read', label: '查看安全', group: '安全' },
  { key: 'security.write', label: '管理安全', group: '安全' },
  { key: 'params.read', label: '查看参数', group: '参数' },
  { key: 'params.write', label: '管理参数', group: '参数' },
  { key: 'treasury.read', label: '查看金库', group: '金库' },
  { key: 'treasury.write', label: '管理金库', group: '金库' },
  { key: 'admins.read', label: '查看管理员', group: '管理员' },
  { key: 'admins.manage', label: '管理管理员', group: '管理员' },
  { key: 'logs.read', label: '查看操作日志', group: '日志' },
] as const;

export const ALL_PERMISSION_KEYS: readonly string[] = PERMISSION_CATALOG.map((p) => p.key);

// Read-only subset (every `.read` permission) — the auditor preset and the
// baseline for support.
export const READ_PERMISSION_KEYS: readonly string[] = ALL_PERMISSION_KEYS.filter((k) =>
  k.endsWith('.read'),
);

// Privilege-escalating permissions. Granting any of these (directly OR via a role
// preset that contains one) requires the CALLER to be a superadmin.
export const ELEVATED_PERMISSIONS: readonly string[] = ['admins.manage', 'treasury.write'];

export function isValidPermissionKey(key: string): boolean {
  return ALL_PERMISSION_KEYS.includes(key);
}

// ── RBAC: role presets ───────────────────────────────────────────────────────
// permissionsForRole() expands a role to its default permission set. superadmin
// bypasses adminHasPermission entirely, but we still return the full set so the
// UI can render its effective grants.
export function permissionsForRole(role: string): string[] {
  switch (role) {
    case 'superadmin':
      return [...ALL_PERMISSION_KEYS];
    case 'admin':
      // Most read + some write, but NOT admins.manage or treasury.write.
      return ALL_PERMISSION_KEYS.filter((k) => !ELEVATED_PERMISSIONS.includes(k));
    case 'finance':
      // treasury.* + transactions.read + security.read (+ dashboard baseline).
      return ['dashboard.read', 'transactions.read', 'security.read', 'treasury.read', 'treasury.write'];
    case 'support':
      // All reads (except admins.read) + subsidies.write.
      return [
        ...READ_PERMISSION_KEYS.filter((k) => k !== 'admins.read'),
        'subsidies.write',
      ];
    case 'auditor':
      // Every read permission, nothing writable.
      return [...READ_PERMISSION_KEYS];
    case 'super_partner':
      // 项目方/超级合伙人 — fund authority for the standalone multisig system:
      // view wallets + propose treasury transfers + view fellow super-partners.
      // treasury.write makes this an ELEVATED preset, so only a superadmin may
      // create a super_partner.
      return [
        'dashboard.read',
        'treasury.read',
        'treasury.write',
        'transactions.read',
        'security.read',
        'admins.read',
      ];
    default:
      return [];
  }
}

export type RoleDef = { key: AdminRole; label: string; permissions: string[] };

export const ROLE_PRESETS: readonly RoleDef[] = [
  { key: 'superadmin', label: '超级管理员', permissions: permissionsForRole('superadmin') },
  { key: 'admin', label: '管理员', permissions: permissionsForRole('admin') },
  { key: 'finance', label: '财务', permissions: permissionsForRole('finance') },
  { key: 'support', label: '客服', permissions: permissionsForRole('support') },
  { key: 'auditor', label: '审计员', permissions: permissionsForRole('auditor') },
  { key: 'super_partner', label: '超级合伙人', permissions: permissionsForRole('super_partner') },
] as const;

export const VALID_ROLES: readonly AdminRole[] = ROLE_PRESETS.map((r) => r.key);

export function isValidRole(role: string): role is AdminRole {
  return (VALID_ROLES as readonly string[]).includes(role);
}

// ── RBAC: admin-management escalation guard ──────────────────────────────────
export type AdminPatch = { role?: string; permissions?: string[] };

// The permission set a patch would GRANT to the target: explicit permissions win;
// otherwise the role preset is expanded; an empty patch grants nothing new.
export function grantedPermissionsForPatch(patch: AdminPatch): string[] {
  if (Array.isArray(patch.permissions)) return patch.permissions;
  if (patch.role) return permissionsForRole(patch.role);
  return [];
}

/**
 * Privilege-escalation guard for admin management (PATCH /admins/:id).
 *
 * Rules (throws HttpError(403) on violation, returns void when allowed):
 *  1. Granting role='superadmin' OR any ELEVATED permission (admins.manage,
 *     treasury.write) — whether directly or via a role preset — requires the
 *     CALLER to be a superadmin.
 *  2. No self-escalation: a non-superadmin editing their OWN row may not add any
 *     permission they do not already hold, nor set role='superadmin'.
 *
 * A superadmin caller bypasses both checks (they already hold every privilege).
 * Exported and pure so it is unit-testable without a DB.
 */
export function assertCanManageAdmin(
  caller: AdminProfile,
  targetUserId: string,
  patch: AdminPatch,
): void {
  const granting = grantedPermissionsForPatch(patch);
  const grantsSuperadminRole = patch.role === 'superadmin';
  const grantsElevated =
    grantsSuperadminRole || granting.some((p) => ELEVATED_PERMISSIONS.includes(p));

  // Rule 1: only a superadmin may hand out superadmin / elevated permissions.
  if (grantsElevated && caller.role !== 'superadmin') {
    throw new HttpError(
      403,
      'Only a superadmin may grant superadmin, admins.manage or treasury.write',
    );
  }

  // A superadmin caller is fully trusted from here on (cannot self-escalate past
  // "all"). Non-superadmins are held to the no-self-escalation rule.
  if (caller.role === 'superadmin') return;

  if (targetUserId === caller.userId) {
    if (grantsSuperadminRole) {
      throw new HttpError(403, 'Cannot escalate your own role to superadmin');
    }
    const added = granting.filter((p) => !caller.permissions.includes(p));
    if (added.length > 0) {
      throw new HttpError(
        403,
        `Cannot escalate your own permissions: ${added.join(', ')}`,
      );
    }
  }
}

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
