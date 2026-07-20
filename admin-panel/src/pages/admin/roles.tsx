import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pencil, RotateCw, ShieldAlert, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { PageShell } from './page-shell';
import { DataList, type DataListColumn, type DataListFilter } from '@/components/data-list';
import {
  adminFetch,
  listAdmins,
  updateAdmin,
  type AdminRole,
  type AdminUser,
  type PermissionDef,
} from '@/lib/adminApi';
import { useAdminAuth } from '@/contexts/admin-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Roles & permissions (角色权限). The permissions catalog endpoint returns the
 * full permission catalog *and* the named-role presets — a richer shape than the
 * stale `{ rows }` type on `listPermissions()`, so we call `adminFetch` directly
 * with the documented contract type. CREATE / DELETE admin have no adminApi
 * helper yet, so those also go through `adminFetch` inline.
 */

type RoleDef = { key: string; label: string; permissions: string[] };
type PermissionsCatalog = { permissions: PermissionDef[]; roles: RoleDef[] };

/** Perms that (plus the superadmin role) require the CALLER to be superadmin. */
const ELEVATED_PERMS = new Set(['admins.manage', 'treasury.write']);

const ROLE_LABEL_FALLBACK: Record<string, string> = {
  superadmin: '超级管理员',
  admin: '管理员',
  finance: '财务',
  support: '客服',
  auditor: '审计',
  super_partner: '超级合伙人',
  owner: '所有者',
  operator: '运营',
  viewer: '只读',
};

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'superadmin':
    case 'owner':
      return 'border-red-500/30 bg-red-500/15 text-red-400 hover:bg-red-500/15';
    case 'admin':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-400 hover:bg-amber-500/15';
    case 'finance':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15';
    case 'support':
    case 'operator':
      return 'border-sky-500/30 bg-sky-500/15 text-sky-400 hover:bg-sky-500/15';
    case 'auditor':
    case 'viewer':
      return 'border-violet-500/30 bg-violet-500/15 text-violet-400 hover:bg-violet-500/15';
    default:
      return '';
  }
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(b);
  return a.every((x) => s.has(x));
}

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('zh-CN');
}

function adminName(a: AdminUser): string {
  return a.username || a.email || `${a.userId.slice(0, 8)}…`;
}

// ---------------------------------------------------------------------------
// Edit permissions dialog
// ---------------------------------------------------------------------------

