import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useSearch } from 'wouter';
import { toast } from 'sonner';
import {
  Check,
  CircleDot,
  Headphones,
  Loader2,
  MessageSquare,
  Paperclip,
  RotateCw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { PageShell } from './page-shell';
import { adminFetch, type SubsidyMessage, type SubsidyTicket } from '@/lib/adminApi';
import { fmtUsd } from '@/lib/supabase';
import { useAdminAuth } from '@/contexts/admin-auth';
import { cn } from '@/lib/utils';
import { AddressChip } from '@/components/address-chip';
import { DataList, type DataListColumn } from '@/components/data-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

const KIND_LABEL: Record<string, string> = {
  partner_subsidy: '合伙人补贴',
  market_subsidy: '市场补贴',
  market_leader: '市场领袖开通',
};

const STATUS_LABEL: Record<string, string> = {
  open: '待受理',
  pending_info: '待补充资料',
  under_review: '审核中',
  approved: '已通过',
  rejected: '已拒绝',
  paid: '已发放',
  closed: '已关闭',
};

const STATUS_STYLE: Record<string, string> = {
  open: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  under_review: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  pending_info: 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  approved: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  paid: 'border-emerald-600/50 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  rejected: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
  closed: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
};

const TYPE_LABEL: Record<string, string> = {
  reserve: '预备金',
  reimbursement: '报销',
};

type TicketDetail = {
  ticket: SubsidyTicket & {
    application_type?: string | null;
    receipt_paths?: string[];
  };
  messages: SubsidyMessage[];
  teamStats: {
    personalPerformanceUsd: number;
    teamPerformanceUsd: number;
    dailyNewPerformanceUsd: number;
  };
  priorTickets: Array<{ id: string; kind: string; amount_usd: number | null; status: string; applied_at: string }>;
  receiptUrls?: Array<{ path: string; signedUrl: string }>;
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_STYLE[status])}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

// ---- Workflow stepper ---------------------------------------------------

type StepState = 'done' | 'current' | 'rejected' | 'todo';

const STEP_DEFS: Array<{ key: string; label: string }> = [
  { key: 'submitted', label: '提交' },
  { key: 'review', label: '审核' },
  { key: 'decision', label: '批准/驳回' },
  { key: 'paid', label: '已支付' },
];

function stepStates(status: string): StepState[] {
  switch (status) {
    case 'paid':
      return ['done', 'done', 'done', 'done'];
    case 'approved':
      return ['done', 'done', 'done', 'current'];
    case 'rejected':
      return ['done', 'done', 'rejected', 'todo'];
    case 'under_review':
    case 'open':
      return ['done', 'current', 'todo', 'todo'];
    case 'pending_info':
      return ['done', 'current', 'todo', 'todo'];
    case 'closed':
      return ['done', 'done', 'todo', 'todo'];
    default:
      return ['done', 'current', 'todo', 'todo'];
  }
}

