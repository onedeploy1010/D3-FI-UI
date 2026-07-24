import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PageShell } from './page-shell';
import { DataList, type DataListColumn, type DataListFilter } from '@/components/data-list';
import { AddressChip } from '@/components/address-chip';
import { useMemberDialog } from '@/components/member-dialog-provider';
import { adminFetch, setMemberSubsidyRate, type MemberRow } from '@/lib/adminApi';
import { fmtUsd } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { MemberTagChips, MemberTagsEditor } from '@/components/member-tags';
import { useAdminAuth } from '@/contexts/admin-auth';
import { Crown, Eye, Pencil, RotateCw, ShieldCheck } from 'lucide-react';

/** Effective subsidy %: explicit override wins; partners default 10%, others 0%. */
function effectiveSubsidyPct(row: { subsidyRatePct: number | null; isPartner: boolean }): number {
  return row.subsidyRatePct ?? (row.isPartner ? 10 : 0);
}

/**
 * The list endpoint may enrich rows with a display name / internal remark; the
 * base `MemberRow` type doesn't declare them, so widen locally for search.
 * (DB columns keep the historical `sd3` naming — the UI always says UD3.)
 */
type MemberListRow = MemberRow & {
  displayName?: string | null;
  remark?: string | null;
  /** Space-joined tags — makes 标签 searchable via DataList's string search. */
  tagsText?: string;
};

const LEADER_LABELS: Record<string, string> = {
  approved: '市场领袖',
  active: '市场领袖',
  leader: '市场领袖',
  pending: '待审核',
  rejected: '已驳回',
  none: '普通会员',
  '': '普通会员',
};

function isLeaderStatus(status: string | null | undefined): boolean {
  return status === 'approved' || status === 'active' || status === 'leader';
}

function leaderLabel(status: string | null | undefined): string {
  const key = status ?? '';
  return LEADER_LABELS[key] ?? key;
}

function usd(n: number | string | null | undefined): string {
  return `$${fmtUsd(n)}`;
}

