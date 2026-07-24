import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Layers,
  Pencil,
  Plus,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
 * Roles & permissions (角色权限), three tabs:
 *  - 管理员: the admin roster (superadmin-only management).
 *  - 角色模板: built-in presets + superadmin-authored custom templates
 *    (POST/PATCH/DELETE /role-templates).
 *  - 权限说明: the full catalog explained — 读/写/管理 kind + what each grants.
 */

type RoleDef = { key: string; label: string; permissions: string[] };
type RoleTemplate = RoleDef & { createdAt?: string | null };
type PermissionsCatalog = {
  permissions: PermissionDef[];
  roles: RoleDef[];
  templates: RoleTemplate[];
};

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

/** 权限说明 — what each permission actually allows (读 / 写 / 管理). */
const PERM_DESCRIPTIONS: Record<string, string> = {
  'dashboard.read': '查看总览的运营指标(会员/合伙人/质押笔数/工单等)。',
  'dashboard.funds.read': '查看总览的资金与偿付分区(入金/质押本金/链上储备/D3负债/偿付率/UD3)。持有 treasury.read 也可见(兼容)。',
  'members.balance.read': '查看会员余额明细(UD3/产出D3等)。持有 members.read 也可见(兼容)。',
  'approvals.read': '查看事务管理中的多签审批列表。持有补贴/安全/会员写权限也可见(兼容)。',
  'security.pause': '单独授予熔断暂停/恢复操作(security.write 包含此权限)。',
  'params.heartbeat.write': '单独授予心跳订单配置(params.write 包含此权限)。',
  'treasury.propose': '发起金库转账提案(提升权限,仅超级管理员可授予)。',
  'treasury.approve': '审批金库转账提案(提升权限,仅超级管理员可授予)。',
  'members.read': '查看会员列表、会员详情、余额与团队信息。',
  'members.write': '修改会员资料与状态、调整市场领袖标记、管理入金地址池等写操作。',
  'stakes.read': '查看质押订单、仓位与 UD3 奖励明细。',
  'transactions.read': '查看入金、提现、转账等交易记录。',
  'referrals.read': '查看推荐关系与推荐树。',
  'partners.read': '查看合伙人名单、等级与业绩。',
  'subsidies.read': '查看补贴工单及工单详情。',
  'subsidies.write': '处理补贴工单:回复、通过、驳回、关闭(含审批流)。',
  'subsidies.rates': '修改会员补贴比例(资金相关,谨慎授予)。',
  'security.read': '查看安全中心:告警、熔断状态、风控限额。',
  'security.write': '处理安全告警、暂停/恢复系统开关、修改风控限额(含删除类操作)。',
  'params.read': '查看系统参数与心跳配置。',
  'params.write': '修改系统参数、心跳订单配置(资金相关,谨慎授予)。',
  'treasury.read': '查看金库与基础设施钱包余额、转账记录、白名单。',
  'treasury.write': '发起金库转账、管理转账白名单(提升权限,仅超级管理员可授予)。',
  'admins.read': '查看管理员名单与权限目录。',
  'admins.manage': '新增/编辑/删除管理员(提升权限;当前后端además要求调用者为超级管理员)。',
  'logs.read': '查看全部操作审计日志。',
};

function permKind(key: string): { label: string; className: string } {
  if (key.endsWith('.read')) {
    return { label: '读', className: 'border-sky-500/30 bg-sky-500/15 text-sky-400' };
  }
  if (key === 'admins.manage') {
    return { label: '管理', className: 'border-red-500/30 bg-red-500/15 text-red-400' };
  }
  return { label: '写/删', className: 'border-amber-500/30 bg-amber-500/15 text-amber-400' };
}

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

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('zh-CN');
}

function adminName(a: AdminUser): string {
  return a.username || a.email || `${a.userId.slice(0, 8)}…`;
}

/** Group the permission catalog preserving its order (概览/会员/…/管理员). */
function usePermGroups(catalog: { permissions: PermissionDef[] } | null) {
  return useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, PermissionDef[]>();
    for (const p of catalog?.permissions ?? []) {
      const g = p.group || '其他';
      if (!map.has(g)) {
        map.set(g, []);
        order.push(g);
      }
      map.get(g)!.push(p);
    }
    return order.map((g) => ({ group: g, items: map.get(g)! }));
  }, [catalog]);
}

