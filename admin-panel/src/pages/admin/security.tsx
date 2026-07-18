import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  Gift,
  Info,
  Landmark,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
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
import { AddressChip } from '@/components/address-chip';
import { DataList, type DataListColumn } from '@/components/data-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Static metadata
// ---------------------------------------------------------------------------

type FlagMeta = {
  label: string;
  sub: string;
  icon: typeof Zap;
  /** What the switch controls when tripped. */
  effect: string;
  /** When the system may auto-trip this breaker. */
  autoTrigger: string;
};

const FLAG_META: Record<string, FlagMeta> = {
  flash_swap: {
    label: '闪兑',
    sub: 'Flash Swap',
    icon: ArrowLeftRight,
    effect: '暂停后用户无法进行 USDT ⇄ UD3 闪兑，前端下单入口即时关闭。',
    autoTrigger: '偿付率跌破安全阈值或储备异常时自动熔断。',
  },
  deposits: {
    label: '充值',
    sub: 'Deposits',
    icon: ArrowDownToLine,
    effect: '暂停后停止链上入金归集与充值上账，已到账资金不受影响。',
    autoTrigger: '归集地址异常或链上确认延迟激增时自动熔断。',
  },
  settlement: {
    label: '结算',
    sub: 'Settlement',
    icon: Activity,
    effect: '暂停后停止周期结算与 UD3 收益计提，队列任务挂起。',
    autoTrigger: '结算数据校验失败或账目不平时自动熔断。',
  },
  treasury: {
    label: '金库',
    sub: 'Treasury',
    icon: Landmark,
    effect: '暂停后冻结金库划转与提现，资金无法流出。',
    autoTrigger: '单笔或累计流出超过风控限额时自动熔断。',
  },
  rewards: {
    label: '奖励',
    sub: 'Rewards',
    icon: Gift,
    effect: '暂停后停止 UD3 奖励发放与推荐返佣的自动派发。',
    autoTrigger: '奖励池余额不足或发放速率异常时自动熔断。',
  },
};

const FLAGS = Object.keys(FLAG_META);

const SEVERITY_STYLE: Record<string, string> = {
  P0: 'bg-red-500/15 text-red-500 border-red-500/40',
  P1: 'bg-orange-500/15 text-orange-500 border-orange-500/40',
  P2: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/40',
  P3: 'bg-blue-500/15 text-blue-500 border-blue-500/40',
};

const SEVERITY_HINT: Record<string, string> = {
  P0: '致命 · 需立即处置',
  P1: '严重 · 尽快处置',
  P2: '警告 · 关注',
  P3: '提示 · 记录',
};

const ALERT_STATUS_LABEL: Record<string, string> = {
  open: '待处理',
  ack: '已确认',
  resolved: '已解决',
};

const ALERT_STATUS_STYLE: Record<string, string> = {
  open: 'bg-red-500/15 text-red-500 border-red-500/40',
  ack: 'bg-amber-500/15 text-amber-600 border-amber-500/40',
  resolved: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40',
};