function EditAdminDialog({
  admin,
  catalog,
  onClose,
  onSaved,
}: {
  admin: AdminUser;
  catalog: PermissionsCatalog;
  onClose: () => void;
  onSaved: () => void;
}) {
  const roleLabel = useCallback(
    (key: string) =>
      catalog.roles.find((r) => r.key === key)?.label ?? ROLE_LABEL_FALLBACK[key] ?? key,
    [catalog.roles],
  );

  const [role, setRole] = useState<string>(admin.role);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(admin.permissions));
  const [saving, setSaving] = useState(false);

  // Permissions grouped preserving catalog order (概览/会员/…/管理员).
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, PermissionDef[]>();
    for (const p of catalog.permissions) {
      const g = p.group || '其他';
      if (!map.has(g)) {
        map.set(g, []);
        order.push(g);
      }
      map.get(g)!.push(p);
    }
    return order.map((g) => ({ group: g, items: map.get(g)! }));
  }, [catalog.permissions]);

  const applyRole = useCallback(
    (nextRole: string) => {
      setRole(nextRole);
      const preset = catalog.roles.find((r) => r.key === nextRole)?.permissions;
      if (preset) setSelected(new Set(preset));
    },
    [catalog.roles],
  );

  const toggle = useCallback((key: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const preset = catalog.roles.find((r) => r.key === role)?.permissions ?? [];
  const selectedArr = [...selected];
  const matchesPreset = sameSet(selectedArr, preset);
  const hasElevated =
    role === 'superadmin' || selectedArr.some((k) => ELEVATED_PERMS.has(k));

  async function save() {
    setSaving(true);
    try {
      // When the selection exactly matches a named role's preset we persist it
      // as that role (backend resets to the preset); otherwise we persist the
      // explicit permission list.
      const patch = matchesPreset ? { role: role as AdminRole } : { permissions: selectedArr };
      const res = await updateAdmin(admin.userId, patch);
      if (res?.pending) toast.success('已提交审批,待另一位管理员复核');
      else toast.success('权限已更新');
      onSaved();
      onClose();
    } catch (e) {
      // Backend 403 (elevated perms / superadmin require a superadmin caller)
      // arrives here as an Error with the server message.
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑权限 · {adminName(admin)}</DialogTitle>
          <DialogDescription className="break-all">
            {admin.email ?? admin.userId}
          </DialogDescription>
        </DialogHeader>

        {/* Role preset */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">角色预设</Label>
          <Select value={role} onValueChange={applyRole}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {catalog.roles.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.label} · {r.permissions.length} 项
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            选择角色会载入其预设权限,可在下方微调。
          </p>
        </div>

        {/* Elevated-permission note */}
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed',
            hasElevated
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              : 'border-border/60 bg-card/40 text-muted-foreground',
          )}
        >
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            提升权限(管理员管理 <code>admins.manage</code>、金库写入{' '}
            <code>treasury.write</code>)以及超级管理员角色,需调用者本身为超级管理员,否则后端将拒绝
            (403)。
          </span>
        </div>

        {/* Grouped permission editor */}
        <div className="space-y-3">
          {groups.map(({ group, items }) => (
            <div key={group} className="rounded-xl border border-border/60 bg-card/30 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((p) => {
                  const on = selected.has(p.key);
                  const elevated = ELEVATED_PERMS.has(p.key);
                  return (
                    <label
                      key={p.key}
                      className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) => toggle(p.key, v === true)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 text-sm">
                          {p.label}
                          {elevated && <ShieldAlert className="h-3 w-3 text-amber-400" />}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {p.key}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            将保存为:
            {matchesPreset ? (
              <span className="text-foreground"> 角色预设「{roleLabel(role)}」</span>
            ) : (
              <span className="text-foreground"> 自定义权限 · {selectedArr.length} 项</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Create admin dialog
// ---------------------------------------------------------------------------

function CreateAdminDialog({
  catalog,
  onClose,
  onCreated,
}: {
  catalog: PermissionsCatalog;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>(catalog.roles[0]?.key ?? 'support');
  const [saving, setSaving] = useState(false);

  async function submit() {
    const value = email.trim();
    if (!value) {
      toast.error('请填写邮箱');
      return;
    }
    setSaving(true);
    try {
      await adminFetch('/admins', {
        method: 'POST',
        body: JSON.stringify({ email: value, role }),
      });
      toast.success('管理员已新增');
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '新增失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>新增管理员</DialogTitle>
          <DialogDescription>
            通过邮箱邀请一位管理员,并赋予初始角色(载入该角色的预设权限)。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">邮箱</Label>
          <Input
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">角色</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {catalog.roles.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.label} · {r.permissions.length} 项
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            赋予超级管理员角色需调用者本身为超级管理员。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? '提交中…' : '新增'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RolesPage() {
  const { user } = useAdminAuth();
  // Only the single root admin (d3finance@hotmail.com) may create / edit / delete
  // admins or change permissions. The backend enforces this via requireRootAdmin;
  // this gate just hides the controls so non-root admins don't hit a 403.
  const isRoot = (user?.username ?? '').trim().toLowerCase() === 'd3finance@hotmail.com';
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [catalog, setCatalog] = useState<PermissionsCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void Promise.all([
      listAdmins(),
      adminFetch<PermissionsCatalog>('/permissions'),
    ])
      .then(([a, c]) => {
        setAdmins(a.rows);
        setCatalog({ permissions: c.permissions ?? [], roles: c.roles ?? [] });
      })
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const roleLabel = useCallback(
    (key: string) =>
      catalog?.roles.find((r) => r.key === key)?.label ?? ROLE_LABEL_FALLBACK[key] ?? key,
    [catalog],
  );

  const permLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of catalog?.permissions ?? []) m.set(p.key, p.label);
    return m;
  }, [catalog]);

  const filters = useMemo<DataListFilter[]>(() => {
    const roles = catalog?.roles ?? [];
    const present = new Set(admins.map((a) => a.role));
    const opts = roles
      .filter((r) => present.has(r.key))
      .map((r) => ({ value: r.key, label: r.label }));
    // Include any role present on admins but missing from the catalog.
    for (const r of present) {
      if (!opts.some((o) => o.value === r)) opts.push({ value: r, label: roleLabel(r) });
    }
    return opts.length ? [{ key: 'role', label: '角色', options: opts }] : [];
  }, [catalog, admins, roleLabel]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await adminFetch(`/admins/${deleting.userId}`, { method: 'DELETE' });
      toast.success('管理员已删除');
      setDeleting(null);
      load();
    } catch (e) {
      // e.g. cannot delete self — surfaced from the backend.
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeletingBusy(false);
    }
  }

  const columns = useMemo<DataListColumn<AdminUser>[]>(
    () => [
      {
        key: 'username',
        label: '用户名',
        render: (row) => (
          <div className="flex flex-col items-end gap-0.5 md:items-start">
            <span className="font-medium">{adminName(row)}</span>
            {row.email && row.username ? (
              <span className="max-w-[180px] truncate text-[11px] text-muted-foreground">
                {row.email}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'role',
        label: '角色',
        sortable: true,
        render: (row) => (
          <Badge variant="outline" className={cn('gap-1', roleBadgeClass(row.role))}>
            <ShieldCheck className="h-3 w-3" />
            {roleLabel(row.role)}
          </Badge>
        ),
      },
      {
        key: 'permissions',
        label: '权限',
        render: (row) => {
          const perms = row.permissions ?? [];
          const shown = perms.slice(0, 3);
          return (
            <div className="flex flex-wrap items-center justify-end gap-1 md:justify-start">
              <Badge variant="secondary" className="tabular-nums">
                {perms.length} 项
              </Badge>
              {shown.map((k) => (
                <Badge key={k} variant="outline" className="text-[10px]">
                  {permLabel.get(k) ?? k}
                </Badge>
              ))}
              {perms.length > shown.length && (
                <span className="text-[11px] text-muted-foreground">
                  +{perms.length - shown.length}
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: 'createdAt',
        label: '创建时间',
        sortable: true,
        className: 'whitespace-nowrap text-right md:text-left text-xs text-muted-foreground',
        render: (row) => fmtDate(row.createdAt),
      },
      {
        key: 'actions',
        label: '操作',
        className: 'text-right',
        render: (row) =>
          isRoot ? (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(row);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label="删除管理员"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(row);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    [roleLabel, permLabel, isRoot],
  );

  return (
    <PageShell
      title="角色权限"
      subtitle="Roles · 管理员角色与权限分配"
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
            <RotateCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            刷新
          </Button>
          {isRoot && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setCreateOpen(true)}
              disabled={!catalog}
            >
              <UserPlus className="h-3.5 w-3.5" />
              新增管理员
            </Button>
          )}
        </>
      }
    >
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {!isRoot && (
        <div className="mb-4 flex items-start gap-2 rounded-xl cell-inset p-3 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            只有根管理员 <span className="font-medium text-foreground">d3finance@hotmail.com</span>{' '}
            可以新增、编辑或删除管理员及修改权限。你可以查看当前管理员名单。
          </span>
        </div>
      )}

      <DataList<AdminUser>
        columns={columns}
        rows={admins}
        getRowId={(r) => r.userId}
        searchKeys={['username', 'email']}
        searchPlaceholder="搜索用户名 / 邮箱…"
        filters={filters}
        dateKey="createdAt"
        onRowClick={isRoot ? (row) => setEditing(row) : undefined}
        pageSize={20}
        loading={loading}
        emptyText="暂无管理员"
      />

      {editing && catalog && (
        <EditAdminDialog
          admin={editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      {createOpen && catalog && (
        <CreateAdminDialog
          catalog={catalog}
          onClose={() => setCreateOpen(false)}
          onCreated={load}
        />
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除管理员</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除管理员
              <span className="font-medium text-foreground"> {deleting ? adminName(deleting) : ''} </span>
              吗?此操作不可撤销。你无法删除自己的账户。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deletingBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingBusy ? '删除中…' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
