import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PageShell } from './page-shell';
import { DataList, type DataListColumn, type DataListFilter } from '@/components/data-list';
import { AddressChip } from '@/components/address-chip';
import { useMemberDialog } from '@/components/member-dialog-provider';
import { adminFetch, type MemberRow } from '@/lib/adminApi';
import { fmtUsd } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Crown, Eye, RotateCw, ShieldCheck } from 'lucide-react';

/**
 * The list endpoint may enrich rows with a display name / internal remark; the
 * base `MemberRow` type doesn't declare them, so widen locally for search.
 * (DB columns keep the historical `sd3` naming — the UI always says UD3.)
 */
type MemberListRow = MemberRow & {
  displayName?: string | null;
  remark?: string | null;
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

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void adminFetch<{ ok: boolean; rows: MemberListRow[] }>('/members?limit=1000')
      // The list is filtered client-side; normalize `registeredAt` so the
      // 注册时间 column/filter works even before the backend ships the field.
      .then((r) => setRows(r.rows.map((row) => ({ ...row, registeredAt: row.registeredAt ?? row.createdAt }))))
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
    return [
      {
        key: 'isPartner',
        label: '是否合伙人',
        options: [
          { value: 'true', label: '合伙人' },
          { value: 'false', label: '普通会员' },
        ],
      },
      {
        key: 'marketLeaderStatus',
        label: '领导状态',
        options: [...statuses]
          .sort()
          .map((s) => ({ value: s, label: leaderLabel(s) })),
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
            <AddressChip address={row.walletAddress} variant="compact" />
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
        key: 'pendingUsdtYield',
        label: '待提现',
        sortable: true,
        className: 'text-right md:text-left tabular-nums',
        render: (row) => usd(row.pendingUsdtYield),
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
    [],
  );

  const renderExpanded = useCallback(
    (row: MemberListRow) => (
      <div className="space-y-3 py-1">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <SummaryStat label="个人业绩" value={usd(row.personalPerformanceUsd)} />
          <SummaryStat label="伞下业绩" value={usd(row.teamPerformanceUsd)} />
          <SummaryStat label="日新增" value={usd(row.dailyNewPerformanceUsd)} />
          <SummaryStat label="UD3 余额" value={`${fmtUsd(row.sd3Balance, 4)} UD3`} />
          <SummaryStat label="待提现" value={usd(row.pendingUsdtYield)} />
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
      <DataList<MemberListRow>
        columns={columns}
        rows={rows}
        getRowId={(r) => r.walletAddress}
        searchKeys={['walletAddress', 'displayName', 'remark', 'sponsorWallet']}
        searchPlaceholder="搜索钱包地址 / 昵称 / 备注…"
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
    </PageShell>
  );
}
