import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { PageShell } from './page-shell';
import { fmtUsd } from '@/lib/supabase';
import { useAdminAuth } from '@/contexts/admin-auth';
import {
  getSecurityOverview,
  listSecurityAlerts,
  ackAlert,
  pause,
  unpause,
  updateRiskLimits,
  type SecurityOverview,
  type SecurityAlert,
  type PauseFlag,
  type RiskLimits,
} from '@/lib/adminApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const FLAGS = ['flash_swap', 'deposits', 'settlement', 'treasury', 'rewards'] as const;

const FLAG_LABEL: Record<string, { label: string; sub: string }> = {
  flash_swap: { label: '闪兑', sub: 'Flash Swap' },
  deposits: { label: '充值', sub: 'Deposits' },
  settlement: { label: '结算', sub: 'Settlement' },
  treasury: { label: '金库', sub: 'Treasury' },
  rewards: { label: '奖励', sub: 'Rewards' },
};

const SEVERITY_STYLE: Record<string, string> = {
  P0: 'bg-red-500/15 text-red-500 border-red-500/40',
  P1: 'bg-orange-500/15 text-orange-500 border-orange-500/40',
  P2: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/40',
  P3: 'bg-blue-500/15 text-blue-500 border-blue-500/40',
};

const ALERT_STATUS_LABEL: Record<string, string> = {
  open: '待处理',
  ack: '已确认',
  resolved: '已解决',
};

function mergeFlags(pauseFlags: PauseFlag[]): PauseFlag[] {
  const byFlag = new Map(pauseFlags.map((f) => [f.flag, f]));
  return FLAGS.map(
    (flag) =>
      byFlag.get(flag) ?? { flag, paused: false, reason: null, updated_at: null, auto_paused: false },
  );
}