// Humanised labels for well-known risk-limit keys; unknown keys fall back to raw.
const LIMIT_META: Record<string, { label: string; hint: string; unit?: string }> = {
  max_flash_swap_usdt: { label: '单笔闪兑上限', hint: '单次 USDT ⇄ UD3 闪兑的最大金额', unit: 'USDT' },
  daily_flash_swap_usdt: { label: '每日闪兑上限', hint: '单账户每日闪兑累计上限', unit: 'USDT' },
  max_withdraw_usdt: { label: '单笔提现上限', hint: '单次金库提现的最大金额', unit: 'USDT' },
  daily_withdraw_usdt: { label: '每日提现上限', hint: '全站每日提现累计上限', unit: 'USDT' },
  min_solvency_ratio: { label: '最低偿付率', hint: '低于此值触发闪兑自动熔断' },
  max_reward_rate: { label: '奖励速率上限', hint: '单周期 UD3 奖励发放速率上限' },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function mergeFlags(pauseFlags: PauseFlag[]): PauseFlag[] {
  const byFlag = new Map(pauseFlags.map((f) => [f.flag, f]));
  return FLAGS.map(
    (flag) =>
      byFlag.get(flag) ?? { flag, paused: false, reason: null, updated_at: null, auto_paused: false },
  );
}

function fmtTs(ts?: string | null): string {
  if (!ts) return '—';
  return ts.slice(0, 16).replace('T', ' ');
}

function isLikelyAddress(v: unknown): v is string {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function limitLabel(key: string): string {
  return LIMIT_META[key]?.label ?? key;
}

function SectionHeading({
  icon: Icon,
  title,
  sub,
  desc,
  action,
}: {
  icon: typeof Zap;
  title: string;
  sub: string;
  desc: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-500 ring-1 ring-amber-400/25">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold leading-tight">
            {title} <span className="text-[11px] font-normal text-muted-foreground">· {sub}</span>
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'good' | 'bad';
}) {
  const valueTone =
    tone === 'good' ? 'text-emerald-500' : tone === 'bad' ? 'text-red-500' : 'text-foreground';
  return (
    <Card className="border-border/60">
      <CardContent className="p-3.5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold mt-1 tabular-nums ${valueTone}`}>{value}</p>
        {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SecurityPage() {
  const { hasPermission } = useAdminAuth();
  const canWrite = hasPermission('security.write');

  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyFlag, setBusyFlag] = useState<string | null>(null);
  const [ackingId, setAckingId] = useState<string | null>(null);

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
    // Load unfiltered; DataList performs status / severity / date filtering client-side.
    void listSecurityAlerts()
      .then((r) => setAlerts(r.rows ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : '加载告警失败'))
      .finally(() => setAlertsLoading(false));
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const flags = useMemo(() => mergeFlags(overview?.pauseFlags ?? []), [overview]);
  const solvency = overview?.solvency;
  const limits = overview?.limits ?? {};
  const alertCounts = overview?.alertCounts;
  const pausedCount = flags.filter((f) => f.paused).length;

  const handleToggle = async (flag: PauseFlag, next: boolean) => {
    if (!canWrite || busyFlag) return;
    const name = FLAG_META[flag.flag]?.label ?? flag.flag;
    if (next) {
      // Turning ON = pause (single-admin, immediate).
      const reason = window.prompt(`暂停「${name}」的原因：`);
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
      // Turning OFF = unpause (maker-checker). Do NOT flip optimistically.
      const reason = window.prompt(`恢复「${name}」的原因：`);
      if (reason == null || !reason.trim()) return;
      setBusyFlag(flag.flag);
      try {
        await unpause(flag.flag, reason.trim());
        toast.success('已提交审批，需第二位管理员在审批中心批准');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '提交失败');
      } finally {
        setBusyFlag(null);
      }
    }
  };

  const handleAck = async (id: string) => {
    if (!canWrite) return;
    setAckingId(id);
    try {
      await ackAlert(id);
      toast.success('已确认');
      loadAlerts();
      loadOverview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '确认失败');
    } finally {
      setAckingId(null);
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

  // -- Alerts DataList config ------------------------------------------------

  const alertColumns: DataListColumn<SecurityAlert>[] = useMemo(
    () => [
      {
        key: 'severity',
        label: '级别',
        render: (a) => (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={SEVERITY_STYLE[a.severity] ?? ''}>
              {a.severity}
            </Badge>
            <span className="text-[11px] text-muted-foreground md:hidden">
              {SEVERITY_HINT[a.severity]}
            </span>
          </div>
        ),
      },
      {
        key: 'rule_id',
        label: '规则',
        render: (a) => <span className="font-mono text-xs break-all">{a.rule_id}</span>,
      },
      {
        key: 'title',
        label: '标题',
        render: (a) => <span className="text-sm">{a.title ?? '—'}</span>,
      },
      {
        key: 'created_at',
        label: '时间',
        sortable: true,
        render: (a) => <span className="text-xs tabular-nums">{fmtTs(a.created_at)}</span>,
      },
      {
        key: 'status',
        label: '状态',
        render: (a) => (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={ALERT_STATUS_STYLE[a.status] ?? ''}>
              {ALERT_STATUS_LABEL[a.status] ?? a.status}
            </Badge>
            {a.auto_paused && (
              <Badge
                variant="outline"
                className="bg-amber-500/15 text-amber-600 border-amber-500/40"
              >
                自动熔断
              </Badge>
            )}
          </div>
        ),
      },
      {
        key: 'action',
        label: '操作',
        className: 'text-right',
        render: (a) =>
          a.status === 'open' && canWrite ? (
            <Button
              size="sm"
              variant="outline"
              disabled={ackingId === a.id}
              onClick={(e) => {
                e.stopPropagation();
                void handleAck(a.id);
              }}
            >
              {ackingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '确认'}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, ackingId],
  );

  const renderAlertDetail = (a: SecurityAlert) => {
    let detailStr = '';
    if (a.detail != null) {
      try {
        detailStr = JSON.stringify(a.detail, null, 2);
      } catch {
        detailStr = String(a.detail);
      }
    }
    return (
      <div className="space-y-3 p-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <Field label="规则 ID" value={<span className="font-mono">{a.rule_id}</span>} />
          <Field label="级别" value={`${a.severity} · ${SEVERITY_HINT[a.severity] ?? ''}`} />
          <Field
            label="关联对象"
            value={
              a.entity_id ? (
                isLikelyAddress(a.entity_id) ? (
                  <AddressChip address={a.entity_id} variant="compact" />
                ) : (
                  <span className="font-mono break-all">
                    {a.entity_type ? `${a.entity_type}:` : ''}
                    {a.entity_id}
                  </span>
                )
              ) : (
                '—'
              )
            }
          />
          <Field label="触发时间" value={<span className="tabular-nums">{fmtTs(a.created_at)}</span>} />
          <Field
            label="确认人"
            value={
              a.acknowledged_by ? (
                <span className="font-mono break-all">{a.acknowledged_by}</span>
              ) : (
                '未确认'
              )
            }
          />
          <Field
            label="确认时间"
            value={<span className="tabular-nums">{fmtTs(a.acknowledged_at)}</span>}
          />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            告警详情 · detail
          </p>
          {detailStr ? (
            <pre className="max-h-72 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words">
              {detailStr}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">无附加详情</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <PageShell
      title="安全中心"
      subtitle="熔断开关、偿付率、风控限额与安全告警 — Security Center"
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            loadOverview();
            loadAlerts();
          }}
          disabled={loading || alertsLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading || alertsLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* ---------------------------------------------------------------- */}
          {/* 1. Circuit breakers                                              */}
          {/* ---------------------------------------------------------------- */}
          <section className="space-y-3">
            <SectionHeading
              icon={Zap}
              title="熔断开关"
              sub="Circuit Breakers"
              desc="按业务域即时冻结/恢复关键操作。暂停立即生效（需填原因）；恢复为双人复核，提交后需第二位管理员在审批中心批准。"
              action={
                <Badge
                  variant="outline"
                  className={
                    pausedCount > 0
                      ? 'bg-red-500/15 text-red-500 border-red-500/40'
                      : 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40'
                  }
                >
                  {pausedCount > 0 ? `${pausedCount} 项已暂停` : '全部正常运行'}
                </Badge>
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {flags.map((f) => {
                const meta = FLAG_META[f.flag] ?? {
                  label: f.flag,
                  sub: '',
                  icon: Lock,
                  effect: '',
                  autoTrigger: '',
                };
                const Icon = meta.icon;
                const busy = busyFlag === f.flag;
                return (
                  <Card
                    key={f.flag}
                    className={`border-border/60 transition-colors ${
                      f.paused ? 'border-red-500/40 bg-red-500/[0.03]' : ''
                    }`}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span
                            className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${
                              f.paused
                                ? 'bg-red-500/10 text-red-500 ring-red-500/25'
                                : 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/25'
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-bold">{meta.label}</span>
                              <span className="text-[10px] text-muted-foreground">{meta.sub}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              {f.paused ? (
                                <Badge
                                  variant="outline"
                                  className="bg-red-500/15 text-red-500 border-red-500/40"
                                >
                                  已暂停
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-500/15 text-emerald-600 border-emerald-500/40"
                                >
                                  正常
                                </Badge>
                              )}
                              {f.auto_paused && (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-500/15 text-amber-600 border-amber-500/40"
                                >
                                  自动熔断
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                          <Switch
                            checked={f.paused}
                            disabled={!canWrite || busy}
                            onCheckedChange={(v) => void handleToggle(f, v)}
                            aria-label={`toggle ${f.flag}`}
                          />
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {meta.effect}
                      </p>
                      <p className="flex items-start gap-1 text-[11px] text-amber-600/90 leading-relaxed">
                        <Info className="h-3 w-3 mt-0.5 shrink-0" />
                        {meta.autoTrigger}
                      </p>

                      {(f.reason || f.updated_at) && (
                        <div className="rounded-lg bg-muted/40 px-2.5 py-2 space-y-0.5">
                          {f.reason && (
                            <p className="text-[11px] text-foreground/80 break-words">
                              原因：{f.reason}
                            </p>
                          )}
                          {f.updated_at && (
                            <p className="text-[10px] text-muted-foreground tabular-nums">
                              更新于 {fmtTs(f.updated_at)}
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {!canWrite && (
              <p className="text-[11px] text-muted-foreground">
                只读模式：暂停 / 恢复需要 <span className="font-mono">security.write</span> 权限。
              </p>
            )}
          </section>

          <Separator />

          {/* ---------------------------------------------------------------- */}
          {/* 2. Solvency                                                      */}
          {/* ---------------------------------------------------------------- */}
          <section className="space-y-3">
            <SectionHeading
              icon={ShieldCheck}
              title="偿付率 / 储备"
              sub="Solvency"
              desc="衡量闪兑储备能否覆盖用户负债。偿付率 = 闪兑储备 ÷ 负债；低于最低阈值将触发闪兑自动熔断。"
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="闪兑储备"
                value={solvency ? `$${fmtUsd(solvency.flashSwapReserveUsdt)}` : '—'}
                sub="USDT 可用储备"
              />
              <StatCard
                label="用户负债"
                value={solvency ? `$${fmtUsd(solvency.liabilityUsdt)}` : '—'}
                sub="UD3 折算负债"
              />
              <StatCard
                label="偿付率"
                value={solvency ? `${(solvency.ratio * 100).toFixed(1)}%` : '—'}
                tone={solvency ? (solvency.healthy ? 'good' : 'bad') : 'default'}
                sub={
                  solvency
                    ? solvency.ratio >= 1
                      ? '储备高于负债'
                      : '储备低于负债'
                    : undefined
                }
              />
              <Card className="border-border/60">
                <CardContent className="p-3.5 flex flex-col justify-between h-full">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    健康状态
                  </p>
                  {solvency ? (
                    solvency.healthy ? (
                      <Badge
                        variant="outline"
                        className="mt-1 w-fit bg-emerald-500/15 text-emerald-600 border-emerald-500/40"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 mr-1" /> 健康
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="mt-1 w-fit bg-red-500/15 text-red-500 border-red-500/40"
                      >
                        <ShieldAlert className="h-3.5 w-3.5 mr-1" /> 风险
                      </Badge>
                    )
                  ) : (
                    <p className="text-lg font-bold mt-1">—</p>
                  )}
                </CardContent>
              </Card>
            </div>
            {solvency && (
              <Card className="border-border/60">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">偿付率健康度</span>
                    <span
                      className={`font-bold tabular-nums ${
                        solvency.healthy ? 'text-emerald-500' : 'text-red-500'
                      }`}
                    >
                      {(solvency.ratio * 100).toFixed(1)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.max(0, Math.min(100, solvency.ratio * 100))}
                    className={solvency.healthy ? '' : '[&>div]:bg-red-500'}
                  />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {solvency.healthy
                      ? '偿付率处于安全区间，闪兑与提现正常运行。'
                      : '偿付率低于安全阈值，闪兑可能已自动熔断，请核查储备与负债。'}
                    100% 表示储备恰好覆盖全部负债。
                  </p>
                </CardContent>
              </Card>
            )}
          </section>

          <Separator />

          {/* ---------------------------------------------------------------- */}
          {/* 3. Risk limits                                                   */}
          {/* ---------------------------------------------------------------- */}
          <section className="space-y-3">
            <SectionHeading
              icon={Lock}
              title="风控限额"
              sub="Risk Limits"
              desc="闪兑、提现与奖励发放的额度护栏。修改限额为双人复核，提交后需第二位管理员审批后生效。"
              action={
                canWrite && Object.keys(limits).length > 0 ? (
                  <Button size="sm" variant="outline" onClick={openLimitsDialog}>
                    编辑
                  </Button>
                ) : undefined
              }
            />
            {Object.keys(limits).length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  暂无限额配置
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {Object.entries(limits).map(([k, v]) => {
                  const meta = LIMIT_META[k];
                  return (
                    <Card key={k} className="border-border/60">
                      <CardContent className="p-3.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-xs font-semibold">{meta?.label ?? k}</span>
                          <span className="text-sm font-bold tabular-nums shrink-0">
                            {v == null || v === '' ? '—' : String(v)}
                            {meta?.unit && v != null && v !== '' && (
                              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                {meta.unit}
                              </span>
                            )}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] font-mono text-muted-foreground break-all">
                          {k}
                        </p>
                        {meta?.hint && (
                          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                            {meta.hint}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <Separator />

          {/* ---------------------------------------------------------------- */}
          {/* 4. Alerts                                                        */}
          {/* ---------------------------------------------------------------- */}
          <section className="space-y-3">
            <SectionHeading
              icon={ShieldAlert}
              title="安全告警"
              sub="Alerts"
              desc="风控规则触发的事件流。按级别 P0（致命）→ P3（提示）分级，确认后转入已确认状态。展开每行可查看完整 detail。"
            />

            {/* Severity summary strip */}
            {alertCounts && (
              <div className="grid grid-cols-4 gap-2">
                {(['P0', 'P1', 'P2', 'P3'] as const).map((sev) => (
                  <Card key={sev} className="border-border/60">
                    <CardContent className="p-2.5 text-center">
                      <Badge variant="outline" className={`${SEVERITY_STYLE[sev]} mb-1`}>
                        {sev}
                      </Badge>
                      <p className="text-lg font-bold tabular-nums leading-none">
                        {alertCounts[sev] ?? 0}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{SEVERITY_HINT[sev]}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <DataList<SecurityAlert>
              columns={alertColumns}
              rows={alerts}
              getRowId={(a) => a.id}
              loading={alertsLoading}
              searchKeys={['rule_id', 'title', 'entity_id']}
              searchPlaceholder="搜索规则 / 标题 / 对象…"
              dateKey="created_at"
              filters={[
                {
                  key: 'status',
                  label: '状态',
                  options: [
                    { value: 'open', label: '待处理' },
                    { value: 'ack', label: '已确认' },
                    { value: 'resolved', label: '已解决' },
                  ],
                },
                {
                  key: 'severity',
                  label: '级别',
                  options: [
                    { value: 'P0', label: 'P0 · 致命' },
                    { value: 'P1', label: 'P1 · 严重' },
                    { value: 'P2', label: 'P2 · 警告' },
                    { value: 'P3', label: 'P3 · 提示' },
                  ],
                },
              ]}
              renderExpanded={renderAlertDetail}
              emptyText="暂无告警"
              pageSize={20}
            />
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Risk-limits edit dialog                                            */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={limitsOpen} onOpenChange={setLimitsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑风控限额</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {Object.keys(limitsDraft).length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无可编辑项</p>
            ) : (
              Object.entries(limitsDraft).map(([k, v]) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={`limit-${k}`} className="text-xs">
                    {limitLabel(k)}
                  </Label>
                  <Input
                    id={`limit-${k}`}
                    value={v}
                    onChange={(e) => setLimitsDraft((d) => ({ ...d, [k]: e.target.value }))}
                    className="text-sm"
                  />
                  <p className="text-[10px] font-mono text-muted-foreground break-all">
                    {k}
                    {LIMIT_META[k]?.hint ? ` · ${LIMIT_META[k]?.hint}` : ''}
                  </p>
                </div>
              ))
            )}
            <div className="flex items-start gap-1.5 rounded-lg bg-amber-400/10 px-2.5 py-2 text-[11px] text-amber-600 leading-relaxed">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              修改限额为双人复核操作，提交后需第二位管理员审批后生效。
            </div>
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

// Small labelled value used inside the alert detail panel.
function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">
        {label}
      </span>
      <span className="text-xs text-right sm:text-left sm:mt-0.5 block min-w-0 break-words">
        {value}
      </span>
    </div>
  );
}
