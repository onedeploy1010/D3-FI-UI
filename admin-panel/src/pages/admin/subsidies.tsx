import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Check,
  CircleDot,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  Settings2,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
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
      <div className="rounded-xl border border-border/60 bg-card/40 px-3 py-4">
        <WorkflowStepper status={t.status} />
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
          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Paperclip className="h-3.5 w-3.5" /> 票据附件
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
                      className="block aspect-square overflow-hidden rounded-lg border bg-muted/30"
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
            <div className="space-y-1.5">
              <p className="text-xs font-semibold">历史补贴申请</p>
              <div className="rounded-lg border border-border/60 divide-y divide-border/50">
                {detail.priorTickets.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground"
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
          <div className="max-h-[38vh] space-y-2 overflow-y-auto rounded-lg border border-border/60 bg-muted/10 p-3">
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
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">工单处理</p>
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

// ---- Page ---------------------------------------------------------------

export default function SubsidiesPage() {
  const { hasPermission } = useAdminAuth();
  const canWrite = hasPermission('subsidies.write');
  const isDesktop = useIsDesktop();

  const [rows, setRows] = useState<SubsidyTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [settings, setSettings] = useState({ partnerSubsidyRatePct: 10, marketSubsidyRatePct: 5 });
  const [settingsDraft, setSettingsDraft] = useState({ partnerSubsidyRatePct: '10', marketSubsidyRatePct: '5' });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadSettings = useCallback(() => {
    void adminFetch<{ ok: boolean; settings: { partnerSubsidyRatePct: number; marketSubsidyRatePct: number } }>(
      '/program-settings',
    )
      .then((r) => {
        setSettings(r.settings);
        setSettingsDraft({
          partnerSubsidyRatePct: String(r.settings.partnerSubsidyRatePct),
          marketSubsidyRatePct: String(r.settings.marketSubsidyRatePct),
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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

  const saveSettings = async () => {
    if (!canWrite) return;
    setSettingsSaving(true);
    try {
      const r = await adminFetch<{ ok: boolean; settings: typeof settings }>('/program-settings', {
        method: 'PATCH',
        body: JSON.stringify({
          partnerSubsidyRatePct: Number(settingsDraft.partnerSubsidyRatePct),
          marketSubsidyRatePct: Number(settingsDraft.marketSubsidyRatePct),
        }),
      });
      setSettings(r.settings);
      setSettingsDraft({
        partnerSubsidyRatePct: String(r.settings.partnerSubsidyRatePct),
        marketSubsidyRatePct: String(r.settings.marketSubsidyRatePct),
      });
      toast.success('已保存比例');
      setSettingsOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存设置失败');
    } finally {
      setSettingsSaving(false);
    }
  };

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
    <PageShell
      title="补贴工单"
      subtitle="合伙人补贴、市场补贴与市场领袖申请 — Helpdesk"
      actions={
        canWrite ? (
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" /> 可借比例
          </Button>
        ) : undefined
      }
    >
      <Card className="mb-4 border-border/60 bg-card/40">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-sm">
          <span className="text-muted-foreground">当前生效比例</span>
          <span>
            合伙人补贴 <span className="font-semibold text-foreground">{settings.partnerSubsidyRatePct}%</span>
          </span>
          <span>
            市场补贴 <span className="font-semibold text-foreground">{settings.marketSubsidyRatePct}%</span>
          </span>
        </CardContent>
      </Card>

      <DataList<SubsidyTicket>
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        searchKeys={['wallet_address', 'id']}
        searchPlaceholder="搜索钱包 / 工单号…"
        filters={filters}
        dateKey="applied_at"
        loading={loading}
        onRowClick={(r) => openTicket(r.id)}
        emptyText="暂无补贴工单"
      />

      {/* Detail: Dialog on desktop, Drawer on mobile */}
      {isDesktop ? (
        <Dialog open={Boolean(selectedId)} onOpenChange={(o) => !o && closeTicket()}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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

      {/* Program settings (可借比例) */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>可借比例设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">合伙人补贴 (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={settingsDraft.partnerSubsidyRatePct}
                  onChange={(e) => setSettingsDraft((s) => ({ ...s, partnerSubsidyRatePct: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">市场补贴 (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={settingsDraft.marketSubsidyRatePct}
                  onChange={(e) => setSettingsDraft((s) => ({ ...s, marketSubsidyRatePct: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              当前生效：合伙人 {settings.partnerSubsidyRatePct}% · 市场 {settings.marketSubsidyRatePct}%
            </p>
            {canWrite && (
              <Button disabled={settingsSaving} onClick={() => void saveSettings()}>
                {settingsSaving ? '保存中…' : '保存比例'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