export default function SecurityPage() {
  const { hasPermission } = useAdminAuth();
  const canWrite = hasPermission('security.write');

  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyFlag, setBusyFlag] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  // Risk-limits edit dialog
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [limitsDraft, setLimitsDraft] = useState<Record<string, string>>({});
  const [limitsSaving, setLimitsSaving] = useState(false);

  const loadOverview = useCallback(() => {
    setLoading(true);
    void getSecurityOverview()
      .then((r) => {
        setOverview(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  const loadAlerts = useCallback(() => {
    setAlertsLoading(true);
    void listSecurityAlerts({ status: statusFilter, severity: severityFilter })
      .then((r) => setAlerts(r.rows ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : '加载告警失败'))
      .finally(() => setAlertsLoading(false));
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const flags = useMemo(() => mergeFlags(overview?.pauseFlags ?? []), [overview]);
  const solvency = overview?.solvency;
  const limits = overview?.limits ?? {};

  const handleToggle = async (flag: PauseFlag, next: boolean) => {
    if (!canWrite || busyFlag) return;
    if (next) {
      // Turning ON = pause (single-admin, immediate).
      const reason = window.prompt(`暂停「${FLAG_LABEL[flag.flag]?.label ?? flag.flag}」的原因：`);
      if (reason == null || !reason.trim()) return;
      setBusyFlag(flag.flag);
      try {
        await pause(flag.flag, reason.trim());
        toast.success('已暂停');
        loadOverview();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '暂停失败');
      } finally {
        setBusyFlag(null);
      }
    } else {
      // Turning OFF = unpause (maker-checker, needs a second admin). Do NOT flip optimistically.
      const reason = window.prompt(`恢复「${FLAG_LABEL[flag.flag]?.label ?? flag.flag}」的原因：`);
      if (reason == null || !reason.trim()) return;
      setBusyFlag(flag.flag);
      try {
        await unpause(flag.flag, reason.trim());
        toast.success('已提交，需第二位管理员在审批中心批准');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '提交失败');
      } finally {
        setBusyFlag(null);
      }
    }
  };

  const handleAck = async (id: string) => {
    if (!canWrite) return;
    try {
      await ackAlert(id);
      toast.success('已确认');
      loadAlerts();
      loadOverview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '确认失败');
    }
  };

  const openLimitsDialog = () => {
    const draft: Record<string, string> = {};
    for (const [k, v] of Object.entries(limits)) {
      draft[k] = v == null ? '' : String(v);
    }
    setLimitsDraft(draft);
    setLimitsOpen(true);
  };

  const saveLimits = async () => {
    if (!canWrite) return;
    setLimitsSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const [k, raw] of Object.entries(limitsDraft)) {
        const orig = (limits as RiskLimits)[k];
        if (typeof orig === 'number') {
          const n = Number(raw);
          patch[k] = Number.isFinite(n) ? n : orig;
        } else if (typeof orig === 'boolean') {
          patch[k] = raw === 'true' || raw === '1';
        } else {
          patch[k] = raw;
        }
      }
      await updateRiskLimits(patch);
      toast.success('已提交审批');
      setLimitsOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败');
    } finally {
      setLimitsSaving(false);
    }
  };

  return (
    <PageShell title="安全中心" subtitle="熔断开关、偿付率、风控限额与安全告警 — Security">
      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. Circuit breakers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">熔断开关 · Circuit Breakers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {flags.map((f) => {
                const meta = FLAG_LABEL[f.flag] ?? { label: f.flag, sub: '' };
                return (
                  <div
                    key={f.flag}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{meta.label}</span>
                        <span className="text-[10px] text-muted-foreground">{meta.sub}</span>
                        {f.paused ? (
                          <Badge variant="outline" className="bg-red-500/15 text-red-500 border-red-500/40">
                            已暂停
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-500/15 text-green-600 border-green-500/40">
                            正常
                          </Badge>
                        )}
                        {f.auto_paused && (
                          <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/40">
                            自动熔断
                          </Badge>
                        )}
                      </div>
                      {f.reason && (
                        <p className="text-xs text-muted-foreground mt-1 break-words">原因：{f.reason}</p>
                      )}
                      {f.updated_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          更新于 {f.updated_at.slice(0, 16).replace('T', ' ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {busyFlag === f.flag && <Loader2 className="h-4 w-4 animate-spin" />}
                      <Switch
                        checked={f.paused}
                        disabled={!canWrite || busyFlag === f.flag}
                        onCheckedChange={(v) => void handleToggle(f, v)}
                        aria-label={`toggle ${f.flag}`}
                      />
                    </div>
                  </div>
                );
              })}
              {!canWrite && (
                <p className="text-[11px] text-muted-foreground">只读：暂停/恢复需要 security.write 权限。</p>
              )}
            </CardContent>
          </Card>

          {/* 2. Solvency */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">闪兑储备 (USDT)</p>
                <p className="text-lg font-bold mt-1">
                  ${solvency ? fmtUsd(solvency.flashSwapReserveUsdt) : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">负债 (USDT)</p>
                <p className="text-lg font-bold mt-1">
                  ${solvency ? fmtUsd(solvency.liabilityUsdt) : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">偿付率</p>
                <p className="text-lg font-bold mt-1">
                  {solvency ? `${(solvency.ratio * 100).toFixed(1)}%` : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <p className="text-xs text-muted-foreground">健康状态</p>
                {solvency ? (
                  solvency.healthy ? (
                    <Badge variant="outline" className="mt-1 w-fit bg-green-500/15 text-green-600 border-green-500/40">
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" /> 健康
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="mt-1 w-fit bg-red-500/15 text-red-500 border-red-500/40">
                      <ShieldAlert className="h-3.5 w-3.5 mr-1" /> 风险
                    </Badge>
                  )
                ) : (
                  <p className="text-lg font-bold mt-1">—</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 3. Risk limits */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">风控限额 · Risk Limits</CardTitle>
              {canWrite && (
                <Button size="sm" variant="outline" onClick={openLimitsDialog}>
                  编辑
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {Object.keys(limits).length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无限额配置</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(limits).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <span className="text-xs text-muted-foreground font-mono break-all">{k}</span>
                      <span className="text-sm font-semibold">{v == null ? '—' : String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 4. Alerts */}
          <Card>
            <CardHeader className="space-y-3">
              <CardTitle className="text-base">安全告警 · Alerts</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="open">待处理</SelectItem>
                    <SelectItem value="ack">已确认</SelectItem>
                    <SelectItem value="resolved">已解决</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="级别" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部级别</SelectItem>
                    <SelectItem value="P0">P0</SelectItem>
                    <SelectItem value="P1">P1</SelectItem>
                    <SelectItem value="P2">P2</SelectItem>
                    <SelectItem value="P3">P3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">暂无告警</p>
              ) : (
                <div className="rounded-xl border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>级别</TableHead>
                        <TableHead>规则</TableHead>
                        <TableHead>标题</TableHead>
                        <TableHead>时间</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alerts.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>
                            <Badge variant="outline" className={SEVERITY_STYLE[a.severity] ?? ''}>
                              {a.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{a.rule_id}</TableCell>
                          <TableCell className="text-sm max-w-[260px] truncate">{a.title ?? '—'}</TableCell>
                          <TableCell className="text-xs">
                            {a.created_at?.slice(0, 16).replace('T', ' ')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{ALERT_STATUS_LABEL[a.status] ?? a.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {a.status === 'open' && canWrite ? (
                              <Button size="sm" variant="outline" onClick={() => void handleAck(a.id)}>
                                确认
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Risk-limits edit dialog */}
      <Dialog open={limitsOpen} onOpenChange={setLimitsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑风控限额</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {Object.keys(limitsDraft).length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无可编辑项</p>
            ) : (
              Object.entries(limitsDraft).map(([k, v]) => (
                <label key={k} className="text-xs space-y-1 block">
                  <span className="text-muted-foreground font-mono break-all">{k}</span>
                  <input
                    value={v}
                    onChange={(e) => setLimitsDraft((d) => ({ ...d, [k]: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
              ))
            )}
            <p className="text-[11px] text-muted-foreground">修改限额需第二位管理员审批后生效。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimitsOpen(false)}>
              取消
            </Button>
            <Button disabled={limitsSaving} onClick={() => void saveLimits()}>
              {limitsSaving ? '提交中…' : '提交审批'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
