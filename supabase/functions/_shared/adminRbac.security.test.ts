import { describe, it, expect } from 'vitest';
import {
  PERMISSION_CATALOG,
  ALL_PERMISSION_KEYS,
  READ_PERMISSION_KEYS,
  ELEVATED_PERMISSIONS,
  ROLE_PRESETS,
  permissionsForRole,
  grantedPermissionsForPatch,
  assertCanManageAdmin,
  isValidRole,
  isValidPermissionKey,
  type AdminProfile,
} from './adminAuth.ts';

// Capture the HttpError thrown by a synchronous guard call, or null when allowed.
function grab(fn: () => void): { status: number; message: string } | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e as { status: number; message: string };
  }
}

const superadmin: AdminProfile = { userId: 'sa', username: 'sa', role: 'superadmin', permissions: [] };
const manager: AdminProfile = {
  userId: 'mgr',
  username: 'mgr',
  // A non-superadmin who holds admins.manage but NOT the elevated grants.
  role: 'admin',
  permissions: ['admins.read', 'admins.manage', 'members.read', 'members.write'],
};

describe('permission catalog completeness', () => {
  it('every catalog entry has key/label/group and keys are unique', () => {
    expect(PERMISSION_CATALOG.length).toBeGreaterThanOrEqual(15);
    const keys = new Set<string>();
    for (const p of PERMISSION_CATALOG) {
      expect(typeof p.key).toBe('string');
      expect(p.key.length).toBeGreaterThan(0);
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
      expect(typeof p.group).toBe('string');
      expect(p.group.length).toBeGreaterThan(0);
      expect(keys.has(p.key)).toBe(false);
      keys.add(p.key);
    }
  });

  it('contains every documented permission key', () => {
    const expected = [
      'dashboard.read',
      'members.read',
      'members.write',
      'stakes.read',
      'transactions.read',
      'referrals.read',
      'partners.read',
      'subsidies.read',
      'subsidies.write',
      'security.read',
      'security.write',
      'treasury.read',
      'treasury.write',
      'admins.read',
      'admins.manage',
    ];
    for (const k of expected) expect(ALL_PERMISSION_KEYS).toContain(k);
    expect(ALL_PERMISSION_KEYS).toHaveLength(expected.length);
  });

  it('isValidPermissionKey accepts catalog keys and rejects unknowns', () => {
    expect(isValidPermissionKey('treasury.write')).toBe(true);
    expect(isValidPermissionKey('nope.write')).toBe(false);
  });

  it('READ_PERMISSION_KEYS is exactly the .read keys', () => {
    expect(READ_PERMISSION_KEYS.every((k) => k.endsWith('.read'))).toBe(true);
    expect(READ_PERMISSION_KEYS).toEqual(ALL_PERMISSION_KEYS.filter((k) => k.endsWith('.read')));
  });
});

describe('role preset expansion (permissionsForRole)', () => {
  it('superadmin expands to every permission', () => {
    expect(permissionsForRole('superadmin')).toEqual([...ALL_PERMISSION_KEYS]);
  });

  it('admin gets everything EXCEPT admins.manage and treasury.write', () => {
    const admin = permissionsForRole('admin');
    expect(admin).not.toContain('admins.manage');
    expect(admin).not.toContain('treasury.write');
    expect(admin).toContain('members.write');
    expect(admin).toContain('security.write');
    expect(admin).toContain('admins.read');
    expect(admin).toEqual(ALL_PERMISSION_KEYS.filter((k) => !ELEVATED_PERMISSIONS.includes(k)));
  });

  it('finance = treasury.* + transactions.read + security.read (+dashboard)', () => {
    const finance = permissionsForRole('finance');
    expect(finance).toContain('treasury.read');
    expect(finance).toContain('treasury.write');
    expect(finance).toContain('transactions.read');
    expect(finance).toContain('security.read');
    expect(finance).not.toContain('members.write');
    expect(finance).not.toContain('admins.manage');
  });

  it('support = reads (no admins.read) + subsidies.write', () => {
    const support = permissionsForRole('support');
    expect(support).toContain('subsidies.write');
    expect(support).toContain('members.read');
    expect(support).not.toContain('admins.read');
    expect(support).not.toContain('members.write');
    expect(support).not.toContain('treasury.write');
  });

  it('auditor = every .read permission and nothing writable', () => {
    const auditor = permissionsForRole('auditor');
    expect(auditor).toEqual([...READ_PERMISSION_KEYS]);
    expect(auditor.every((k) => k.endsWith('.read'))).toBe(true);
  });

  it('unknown role expands to empty', () => {
    expect(permissionsForRole('ghost')).toEqual([]);
  });

  it('ROLE_PRESETS align with permissionsForRole and isValidRole', () => {
    for (const preset of ROLE_PRESETS) {
      expect(preset.permissions).toEqual(permissionsForRole(preset.key));
      expect(isValidRole(preset.key)).toBe(true);
    }
    expect(isValidRole('nope')).toBe(false);
  });
});