function IdentityCell({ row }: { row: MemberListRow }) {
  const leader = isLeaderStatus(row.marketLeaderStatus);
  return (
    <div className="flex flex-wrap items-center justify-end gap-1 md:justify-start">
      {row.isPartner ? (
        <Badge className="gap-1 border-[#E0568F]/30 bg-[#E0568F]/15 text-[#E0568F] hover:bg-[#E0568F]/15">
          <ShieldCheck className="h-3 w-3" /> 合伙人
        </Badge>
      ) : (
        <Badge variant="secondary">会员</Badge>
      )}
      {leader && (
        <Badge variant="outline" className="gap-1">
          <Crown className="h-3 w-3" /> 市场领袖
        </Badge>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function MembersPage() {
  const { open } = useMemberDialog();
  const [rows, setRows] = useState<MemberListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rateEditing, setRateEditing] = useState<MemberListRow | null>(null);
  const { hasPermission } = useAdminAuth();
  const canTag = hasPermission('members.write');
  // 标签筛选 (多选, OR 语义)。
  const [tagPicks, setTagPicks] = useState<Set<string>>(() => new Set());
  // 全部已用标签 — 筛选芯片 + 编辑器的一键建议。
  const tagVocabulary = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const t of r.tags ?? []) set.add(t);
    return [...set].sort();
  }, [rows]);
  const tagFilteredRows = useMemo(
    () =>
      tagPicks.size ? rows.filter((r) => (r.tags ?? []).some((t) => tagPicks.has(t))) : rows,
    [rows, tagPicks],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void adminFetch<{ ok: boolean; rows: MemberListRow[] }>('/members?limit=1000')
      // The list is filtered client-side; normalize `registeredAt` so the
      // 注册时间 column/filter works even before the backend ships the field.
      .then((r) =>
        setRows(
          r.rows.map((row) => ({
            ...row,
            registeredAt: row.registeredAt ?? row.createdAt,
            // 标签也可被搜索框命中 (DataList search matches plain string fields).
            tagsText: (row.tags ?? []).join(' '),
          })),
        ),
      )
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Leader-status filter options are derived from the data so we never offer a
  // value that can't match (the DataList filter is an exact-string compare).
  const filters = useMemo<DataListFilter[]>(() => {
    const statuses = new Set<string>();
    for (const r of rows) statuses.add(r.marketLeaderStatus ?? '');
    void statuses; // 市场领袖筛选已由补贴开关取代
    return [
      {
        key: 'isPartner',
        label: '是否合伙人',
        options: [
          { value: 'true', label: '合伙人' },
          { value: 'false', label: '普通会员' },
        ],
      },
    ];
  }, [rows]);

  const columns = useMemo<DataListColumn<MemberListRow>[]>(
    () => [
      {
        key: 'walletAddress',
        label: '钱包',
        render: (row) => (
          <div className="flex flex-col items-end gap-0.5 md:items-start">
            <span className="flex items-center gap-1">
              <AddressChip address={row.walletAddress} variant="compact" />
              {canTag && (
                <MemberTagsEditor
                  wallet={row.walletAddress}
                  tags={row.tags}
                  vocabulary={tagVocabulary}
                  onSaved={(wallet, next) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.walletAddress === wallet
                          ? { ...r, tags: next, tagsText: next.join(' ') }
                          : r,
                      ),
                    )
                  }
                />
              )}
            </span>
            <MemberTagChips
              tags={row.tags}
              onTagClick={(t) =>
                setTagPicks((prev) => {
                  const next = new Set(prev);
                  if (next.has(t)) next.delete(t);
                  else next.add(t);
                  return next;
                })
              }
            />
            {row.displayName ? (
              <span className="max-w-[160px] truncate text-[11px] text-muted-foreground">
                {row.displayName}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'identity',
        label: '身份',
        render: (row) => <IdentityCell row={row} />,
      },
      {
        key: 'subsidyRatePct',
        label: '补贴',
        sortable: true,
        className: 'text-right md:text-left tabular-nums',
        render: (row) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted/50"
            onClick={(e) => {
              e.stopPropagation();
              setRateEditing(row);
            }}
            title="调整补贴比例"
          >
            <span className={effectiveSubsidyPct(row) > 0 ? 'font-medium text-emerald-500' : 'text-muted-foreground'}>
              {effectiveSubsidyPct(row)}%
            </span>
            {row.subsidyRatePct != null && (
              <span className="text-[9px] text-muted-foreground">自定义</span>
            )}
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
        ),
      },
      {
        key: 'teamPerformanceUsd',
        label: '伞下业绩',
        sortable: true,
        className: 'text-right md:text-left tabular-nums',
        render: (row) => usd(row.teamPerformanceUsd),
      },
      {
        key: 'dailyNewPerformanceUsd',
        label: '日新增',
        sortable: true,
        className: 'text-right md:text-left tabular-nums',
        render: (row) => usd(row.dailyNewPerformanceUsd),
      },
      {
        key: 'personalPerformanceUsd',
        label: '个人业绩',
        sortable: true,
        mobileHide: true,
        className: 'text-right md:text-left tabular-nums',
        render: (row) => usd(row.personalPerformanceUsd),
      },
      {
        key: 'sd3Balance',
        label: 'UD3 余额',
        sortable: true,
        className: 'text-right md:text-left tabular-nums',
        render: (row) => `${fmtUsd(row.sd3Balance, 4)} UD3`,
      },
      {
        key: 'registeredAt',
        label: '注册时间',
        sortable: true,
        className: 'whitespace-nowrap text-right md:text-left text-xs text-muted-foreground',
        render: (row) =>
          row.registeredAt ? new Date(row.registeredAt).toLocaleDateString('zh-CN') : '—',
      },
      {
        key: 'joinedAt',
        label: '加入时间',
        sortable: true,
        className: 'whitespace-nowrap text-right md:text-left text-xs text-muted-foreground',
        render: (row) =>
          row.joinedAt ? new Date(row.joinedAt).toLocaleDateString('zh-CN') : '—',
      },
    ],
    [canTag, tagVocabulary],
  );

  const renderExpanded = useCallback(
    (row: MemberListRow) => (
      <div className="space-y-3 py-1">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <SummaryStat label="个人业绩" value={usd(row.personalPerformanceUsd)} />
          <SummaryStat label="伞下业绩" value={usd(row.teamPerformanceUsd)} />
          <SummaryStat label="日新增" value={usd(row.dailyNewPerformanceUsd)} />
          <SummaryStat label="UD3 余额" value={`${fmtUsd(row.sd3Balance, 4)} UD3`} />
          <SummaryStat label="补贴比例" value={`${effectiveSubsidyPct(row)}%`} />
          <SummaryStat label="领导状态" value={leaderLabel(row.marketLeaderStatus)} />
        </div>
        {row.sponsorWallet && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">推荐人</span>
            <AddressChip address={row.sponsorWallet} variant="compact" />
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                open(row.sponsorWallet!);
              }}
            >
              <Eye className="h-3.5 w-3.5" /> 查看
            </Button>
          </div>
        )}
        {row.remark && (
          <p className="rounded-lg border border-border/60 bg-card/40 p-2.5 text-xs text-muted-foreground">
            备注：{row.remark}
          </p>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            open(row.walletAddress);
          }}
        >
          查看完整详情
        </Button>
      </div>
    ),
    [open],
  );

  return (
    <PageShell
      title="会员管理"
      subtitle="合伙人账户、业绩与资产一览"
      actions={
        <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
          <RotateCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          刷新
        </Button>
      }
    >
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {/* 标签快速筛选 (OR 多选) — 点行内标签或此处芯片皆可 */}
      {tagVocabulary.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">按标签筛选</span>
          {tagVocabulary.map((t) => {
            const on = tagPicks.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() =>
                  setTagPicks((prev) => {
                    const next = new Set(prev);
                    if (on) next.delete(t);
                    else next.add(t);
                    return next;
                  })
                }
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  on
                    ? 'border-violet-500/60 bg-violet-500/15 text-violet-400'
                    : 'border-border/60 text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {t}
              </button>
            );
          })}
          {tagPicks.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-violet-400"
              onClick={() => setTagPicks(new Set())}
            >
              清除 ({tagPicks.size})
            </Button>
          )}
        </div>
      )}

      <DataList<MemberListRow>
        columns={columns}
        rows={tagFilteredRows}
        getRowId={(r) => r.walletAddress}
        searchKeys={['walletAddress', 'displayName', 'remark', 'sponsorWallet', 'tagsText']}
        searchPlaceholder="搜索钱包地址 / 昵称 / 备注 / 标签…"
        filters={filters}
        dateOptions={[
          { key: 'registeredAt', label: '注册时间' },
          { key: 'joinedAt', label: '加入时间' },
        ]}
        renderExpanded={renderExpanded}
        onRowClick={(row) => open(row.walletAddress)}
        pageSize={20}
        loading={loading}
        emptyText="暂无会员数据"
      />

      {rateEditing && (
        <SubsidyRateDialog
          row={rateEditing}
          onClose={() => setRateEditing(null)}
          onSaved={(wallet, ratePct) => {
            setRows((prev) =>
              prev.map((r) => (r.walletAddress === wallet ? { ...r, subsidyRatePct: ratePct } : r)),
            );
            setRateEditing(null);
          }}
        />
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// 补贴比例编辑: 合伙人默认 10%、其他会员默认 0%,可为任何会员设置自定义比例
// (>0 即获得补贴申请资格);恢复默认清除自定义值。Needs `subsidies.rates`.
// ---------------------------------------------------------------------------
function SubsidyRateDialog({
  row,
  onClose,
  onSaved,
}: {
  row: MemberListRow;
  onClose: () => void;
  onSaved: (wallet: string, ratePct: number | null) => void;
}) {
  const defaultPct = row.isPartner ? 10 : 0;
  const enabled = effectiveSubsidyPct(row) > 0;
  const [value, setValue] = useState(String(enabled ? effectiveSubsidyPct(row) : 10));
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  async function save(ratePct: number | null, msg: string) {
    setSaving(true);
    try {
      await setMemberSubsidyRate(row.walletAddress, ratePct);
      toast.success(msg);
      onSaved(row.walletAddress, ratePct);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 100) {
      toast.error('请输入 0-100 之间的比例(开通需大于 0)');
      return;
    }
    void save(
      n,
      enabled ? `补贴比例已设为 ${n}%` : `已开通补贴,比例 ${n}%`,
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>{enabled ? '调整补贴比例' : '开通会员补贴'}</DialogTitle>
          <DialogDescription className="break-all">
            {row.walletAddress}
            <br />
            当前:
            {enabled ? (
              <span className="text-emerald-500"> 已开通 {effectiveSubsidyPct(row)}%</span>
            ) : (
              <span> 未开通</span>
            )}
            {' · '}
            {row.isPartner ? '合伙人默认 10%' : '普通/注册会员默认 0%'}
          </DialogDescription>
        </DialogHeader>

        {!enabled && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-400">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              是否开通该会员补贴?开通后该会员即可在前台补贴页面申请补贴(按下方比例)。
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">补贴比例 (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          {row.subsidyRatePct != null && (
            <p className="text-[11px] text-muted-foreground">
              当前为自定义值 {row.subsidyRatePct}%;「恢复默认」将回到 {defaultPct}%。
            </p>
          )}
        </div>

        {confirmClose && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-400">
            确认关闭该会员的补贴?关闭后前台将无法申请补贴(比例记为 0%),可随时重新开通。
          </div>
        )}

        <DialogFooter className="flex-row flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          {row.subsidyRatePct != null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void save(null, `已恢复默认(${defaultPct}%)`)}
              disabled={saving}
            >
              恢复默认
            </Button>
          )}
          {enabled &&
            (confirmClose ? (
              <Button
                size="sm"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void save(0, '已关闭该会员补贴')}
                disabled={saving}
              >
                {saving ? '处理中…' : '确认关闭'}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => setConfirmClose(true)}
                disabled={saving}
              >
                关闭补贴
              </Button>
            ))}
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : enabled ? '保存比例' : '确认开通'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
