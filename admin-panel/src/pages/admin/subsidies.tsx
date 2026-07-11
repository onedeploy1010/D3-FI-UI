import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { PageShell } from './page-shell';
import { adminFetch, type SubsidyMessage, type SubsidyTicket } from '@/lib/adminApi';
import { shortAddr, fmtUsd } from '@/lib/supabase';
import { useAdminAuth } from '@/contexts/admin-auth';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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

const TYPE_LABEL: Record<string, string> = {
  reserve: '预备金',
  reimbursement: '报销',
};

export default function SubsidiesPage() {
  const [, setLocation] = useLocation();
  const { hasPermission } = useAdminAuth();
  const [rows, setRows] = useState<SubsidyTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState({ partnerSubsidyRatePct: 10, marketSubsidyRatePct: 5 });
  const [settingsDraft, setSettingsDraft] = useState({ partnerSubsidyRatePct: '10', marketSubsidyRatePct: '5' });
  const [settingsSaving, setSettingsSaving] = useState(false);

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
    const q = statusFilter === 'all' ? '' : `?status=${statusFilter}`;
    void adminFetch<{ ok: boolean; rows: SubsidyTicket[] }>(`/subsidy-tickets${q}`)
      .then((r) => setRows(r.rows))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openTicket = (id: string) => {
    setSelectedId(id);
    setDetail(null);
    void adminFetch<TicketDetail & { ok: boolean }>(`/subsidy-tickets/${id}`)
      .then((r) => setDetail(r))
      .catch((e) => setError(e instanceof Error ? e.message : '加载工单失败'));
  };

  const sendReply = async (requestInfo: boolean) => {
    if (!selectedId || !reply.trim() || !hasPermission('subsidies.write')) return;
    setSubmitting(true);
    try {
      await adminFetch(`/subsidy-tickets/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: reply.trim(), requestInfo }),
      });
      setReply('');
      openTicket(selectedId);
      loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
    } finally {
      setSubmitting(false);
    }
  };

  const saveSettings = async () => {
    if (!hasPermission('subsidies.write')) return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存设置失败');
    } finally {
      setSettingsSaving(false);
    }
  };

  const updateStatus = async (status: string) => {
    if (!selectedId || !hasPermission('subsidies.write')) return;
    setSubmitting(true);
    try {
      await adminFetch(`/subsidy-tickets/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      openTicket(selectedId);
      loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title="补贴工单" subtitle="合伙人补贴、市场补贴与市场领袖申请 — Helpdesk">
      <div className="rounded-xl border p-4 mb-4 space-y-3">
        <p className="text-sm font-semibold">可借比例设置</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs space-y-1">
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
          <label className="text-xs space-y-1">
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
        {hasPermission('subsidies.write') && (
          <Button size="sm" disabled={settingsSaving} onClick={() => void saveSettings()}>
            {settingsSaving ? '保存中…' : '保存比例'}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="状态筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && <p className="text-destructive text-sm mb-4">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>申请人</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>伞下业绩</TableHead>
                <TableHead>日新增</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>申请时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => openTicket(t.id)}
                >
                  <TableCell>{KIND_LABEL[t.kind] ?? t.kind}</TableCell>
                  <TableCell className="font-mono text-xs">{shortAddr(t.wallet_address)}</TableCell>
                  <TableCell>{t.amount_usd != null ? `$${fmtUsd(t.amount_usd)}` : '—'}</TableCell>
                  <TableCell>${fmtUsd(t.team_performance_usd)}</TableCell>
                  <TableCell>${fmtUsd(t.daily_new_performance_usd)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{STATUS_LABEL[t.status] ?? t.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{t.applied_at?.slice(0, 16)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(selectedId)} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>工单详情</DialogTitle>
          </DialogHeader>
          {!detail ? (
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">类型</span>
                  <p>{KIND_LABEL[detail.ticket.kind] ?? detail.ticket.kind}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">状态</span>
                  <p>{STATUS_LABEL[detail.ticket.status] ?? detail.ticket.status}</p>
                </div>
                {detail.ticket.application_type && (
                  <div>
                    <span className="text-muted-foreground">申请类型</span>
                    <p>{TYPE_LABEL[detail.ticket.application_type] ?? detail.ticket.application_type}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-muted-foreground">钱包</span>
                  <p className="font-mono text-xs break-all">{detail.ticket.wallet_address}</p>
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => {
                      setSelectedId(null);
                      setLocation(`/members`);
                    }}
                  >
                    在会员管理中查看
                  </Button>
                </div>
                <div>
                  <span className="text-muted-foreground">伞下业绩</span>
                  <p>${fmtUsd(detail.teamStats.teamPerformanceUsd)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">日新增业绩</span>
                  <p>${fmtUsd(detail.teamStats.dailyNewPerformanceUsd)}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">申请说明</span>
                  <p>{detail.ticket.purpose || '—'}</p>
                </div>
              </div>

              {(detail.receiptUrls?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2">票据附件</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {detail.receiptUrls!.map((item) => {
                      const isVideo = /\.(mp4|mov|webm)$/i.test(item.path);
                      return (
                        <a
                          key={item.path}
                          href={item.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-lg border overflow-hidden aspect-square bg-muted/30"
                        >
                          {isVideo ? (
                            <div className="h-full flex items-center justify-center text-xs text-muted-foreground p-2 text-center">
                              视频 · 点击查看
                            </div>
                          ) : (
                            <img src={item.signedUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {detail.priorTickets.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2">历史补贴申请</p>
                  {detail.priorTickets.map((p) => (
                    <div key={p.id} className="text-xs text-muted-foreground border-b py-1">
                      {KIND_LABEL[p.kind] ?? p.kind} · {STATUS_LABEL[p.status] ?? p.status} ·{' '}
                      {p.applied_at?.slice(0, 10)}
                    </div>
                  ))}
                </div>
              )}

              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                {detail.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`text-sm rounded p-2 ${
                      m.author_type === 'admin'
                        ? 'bg-[#E0568F]/10 ml-4'
                        : m.author_type === 'system'
                          ? 'bg-muted/50 text-xs text-muted-foreground'
                          : 'bg-muted mr-4'
                    }`}
                  >
                    <div className="text-[10px] text-muted-foreground mb-1">
                      {m.author_name ?? m.author_type} · {m.created_at?.slice(0, 16)}
                    </div>
                    {m.body}
                  </div>
                ))}
              </div>

              {hasPermission('subsidies.write') && (
                <>
                  <Textarea
                    placeholder="回复申请人或要求补充资料…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={3}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={submitting || !reply.trim()} onClick={() => void sendReply(false)}>
                      回复
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={submitting || !reply.trim()}
                      onClick={() => void sendReply(true)}
                    >
                      要求补充资料
                    </Button>
                    <Button variant="outline" disabled={submitting} onClick={() => void updateStatus('approved')}>
                      通过
                    </Button>
                    <Button variant="destructive" disabled={submitting} onClick={() => void updateStatus('rejected')}>
                      拒绝
                    </Button>
                    <Button variant="outline" disabled={submitting} onClick={() => void updateStatus('paid')}>
                      标记已发放
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