describe('grantedPermissionsForPatch', () => {
  it('explicit permissions win over role', () => {
    expect(grantedPermissionsForPatch({ role: 'admin', permissions: ['members.read'] })).toEqual([
      'members.read',
    ]);
  });
  it('role-only expands to the preset', () => {
    expect(grantedPermissionsForPatch({ role: 'auditor' })).toEqual(permissionsForRole('auditor'));
  });
  it('empty patch grants nothing', () => {
    expect(grantedPermissionsForPatch({})).toEqual([]);
  });
});

describe('assertCanManageAdmin — privilege-escalation guard', () => {
  it('non-superadmin granting role=superadmin is rejected (403)', () => {
    const err = grab(() => assertCanManageAdmin(manager, 'target', { role: 'superadmin' }));
    expect(err?.status).toBe(403);
  });

  it('non-superadmin granting treasury.write directly is rejected (403)', () => {
    const err = grab(() =>
      assertCanManageAdmin(manager, 'target', { permissions: ['members.read', 'treasury.write'] }),
    );
    expect(err?.status).toBe(403);
  });

  it('non-superadmin granting admins.manage directly is rejected (403)', () => {
    const err = grab(() => assertCanManageAdmin(manager, 'target', { permissions: ['admins.manage'] }));
    expect(err?.status).toBe(403);
  });

  it('non-superadmin granting a role preset that contains treasury.write (finance) is rejected', () => {
    const err = grab(() => assertCanManageAdmin(manager, 'target', { role: 'finance' }));
    expect(err?.status).toBe(403);
  });

  it('superadmin may grant superadmin / treasury.write / admins.manage', () => {
    expect(grab(() => assertCanManageAdmin(superadmin, 'target', { role: 'superadmin' }))).toBeNull();
    expect(
      grab(() => assertCanManageAdmin(superadmin, 'target', { permissions: ['treasury.write', 'admins.manage'] })),
    ).toBeNull();
    expect(grab(() => assertCanManageAdmin(superadmin, 'target', { role: 'finance' }))).toBeNull();
  });

  it('non-superadmin may grant a non-elevated role (auditor) to another admin', () => {
    expect(grab(() => assertCanManageAdmin(manager, 'target', { role: 'auditor' }))).toBeNull();
  });

  it('non-superadmin may set explicit non-elevated permissions on another admin', () => {
    expect(
      grab(() => assertCanManageAdmin(manager, 'target', { permissions: ['members.read', 'stakes.read'] })),
    ).toBeNull();
  });
});

describe('assertCanManageAdmin — no self-escalation', () => {
  it('rejects a non-superadmin adding a permission they do not already hold to themselves', () => {
    // Non-elevated new grant so rule 1 (elevated guard) does not pre-empt the
    // self-escalation check: manager holds members.read/write but not subsidies.write.
    const err = grab(() =>
      assertCanManageAdmin(manager, manager.userId, {
        permissions: ['members.read', 'members.write', 'subsidies.write'],
      }),
    );
    expect(err?.status).toBe(403);
    expect(err?.message).toContain('subsidies.write');
  });

  it('rejects a non-superadmin escalating their own role (which adds new perms)', () => {
    // manager's role is admin; setting themselves to admin preset would add perms
    // (e.g. security.write) they do not currently hold → rejected.
    const err = grab(() => assertCanManageAdmin(manager, manager.userId, { role: 'admin' }));
    expect(err?.status).toBe(403);
  });

  it('rejects a non-superadmin escalating own role to superadmin', () => {
    const err = grab(() => assertCanManageAdmin(manager, manager.userId, { role: 'superadmin' }));
    expect(err?.status).toBe(403);
  });

  it('allows a non-superadmin to REDUCE their own permissions (subset, no new grants)', () => {
    expect(
      grab(() => assertCanManageAdmin(manager, manager.userId, { permissions: ['members.read'] })),
    ).toBeNull();
  });

  it('a superadmin editing their own row is never blocked by the self-guard', () => {
    expect(
      grab(() => assertCanManageAdmin(superadmin, superadmin.userId, { permissions: ['members.read'] })),
    ).toBeNull();
  });
});