function WorkflowStepper({ status }: { status: string }) {
  const states = stepStates(status);
  return (
    <div className="flex items-center">
      {STEP_DEFS.map((step, i) => {
        const state = states[i];
        const isRejected = state === 'rejected';
        const label =
          i === 2 && isRejected ? '已驳回' : i === 2 && status === 'approved' ? '已批准' : step.label;
        return (
          <div key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors',
                  state === 'done' && 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                  state === 'current' && 'border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400',
                  state === 'rejected' && 'border-red-500/50 bg-red-500/15 text-red-600 dark:text-red-400',
                  state === 'todo' && 'border-border bg-muted/40 text-muted-foreground',
                )}
              >
                {state === 'done' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : state === 'rejected' ? (
                  <X className="h-3.5 w-3.5" />
                ) : state === 'current' ? (
                  <CircleDot className="h-3.5 w-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  'whitespace-nowrap text-[10px]',
                  state === 'todo' ? 'text-muted-foreground' : 'font-medium text-foreground',
                )}
              >
                {label}
              </span>
            </div>
            {i < STEP_DEFS.length - 1 && (
              <div
                className={cn(
                  'mx-1 mb-4 h-px flex-1',
                  states[i + 1] === 'todo' ? 'bg-border' : 'bg-emerald-500/40',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Detail body --------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl cell-inset p-3 space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="text-sm font-bold text-foreground [&_*]:font-normal">{value}</div>
    </div>
  );
}

function TicketDetailBody({
  detail,
  canWrite,
  submitting,
  reply,
  onReplyChange,
  onSendMessage,
  onUpdateStatus,
}: {
  detail: TicketDetail;
  canWrite: boolean;
  submitting: boolean;
  reply: string;
  onReplyChange: (v: string) => void;
  onSendMessage: (requestInfo: boolean) => void;
  onUpdateStatus: (status: string) => void;
}) {
  const t = detail.ticket;
  return (
    <div className="space-y-4">
      <div className="rounded-xl cell-inset px-3 py-4 overflow-x-auto">
        <div className="min-w-[280px]">
          <WorkflowStepper status={t.status} />
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="info">详情</TabsTrigger>
          <TabsTrigger value="thread" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            沟通{detail.messages.length ? ` (${detail.messages.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-3 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <InfoRow label="类型" value={KIND_LABEL[t.kind] ?? t.kind} />
            <InfoRow label="状态" value={<StatusBadge status={t.status} />} />
            <InfoRow
              label="金额"
              value={t.amount_usd != null ? `$${fmtUsd(t.amount_usd)}` : '—'}
            />
            {t.application_type && (
              <InfoRow
                label="申请类型"
                value={TYPE_LABEL[t.application_type] ?? t.application_type}
              />
            )}
            <div className="col-span-2">
              <InfoRow label="钱包" value={<AddressChip address={t.wallet_address} variant="compact" />} />
            </div>
            <InfoRow label="伞下业绩" value={`$${fmtUsd(detail.teamStats.teamPerformanceUsd)}`} />
            <InfoRow label="日新增业绩" value={`$${fmtUsd(detail.teamStats.dailyNewPerformanceUsd)}`} />
            <InfoRow label="个人业绩" value={`$${fmtUsd(detail.teamStats.personalPerformanceUsd)}`} />
            <InfoRow label="申请时间" value={t.applied_at?.slice(0, 16) ?? '—'} />
            <div className="col-span-2">
              <InfoRow label="申请说明" value={t.purpose || '—'} />
            </div>
          </div>

          {(detail.receiptUrls?.length ?? 0) > 0 && (
            <div className="rounded-xl cell-inset p-3 space-y-2">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5 text-primary" /> 票据附件
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {detail.receiptUrls!.map((item) => {
                  const isVideo = /\.(mp4|mov|webm)$/i.test(item.path);
                  return (
                    <a
                      key={item.path}
                      href={item.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted/30"
                    >
                      {isVideo ? (
                        <div className="flex h-full items-center justify-center p-2 text-center text-[11px] text-muted-foreground">
                          视频 · 点击查看
                        </div>
                      ) : (
                        <img src={item.signedUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {detail.priorTickets.length > 0 && (
            <div className="rounded-xl cell-inset p-3 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">历史补贴申请</p>
              <div className="rounded-lg border border-border/50 divide-y divide-border/50 overflow-hidden">
                {detail.priorTickets.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground"
                  >
                    <span>{KIND_LABEL[p.kind] ?? p.kind}</span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={p.status} />
                      <span>{p.applied_at?.slice(0, 10)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="thread" className="mt-3 space-y-3">
          <div className="max-h-[38vh] space-y-2 overflow-y-auto rounded-xl cell-inset p-3">
            {detail.messages.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">暂无沟通记录</p>
            ) : (
              detail.messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'rounded-lg p-2 text-sm',
                    m.author_type === 'admin'
                      ? 'ml-6 bg-[#E0568F]/10'
                      : m.author_type === 'system'
                        ? 'bg-muted/50 text-xs text-muted-foreground'
                        : 'mr-6 bg-muted',
                  )}
                >
                  <div className="mb-1 text-[10px] text-muted-foreground">
                    {m.author_name ?? m.author_type} · {m.created_at?.slice(0, 16)}
                  </div>
                  {m.body}
                </div>
              ))
            )}
          </div>

          {canWrite && (
            <div className="space-y-2">
              <Textarea
                placeholder="回复申请人或要求补充资料…"
                value={reply}
                onChange={(e) => onReplyChange(e.target.value)}
                rows={3}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={submitting || !reply.trim()}
                  onClick={() => onSendMessage(false)}
                >
                  <Send className="h-3.5 w-3.5" /> 留言
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={submitting || !reply.trim()}
                  onClick={() => onSendMessage(true)}
                >
                  要求补充资料
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {canWrite && (
        <>
          <Separator />
          <div className="rounded-xl cell-inset p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">工单处理</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                disabled={submitting}
                onClick={() => onUpdateStatus('approved')}
              >
                批准（提交审批）
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
                disabled={submitting}
                onClick={() => onUpdateStatus('paid')}
              >
                标记已发放（提交审批）
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={submitting}
                onClick={() => onUpdateStatus('rejected')}
              >
                驳回
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              批准与发放为出款操作，需第二位管理员在审批中心复核。
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ---- 多签审批 (maker-checker approval queue) ------------------------------

/**
 * Row from GET /approvals — raw `admin_action_approvals` rows (snake_case).
 * `requiredApprovals` / `approvalsCount` / `designatedApprovers` are optional
 * multi-sig fields the backend may add later; render when present.
 */
type ApprovalRow = {
  id: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  payload?: Record<string, unknown> | null;
  status: string;
  requested_by?: string | null;
  requested_at?: string | null;
  requiredApprovals?: number;
  approvalsCount?: number;
  designatedApprovers?: string[];
};

const ACTION_LABEL: Record<string, string> = {
  'program_settings.update': '补贴比例修改',
  'subsidy_ticket.patch': '补贴工单审批',
  'security.unpause': '安全熔断恢复',
  'risk_limits.update': '风控限额修改',
  'member.set_leader': '市场领袖变更',
};

function payloadSummary(p?: Record<string, unknown> | null): string {
  if (!p || Object.keys(p).length === 0) return '—';
  const s = Object.entries(p)
    .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

function ApprovalsTab({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Approval id currently being approved/rejected (disables its buttons). */
  const [acting, setActing] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void adminFetch<{ ok: boolean; rows: ApprovalRow[] }>('/approvals')
      .then((r) => setRows(r.rows))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = useCallback(
    async (row: ApprovalRow) => {
      setActing(row.id);
      try {
        await adminFetch(`/approvals/${row.id}/approve`, { method: 'POST' });
        toast.success('已批准并执行');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '批准失败');
      } finally {
        setActing(null);
        load();
      }
    },
    [load],
  );

  const reject = async () => {
    if (!rejectTarget) return;
    setActing(rejectTarget.id);
    try {
      await adminFetch(`/approvals/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: JSON.stringify(rejectReason.trim() ? { reason: rejectReason.trim() } : {}),
      });
      toast.success('已驳回');
      setRejectTarget(null);
      setRejectReason('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '驳回失败');
    } finally {
      setActing(null);
      load();
    }
  };

  const columns = useMemo<DataListColumn<ApprovalRow>[]>(
    () => [
      {
        key: 'action',
        label: '操作类型',
        render: (r) => <span className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</span>,
      },
      {
        key: 'requested_by',
        label: '发起人',
        mobileHide: true,
        render: (r) =>
          r.requested_by ? (
            <span className="font-mono text-xs">{r.requested_by.slice(0, 8)}…</span>
          ) : (
            '—'
          ),
      },
      {
        key: 'payload',
        label: '内容摘要',
        mobileHide: true,
        className: 'max-w-[240px]',
        render: (r) => (
          <span className="block truncate text-xs text-muted-foreground">
            {payloadSummary(r.payload)}
          </span>
        ),
      },
      {
        key: 'progress',
        label: '进度',
        render: (r) =>
          r.requiredApprovals != null ? (
            <Badge variant="outline" className={cn('font-medium', STATUS_STYLE.open)}>
              {r.approvalsCount ?? 0}/{r.requiredApprovals} 已批准
            </Badge>
          ) : (
            <Badge variant="outline" className={cn('font-medium', STATUS_STYLE.open)}>
              待审批
            </Badge>
          ),
      },
      {
        key: 'requested_at',
        label: '发起时间',
        sortable: true,
        render: (r) => (
          <span className="text-xs">{r.requested_at?.slice(0, 16).replace('T', ' ') ?? '—'}</span>
        ),
      },
      ...(canWrite
        ? [
            {
              key: 'actions',
              label: '操作',
              render: (r: ApprovalRow) => (
                <div className="flex justify-end gap-1.5 md:justify-start">
                  <Button
                    size="sm"
                    className="h-7 gap-1 bg-emerald-600 text-white hover:bg-emerald-600/90"
                    disabled={acting === r.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void approve(r);
                    }}
                  >
                    {acting === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    批准
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 gap-1"
                    disabled={acting === r.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRejectTarget(r);
                    }}
                  >
                    <X className="h-3.5 w-3.5" /> 驳回
                  </Button>
                </div>
              ),
            } satisfies DataListColumn<ApprovalRow>,
          ]
        : []),
    ],
    [canWrite, acting, approve],
  );

  const renderExpanded = useCallback(
    (r: ApprovalRow) => (
      <div className="space-y-2 py-1 text-xs">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-card/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">目标</p>
            <p className="mt-1 break-all font-mono">
              {r.target_type ?? '—'} · {r.target_id ?? '—'}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">发起人</p>
            <p className="mt-1 break-all font-mono">{r.requested_by ?? '—'}</p>
          </div>
        </div>
        {r.designatedApprovers?.length ? (
          <div className="rounded-lg border border-border/60 bg-card/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">指定审批人</p>
            <p className="mt-1 break-all font-mono">{r.designatedApprovers.join('、')}</p>
          </div>
        ) : null}
        <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted/30 p-2.5 font-mono text-[11px]">
          {JSON.stringify(r.payload ?? {}, null, 2)}
        </pre>
      </div>
    ),
    [],
  );

  return (
    <>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <DataList<ApprovalRow>
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        searchKeys={['id', 'action', 'requested_by', 'target_id']}
        searchPlaceholder="搜索审批单号 / 操作 / 发起人…"
        dateKey="requested_at"
        renderExpanded={renderExpanded}
        loading={loading}
        emptyText="暂无待审批事项"
        toolbarRight={
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={load} disabled={loading}>
            <RotateCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            刷新
          </Button>
        }
      />
      <p className="mt-3 text-[11px] text-muted-foreground">
        出款类操作需第二位管理员复核后才会执行；发起人不能批准自己提交的审批。
      </p>

      {/* 驳回原因 */}
      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>驳回审批</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              确认驳回「{rejectTarget ? ACTION_LABEL[rejectTarget.action] ?? rejectTarget.action : ''}」？
              可填写驳回原因（可选）。
            </p>
            <Textarea
              placeholder="驳回原因（可选）"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={acting === rejectTarget?.id}
                onClick={() => void reject()}
              >
                确认驳回
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Page ---------------------------------------------------------------

export default function SubsidiesPage() {
  const { hasPermission } = useAdminAuth();
  const canWrite = hasPermission('subsidies.write');
  const isDesktop = useIsDesktop();

  const [rows, setRows] = useState<SubsidyTicket[]>([]);
  const [loading, setLoading] = useState(true);
  // Optional ?wallet= filter (jumped in from a member/partner detail dialog).
  const search = useSearch();
  const [, navigate] = useLocation();
  const walletFilter = useMemo(() => new URLSearchParams(search).get('wallet') ?? '', [search]);
  const visibleRows = useMemo(
    () =>
      walletFilter
        ? rows.filter((r) => (r.wallet_address ?? '').toLowerCase() === walletFilter.toLowerCase())
        : rows,
    [rows, walletFilter],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 比例统一管理已移除 — 补贴比例改为在会员管理逐会员开通/调整
  // (合伙人默认 10%, 其他会员默认关闭)。

  // 会员多选筛选 + 跟随筛选结果的统计。
  const [walletPicks, setWalletPicks] = useState<Set<string>>(() => new Set());
  const [statsRows, setStatsRows] = useState<SubsidyTicket[]>([]);

  const loadList = useCallback(() => {
    setLoading(true);
    void adminFetch<{ ok: boolean; rows: SubsidyTicket[] }>('/subsidy-tickets')
      .then((r) => setRows(r.rows))
      .catch((e) => toast.error(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openTicket = useCallback((id: string) => {
    setSelectedId(id);
    setDetail(null);
    setReply('');
    void adminFetch<TicketDetail & { ok: boolean }>(`/subsidy-tickets/${id}`)
      .then((r) => setDetail(r))
      .catch((e) => toast.error(e instanceof Error ? e.message : '加载工单失败'));
  }, []);

  const closeTicket = () => {
    setSelectedId(null);
    setDetail(null);
  };

  const sendMessage = async (requestInfo: boolean) => {
    if (!selectedId || !reply.trim() || !canWrite) return;
    setSubmitting(true);
    try {
      await adminFetch(`/subsidy-tickets/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: reply.trim(), requestInfo }),
      });
      setReply('');
      toast.success(requestInfo ? '已要求补充资料' : '已留言');
      openTicket(selectedId);
      loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发送失败');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (status: string) => {
    if (!selectedId || !canWrite) return;
    // approve / pay authorize a payout → route through maker-checker approval.
    const makerChecker = status === 'approved' || status === 'paid';
    setSubmitting(true);
    try {
      await adminFetch(`/subsidy-tickets/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast.success(makerChecker ? '已提交审批，需第二位管理员复核' : '已驳回');
      openTicket(selectedId);
      loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 会员多选后的可见行 (在 ?wallet= 单选之上再叠加多选)。
  const pickedRows = useMemo(
    () =>
      walletPicks.size
        ? visibleRows.filter((r) => walletPicks.has((r.wallet_address ?? '').toLowerCase()))
        : visibleRows,
    [visibleRows, walletPicks],
  );

  // 会员选项 (按工单数排序) — 供多选筛选。
  const walletOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of visibleRows) {
      const k = (r.wallet_address ?? '').toLowerCase();
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [visibleRows]);

  // 统计跟随 DataList 的搜索/筛选/时间段结果 (statsRows) 汇总。
  const stats = useMemo(() => {
    const sum = (pred: (r: SubsidyTicket) => boolean) =>
      statsRows.filter(pred).reduce((s, r) => s + Number(r.amount_usd ?? 0), 0);
    const APPLYING = new Set(['open', 'pending_info', 'under_review']);
    return {
      count: statsRows.length,
      totalUsd: sum(() => true),
      applyingUsd: sum((r) => APPLYING.has(r.status)),
      approvedUsd: sum((r) => r.status === 'approved'),
      paidUsd: sum((r) => r.status === 'paid'),
    };
  }, [statsRows]);

  const columns = useMemo<DataListColumn<SubsidyTicket>[]>(
    () => [
      {
        key: 'kind',
        label: '类型',
        render: (r) => KIND_LABEL[r.kind] ?? r.kind,
      },
      {
        key: 'wallet_address',
        label: '申请人',
        render: (r) => <AddressChip address={r.wallet_address} variant="compact" />,
      },
      {
        key: 'amount_usd',
        label: '金额',
        sortable: true,
        render: (r) => (r.amount_usd != null ? `$${fmtUsd(r.amount_usd)}` : '—'),
      },
      {
        key: 'team_performance_usd',
        label: '伞下业绩',
        sortable: true,
        mobileHide: true,
        render: (r) => `$${fmtUsd(r.team_performance_usd)}`,
      },
      {
        key: 'daily_new_performance_usd',
        label: '日新增',
        sortable: true,
        mobileHide: true,
        render: (r) => `$${fmtUsd(r.daily_new_performance_usd)}`,
      },
      {
        key: 'status',
        label: '状态',
        render: (r) => <StatusBadge status={r.status} />,
      },
      {
        key: 'applied_at',
        label: '申请时间',
        sortable: true,
        render: (r) => <span className="text-xs">{r.applied_at?.slice(0, 16) ?? '—'}</span>,
      },
    ],
    [],
  );

  const filters = useMemo(
    () => [
      {
        key: 'status',
        label: '状态',
        options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'kind',
        label: '类型',
        options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
      },
    ],
    [],
  );

  const detailHeader = detail ? (
    <div className="flex items-center gap-2">
      <span>工单详情</span>
      <StatusBadge status={detail.ticket.status} />
    </div>
  ) : (
    '工单详情'
  );

  const detailBody = !detail ? (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  ) : (
    <TicketDetailBody
      detail={detail}
      canWrite={canWrite}
      submitting={submitting}
      reply={reply}
      onReplyChange={setReply}
      onSendMessage={(info) => void sendMessage(info)}
      onUpdateStatus={(s) => void updateStatus(s)}
    />
  );

  return (
    <PageShell title="事务管理" subtitle="补贴工单与多签审批 — Affairs">
      <Tabs defaultValue="tickets">
        <TabsList className="mb-4">
          <TabsTrigger value="tickets" className="gap-1.5">
            <Headphones className="h-3.5 w-3.5" /> 补贴工单
          </TabsTrigger>
          <TabsTrigger value="approvals" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> 多签审批
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tickets">
      {/* 统计 — 跟随下方列表当前的搜索/筛选/时间段/会员多选结果 */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
        <div className="rounded-xl cell-inset p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">工单数</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{stats.count}</p>
        </div>
        <div className="rounded-xl cell-inset p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">总申请金额</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-primary">${fmtUsd(stats.totalUsd)}</p>
        </div>
        <div className="rounded-xl cell-inset p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">申请中</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-amber-500">${fmtUsd(stats.applyingUsd)}</p>
        </div>
        <div className="rounded-xl cell-inset p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">已批准</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-sky-500">${fmtUsd(stats.approvedUsd)}</p>
        </div>
        <div className="rounded-xl cell-inset p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">已发放</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-emerald-500">${fmtUsd(stats.paidUsd)}</p>
        </div>
      </div>

      {/* 会员多选筛选 — 点选会员即筛出其全部工单,统计随之更新 */}
      {walletOptions.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">按会员筛选</span>
          {walletOptions.slice(0, 12).map(([w, n]) => {
            const on = walletPicks.has(w);
            return (
              <button
                key={w}
                type="button"
                onClick={() =>
                  setWalletPicks((prev) => {
                    const next = new Set(prev);
                    if (on) next.delete(w);
                    else next.add(w);
                    return next;
                  })
                }
                className={`rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  on
                    ? 'border-primary/60 bg-primary/15 text-primary'
                    : 'border-border/60 text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {w.slice(0, 6)}…{w.slice(-4)} · {n}
              </button>
            );
          })}
          {walletPicks.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-primary"
              onClick={() => setWalletPicks(new Set())}
            >
              清除多选 ({walletPicks.size})
            </Button>
          )}
        </div>
      )}

      {walletFilter && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs rounded-xl border border-primary/40 bg-primary/10 px-3 py-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">已筛选钱包</span>
          <span className="min-w-0 flex-1 font-mono truncate text-foreground">{walletFilter}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/subsidies')}
            className="shrink-0 text-primary"
          >
            <X className="h-3.5 w-3.5" /> 清除筛选
          </Button>
        </div>
      )}

      <DataList<SubsidyTicket>
        columns={columns}
        rows={pickedRows}
        getRowId={(r) => r.id}
        searchKeys={['wallet_address', 'id']}
        searchPlaceholder="搜索钱包 / 工单号…"
        filters={filters}
        dateKey="applied_at"
        loading={loading}
        onRowClick={(r) => openTicket(r.id)}
        onFilteredChange={setStatsRows}
        emptyText="暂无补贴工单"
      />
        </TabsContent>

        <TabsContent value="approvals">
          <ApprovalsTab canWrite={canWrite} />
        </TabsContent>
      </Tabs>

      {/* Detail: Dialog on desktop, Drawer on mobile */}
      {isDesktop ? (
        <Dialog open={Boolean(selectedId)} onOpenChange={(o) => !o && closeTicket()}>
          <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{detailHeader}</DialogTitle>
            </DialogHeader>
            {detailBody}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={Boolean(selectedId)} onOpenChange={(o) => !o && closeTicket()}>
          <DrawerContent className="max-h-[92vh]">
            <DrawerHeader className="text-left">
              <DrawerTitle>{detailHeader}</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">{detailBody}</div>
          </DrawerContent>
        </Drawer>
      )}

    </PageShell>
  );
}