/** Shared grouped checkbox editor for a permission selection. */
function PermissionPicker({
  groups,
  selected,
  onToggle,
}: {
  groups: { group: string; items: PermissionDef[] }[];
  selected: Set<string>;
  onToggle: (key: string, on: boolean) => void;
}) {
  return (
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
                    onCheckedChange={(v) => onToggle(p.key, v === true)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-sm">
                      {p.label}
                      {elevated && <ShieldAlert className="h-3 w-3 text-amber-400" />}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">{p.key}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit admin permissions dialog
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
  const [scopeWallet, setScopeWallet] = useState(admin.scopeWallet ?? '');
  const [saving, setSaving] = useState(false);

  const groups = usePermGroups(catalog);

  const applyRole = useCallback(
    (nextRole: string) => {
      setRole(nextRole);
      const preset = catalog.roles.find((r) => r.key === nextRole)?.permissions;
      if (preset) setSelected(new Set(preset));
    },
    [catalog.roles],
  );

  const applyTemplate = useCallback(
    (key: string) => {
      const tpl = catalog.templates.find((t) => t.key === key);
      if (tpl) setSelected(new Set(tpl.permissions));
    },
    [catalog.templates],
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
  const hasElevated = role === 'superadmin' || selectedArr.some((k) => ELEVATED_PERMS.has(k));

  async function save() {
    const scope = scopeWallet.trim().toLowerCase();
    if (scope && !/^0x[a-f0-9]{40}$/.test(scope)) {
      toast.error('数据范围需为钱包地址(0x…40位)或留空');
      return;
    }
    setSaving(true);
    try {
      // When the selection exactly matches a named role's preset we persist it
      // as that role (backend resets to the preset); otherwise we persist the
      // explicit permission list.
      const patch = {
        ...(matchesPreset ? { role: role as AdminRole } : { permissions: selectedArr }),
        ...(scope !== (admin.scopeWallet ?? '') ? { scopeWallet: scope || null } : {}),
      };
      const res = await updateAdmin(admin.userId, patch);
      if (res?.pending) toast.success('已提交审批,待另一位管理员复核');
      else toast.success('权限已更新');
      onSaved();
      onClose();
    } catch (e) {
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
          <DialogDescription className="break-all">{admin.email ?? admin.userId}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
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
          </div>

          {/* Custom template loader */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">从自定义模板载入</Label>
            <Select value="" onValueChange={applyTemplate} disabled={!catalog.templates.length}>
              <SelectTrigger className="h-9">
                <SelectValue
                  placeholder={catalog.templates.length ? '选择模板…' : '暂无自定义模板'}
                />
              </SelectTrigger>
              <SelectContent>
                {catalog.templates.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label} · {t.permissions.length} 项
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="-mt-1 text-[11px] text-muted-foreground">
          选择角色或模板会载入其预设权限,可在下方微调后保存。
        </p>

        {/* 伞下数据范围 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">数据范围(伞下钱包,可选)</Label>
          <Input
            placeholder="0x… 留空 = 不限;填入后该管理员只能看到此钱包伞下的会员/数据"
            value={scopeWallet}
            onChange={(e) => setScopeWallet(e.target.value)}
            className="font-mono text-xs"
          />
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
            提升权限(管理员管理 <code>admins.manage</code>、金库写入 <code>treasury.write</code>
            )以及超级管理员角色,需调用者本身为超级管理员,否则后端将拒绝 (403)。
          </span>
        </div>

        <PermissionPicker groups={groups} selected={selected} onToggle={toggle} />

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
            通过邮箱邀请一位管理员,并赋予初始角色(载入该角色的预设权限,之后可在编辑中微调)。
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
// Role template dialog (create / edit)
// ---------------------------------------------------------------------------

function TemplateDialog({
  template,
  catalog,
  onClose,
  onSaved,
}: {
  template: RoleTemplate | null; // null = create
  catalog: PermissionsCatalog;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(template);
  const [label, setLabel] = useState(template?.label ?? '');
  const [key, setKey] = useState(template?.key ?? '');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(template?.permissions ?? []),
  );
  const [saving, setSaving] = useState(false);
  const groups = usePermGroups(catalog);

  const toggle = useCallback((k: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(k);
      else next.delete(k);
      return next;
    });
  }, []);

  async function submit() {
    const lbl = label.trim();
    const k = key.trim().toLowerCase();
    if (!lbl) {
      toast.error('请填写模板名称');
      return;
    }
    if (!isEdit && !/^[a-z0-9][a-z0-9_-]{1,31}$/.test(k)) {
      toast.error('key 需为 2-32 位小写字母/数字/下划线/连字符');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await adminFetch(`/role-templates/${template!.key}`, {
          method: 'PATCH',
          body: JSON.stringify({ label: lbl, permissions: [...selected] }),
        });
        toast.success('模板已更新');
      } else {
        await adminFetch('/role-templates', {
          method: 'POST',
          body: JSON.stringify({ key: k, label: lbl, permissions: [...selected] }),
        });
        toast.success('模板已创建');
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `编辑模板 · ${template!.label}` : '新建角色模板'}</DialogTitle>
          <DialogDescription>
            角色模板是一组可复用的权限组合;在「管理员」页编辑权限时可一键载入。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">模板名称</Label>
            <Input
              placeholder="例如:运营专员"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">key(唯一标识)</Label>
            <Input
              placeholder="例如:ops_specialist"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={isEdit}
            />
          </div>
        </div>

        <PermissionPicker groups={groups} selected={selected} onToggle={toggle} />

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">已选 {selected.size} 项权限</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving ? '保存中…' : isEdit ? '保存' : '创建'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab: 角色模板
// ---------------------------------------------------------------------------

function TemplatesTab({
  catalog,
  canManage,
  permLabel,
  onChanged,
}: {
  catalog: PermissionsCatalog;
  canManage: boolean;
  permLabel: Map<string, string>;
  onChanged: () => void;
}) {
  const [dialog, setDialog] = useState<{ open: boolean; template: RoleTemplate | null }>({
    open: false,
    template: null,
  });
  const [deleting, setDeleting] = useState<RoleTemplate | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await adminFetch(`/role-templates/${deleting.key}`, { method: 'DELETE' });
      toast.success('模板已删除');
      setDeleting(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeletingBusy(false);
    }
  }

  function PermChips({ perms }: { perms: string[] }) {
    const shown = perms.slice(0, 6);
    return (
      <div className="mt-2 flex flex-wrap gap-1">
        {shown.map((k) => (
          <Badge key={k} variant="outline" className="text-[10px]">
            {permLabel.get(k) ?? k}
          </Badge>
        ))}
        {perms.length > shown.length && (
          <span className="text-[11px] text-muted-foreground">+{perms.length - shown.length}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-1.5" onClick={() => setDialog({ open: true, template: null })}>
            <Plus className="h-3.5 w-3.5" />
            新建模板
          </Button>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
          内置角色(代码预设,不可修改)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog.roles.map((r) => (
            <div key={r.key} className="rounded-xl cell-inset p-3.5">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className={cn('gap-1', roleBadgeClass(r.key))}>
                  <ShieldCheck className="h-3 w-3" />
                  {r.label}
                </Badge>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {r.permissions.length} 项权限
                </span>
              </div>
              <PermChips perms={r.permissions} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
          自定义模板 ({catalog.templates.length})
        </p>
        {catalog.templates.length === 0 ? (
          <p className="rounded-xl cell-inset p-4 text-sm text-muted-foreground">
            暂无自定义模板。{canManage ? '点击「新建模板」创建一组可复用的权限组合。' : ''}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {catalog.templates.map((t) => (
              <div key={t.key} className="rounded-xl cell-inset p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{t.label}</span>
                    <code className="shrink-0 text-[10px] text-muted-foreground">{t.key}</code>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="编辑模板"
                        onClick={() => setDialog({ open: true, template: t })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        aria-label="删除模板"
                        onClick={() => setDeleting(t)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <PermChips perms={t.permissions} />
              </div>
            ))}
          </div>
        )}
      </div>

      {dialog.open && (
        <TemplateDialog
          template={dialog.template}
          catalog={catalog}
          onClose={() => setDialog({ open: false, template: null })}
          onSaved={onChanged}
        />
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模板</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除模板
              <span className="font-medium text-foreground"> {deleting?.label} </span>
              吗?已用该模板赋权的管理员不受影响(权限已落到各自账户上)。
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: 审批策略 (single vs multi-sign per management permission)
// ---------------------------------------------------------------------------

type ApprovalPolicyRow = {
  permission_key: string;
  mode: 'single' | 'multi';
  required_approvals: number;
  approver_ids: string[] | null;
};
type PolicyAdmin = { userId: string; username: string };

function PolicyEditor({
  perm,
  policy,
  admins,
  canManage,
  permLabel,
  onSaved,
}: {
  perm: PermissionDef;
  policy: ApprovalPolicyRow | null;
  admins: PolicyAdmin[];
  canManage: boolean;
  permLabel: Map<string, string>;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<'single' | 'multi'>(policy?.mode ?? 'single');
  const [required, setRequired] = useState<number>(policy?.required_approvals ?? 2);
  const [approvers, setApprovers] = useState<Set<string>>(
    () => new Set(policy?.approver_ids ?? []),
  );
  const [saving, setSaving] = useState(false);

  const dirty =
    mode !== (policy?.mode ?? 'single') ||
    (mode === 'multi' &&
      (required !== (policy?.required_approvals ?? 2) ||
        !sameSet([...approvers], policy?.approver_ids ?? [])));

  async function save() {
    if (mode === 'multi' && approvers.size > 0 && approvers.size < required) {
      toast.error('指定审批人数量不能少于所需批准数');
      return;
    }
    setSaving(true);
    try {
      await adminFetch(`/approval-policies/${perm.key}`, {
        method: 'PUT',
        body: JSON.stringify({
          mode,
          requiredApprovals: required,
          approverIds: mode === 'multi' ? [...approvers] : [],
        }),
      });
      toast.success(`${permLabel.get(perm.key) ?? perm.key} 审批策略已保存`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl cell-inset p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{perm.label}</p>
          <code className="text-[10px] text-muted-foreground">{perm.key}</code>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={mode}
            onValueChange={(v) => setMode(v === 'multi' ? 'multi' : 'single')}
            disabled={!canManage}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">单管理员批准</SelectItem>
              <SelectItem value="multi">多签审批</SelectItem>
            </SelectContent>
          </Select>
          {mode === 'multi' && (
            <Select
              value={String(required)}
              onValueChange={(v) => setRequired(Number(v))}
              disabled={!canManage}
            >
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} 人批准
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canManage && (
            <Button size="sm" className="h-8" onClick={save} disabled={saving || !dirty}>
              {saving ? '保存中…' : '保存'}
            </Button>
          )}
        </div>
      </div>
      {mode === 'multi' && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            指定审批人(不选 = 持有该权限的任意管理员均可批准)
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {admins.map((a) => (
              <label key={a.userId} className="flex cursor-pointer items-center gap-1.5 text-xs">
                <Checkbox
                  checked={approvers.has(a.userId)}
                  disabled={!canManage}
                  onCheckedChange={(v) => {
                    setApprovers((prev) => {
                      const next = new Set(prev);
                      if (v === true) next.add(a.userId);
                      else next.delete(a.userId);
                      return next;
                    });
                  }}
                />
                {a.username}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PoliciesTab({
  catalog,
  canManage,
  permLabel,
}: {
  catalog: PermissionsCatalog;
  canManage: boolean;
  permLabel: Map<string, string>;
}) {
  const [rows, setRows] = useState<ApprovalPolicyRow[]>([]);
  const [admins, setAdmins] = useState<PolicyAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void adminFetch<{ rows: ApprovalPolicyRow[]; admins: PolicyAdmin[] }>('/approval-policies')
      .then((r) => {
        setRows(r.rows ?? []);
        setAdmins(r.admins ?? []);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Management permissions only (writes) — reads never need approval.
  const managePerms = catalog.permissions.filter((p) => !p.key.endsWith('.read'));

  if (loading) return <p className="text-sm text-muted-foreground">加载中…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl cell-inset p-3 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <span>
          为每个管理权限选择审批方式:<b>单管理员批准</b> = 发起人提交后由另一位持权管理员复核(默认);
          <b>多签审批</b> = 需 N 位管理员共同批准,可指定审批人名单。策略对走审批队列的操作生效
          (补贴工单/补贴比例/安全熔断/风控限额/市场领袖变更等)。仅超级管理员可修改。
        </span>
      </div>
      {managePerms.map((p) => (
        <PolicyEditor
          key={p.key}
          perm={p}
          policy={rows.find((r) => r.permission_key === p.key) ?? null}
          admins={admins}
          canManage={canManage}
          permLabel={permLabel}
          onSaved={load}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: 权限说明
// ---------------------------------------------------------------------------

function PermissionDocsTab({ catalog }: { catalog: PermissionsCatalog }) {
  const groups = usePermGroups(catalog);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl cell-inset p-3 text-xs text-muted-foreground">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
        <span>
          每项权限按「读 / 写(含删除) / 管理」分类。带
          <ShieldAlert className="mx-0.5 inline h-3 w-3 text-amber-400" />
          的为提升权限,仅超级管理员可授予;新增/删除管理员本身只有超级管理员能操作,与权限无关。
        </span>
      </div>
      {groups.map(({ group, items }) => (
        <div key={group} className="rounded-xl border border-border/60 bg-card/30 p-3.5">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group}
          </p>
          <div className="space-y-2.5">
            {items.map((p) => {
              const kind = permKind(p.key);
              return (
                <div key={p.key} className="flex items-start gap-2.5">
                  <Badge
                    variant="outline"
                    className={cn('mt-0.5 w-12 shrink-0 justify-center text-[10px]', kind.className)}
                  >
                    {kind.label}
                  </Badge>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="font-medium">{p.label}</span>
                      {ELEVATED_PERMS.has(p.key) && (
                        <ShieldAlert className="h-3 w-3 text-amber-400" />
                      )}
                      <code className="text-[10px] text-muted-foreground">{p.key}</code>
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {PERM_DESCRIPTIONS[p.key] ?? '—'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RolesPage() {
  const { user } = useAdminAuth();
  // Only superadmins may create / edit / delete admins, change permissions or
  // manage role templates. The backend enforces this (requireAdminManager);
  // this gate just hides the controls so other admins don't hit a 403.
  const isRoot = user?.role === 'superadmin';
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
    void Promise.all([listAdmins(), adminFetch<PermissionsCatalog>('/permissions')])
      .then(([a, c]) => {
        setAdmins(a.rows);
        setCatalog({
          permissions: c.permissions ?? [],
          roles: c.roles ?? [],
          templates: c.templates ?? [],
        });
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
      subtitle="Roles · 管理员、角色模板与权限说明"
      actions={
        <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
          <RotateCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          刷新
        </Button>
      }
    >
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <Tabs defaultValue="admins">
        <TabsList className="mb-4">
          <TabsTrigger value="admins" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            管理员
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            角色模板
          </TabsTrigger>
          <TabsTrigger value="policies" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            审批策略
          </TabsTrigger>
          <TabsTrigger value="docs" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            权限说明
          </TabsTrigger>
        </TabsList>

        <TabsContent value="admins">
          {!isRoot && (
            <div className="mb-4 flex items-start gap-2 rounded-xl cell-inset p-3 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                只有<span className="font-medium text-foreground">超级管理员</span>
                可以新增、编辑或删除管理员及修改权限。你可以查看当前管理员名单。
              </span>
            </div>
          )}

          {isRoot && (
            <div className="mb-4 flex justify-end">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setCreateOpen(true)}
                disabled={!catalog}
              >
                <UserPlus className="h-3.5 w-3.5" />
                新增管理员
              </Button>
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
        </TabsContent>

        <TabsContent value="templates">
          {catalog ? (
            <TemplatesTab
              catalog={catalog}
              canManage={isRoot}
              permLabel={permLabel}
              onChanged={load}
            />
          ) : (
            <p className="text-sm text-muted-foreground">加载中…</p>
          )}
        </TabsContent>

        <TabsContent value="policies">
          {catalog ? (
            <PoliciesTab catalog={catalog} canManage={isRoot} permLabel={permLabel} />
          ) : (
            <p className="text-sm text-muted-foreground">加载中…</p>
          )}
        </TabsContent>

        <TabsContent value="docs">
          {catalog ? (
            <PermissionDocsTab catalog={catalog} />
          ) : (
            <p className="text-sm text-muted-foreground">加载中…</p>
          )}
        </TabsContent>
      </Tabs>

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
              <span className="font-medium text-foreground">
                {' '}
                {deleting ? adminName(deleting) : ''}{' '}
              </span>
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
