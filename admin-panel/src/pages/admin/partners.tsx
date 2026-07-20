import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Crown, Users, Coins, Wallet, TrendingUp } from 'lucide-react';
import { PageShell } from './page-shell';
import { AddressChip } from '@/components/address-chip';
import { DataList, type DataListColumn, type DataListFilter } from '@/components/data-list';
import { adminFetch } from '@/lib/adminApi';
import { useMemberDialog } from '@/components/member-dialog-provider';
import { fmtUsd } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/** Raw shape returned by GET /partners (partner_accounts row + teamStats bundle). */
type PartnerApiRow = {
  wallet_address: string;
  is_partner: boolean;
  sd3_balance: number;
  pending_usdt_yield: number;
  market_leader_status: string;
  joined_at: string | null;
  teamStats?: {
    teamPerformanceUsd?: number;
    personalPerformanceUsd?: number;
    dailyNewPerformanceUsd?: number;
    smallAreaPerformanceUsd?: number;
    largeAreaPerformanceUsd?: number;
  } | null;
};

/**
 * Flattened row for the list: nested teamStats are hoisted to top-level numeric
 * fields so DataList's field-based sorting/searching works directly on them.
 * DB keeps the historical `sd3` column name; the UI everywhere reads UD3.
 */
type PartnerRow = {
  wallet_address: string;
  ud3_balance: number;
  pending_usdt_yield: number;
  market_leader_status: string;
  joined_at: string | null;
  teamPerformanceUsd: number;
  personalPerformanceUsd: number;
  dailyNewPerformanceUsd: number;
  smallAreaPerformanceUsd: number;
  largeAreaPerformanceUsd: number;
};

const LEADER_LABELS: Record<string, string> = {
  none: '普通',
  pending: '待审核',
  approved: '市场领袖',
  rejected: '已驳回',
};

const LEADER_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  none: 'outline',
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
};

function flatten(r: PartnerApiRow): PartnerRow {
  const t = r.teamStats ?? {};
  return {
    wallet_address: r.wallet_address,
    ud3_balance: Number(r.sd3_balance ?? 0),
    pending_usdt_yield: Number(r.pending_usdt_yield ?? 0),
    market_leader_status: r.market_leader_status ?? 'none',
    joined_at: r.joined_at,
    teamPerformanceUsd: Number(t.teamPerformanceUsd ?? 0),
    personalPerformanceUsd: Number(t.personalPerformanceUsd ?? 0),
    dailyNewPerformanceUsd: Number(t.dailyNewPerformanceUsd ?? 0),
    smallAreaPerformanceUsd: Number(t.smallAreaPerformanceUsd ?? 0),
    largeAreaPerformanceUsd: Number(t.largeAreaPerformanceUsd ?? 0),
  };
}

function Usd({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('tabular-nums', className)}>
      <span className="text-muted-foreground">$</span>
      {fmtUsd(value)}
    </span>
  );
}

function LeaderBadge({ status }: { status: string }) {
  return (
    <Badge variant={LEADER_VARIANT[status] ?? 'outline'} className="gap-1">
      {status === 'approved' && <Crown className="h-3 w-3" />}
      {LEADER_LABELS[status] ?? status}
    </Badge>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50',
          accent,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-base font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function DetailStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{children}</p>
    </div>
  );
}

export default function PartnersPage() {
  const { open } = useMemberDialog();
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void adminFetch<{ ok: boolean; rows: PartnerApiRow[] }>('/partners?limit=200')
      .then((r) => setRows((r.rows ?? []).map(flatten)))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.team += r.teamPerformanceUsd;
        acc.ud3 += r.ud3_balance;
        acc.pending += r.pending_usdt_yield;
        if (r.market_leader_status === 'approved') acc.leaders += 1;
        return acc;
      },
      { team: 0, ud3: 0, pending: 0, leaders: 0 },
    );
  }, [rows]);

  const filters: DataListFilter[] = [
    {
      key: 'market_leader_status',
      label: '领导状态',
      options: [
        { value: 'approved', label: '市场领袖' },
        { value: 'pending', label: '待审核' },
        { value: 'none', label: '普通' },
        { value: 'rejected', label: '已驳回' },
      ],
    },
  ];

  const columns: DataListColumn<PartnerRow>[] = [
    {
      key: 'wallet_address',
      label: '合伙人',
      render: (r) => (
        <div className="flex min-w-0 flex-col items-end gap-1.5 md:items-start">
          <AddressChip address={r.wallet_address} variant="compact" />
          <div className="flex flex-wrap justify-end gap-1 md:justify-start">
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" />
              合伙人
            </Badge>
            {r.market_leader_status === 'approved' && (
              <Badge variant="default" className="gap-1">
                <Crown className="h-3 w-3" />
                领袖
              </Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'teamPerformanceUsd',
      label: '团队业绩',
      sortable: true,
      className: 'text-right md:text-left',
      render: (r) => <Usd value={r.teamPerformanceUsd} className="font-semibold" />,
    },
    {
      key: 'personalPerformanceUsd',
      label: '个人业绩',
      sortable: true,
      className: 'text-right md:text-left',
      render: (r) => <Usd value={r.personalPerformanceUsd} />,
    },
    {
      key: 'dailyNewPerformanceUsd',
      label: '日新增',
      sortable: true,
      mobileHide: true,
      className: 'text-right md:text-left',
      render: (r) => (
        <span
          className={cn(
            'tabular-nums',
            r.dailyNewPerformanceUsd > 0 ? 'text-emerald-500' : 'text-muted-foreground',
          )}
        >
          {r.dailyNewPerformanceUsd > 0 ? '+' : ''}
          {fmtUsd(r.dailyNewPerformanceUsd)}
        </span>
      ),
    },
    {
      key: 'ud3_balance',
      label: 'UD3 余额',
      sortable: true,
      className: 'text-right md:text-left',
      render: (r) => <span className="font-semibold tabular-nums">{fmtUsd(r.ud3_balance, 4)}</span>,
    },
    {
      key: 'market_leader_status',
      label: '领导状态',
      render: (r) => <LeaderBadge status={r.market_leader_status} />,
    },
    {
      key: 'joined_at',
      label: '入盟时间',
      sortable: true,
      mobileHide: true,
      render: (r) =>
        r.joined_at ? (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {r.joined_at.slice(0, 10)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  const renderExpanded = (r: PartnerRow) => (
    <div className="space-y-3 py-1">
      <AddressChip address={r.wallet_address} variant="full" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <DetailStat label="团队业绩">
          <Usd value={r.teamPerformanceUsd} />
        </DetailStat>
        <DetailStat label="个人业绩">
          <Usd value={r.personalPerformanceUsd} />
        </DetailStat>
        <DetailStat label="日新增业绩">
          <Usd value={r.dailyNewPerformanceUsd} />
        </DetailStat>
        <DetailStat label="大区业绩">
          <Usd value={r.largeAreaPerformanceUsd} />
        </DetailStat>
        <DetailStat label="小区业绩">
          <Usd value={r.smallAreaPerformanceUsd} />
        </DetailStat>
        <DetailStat label="UD3 余额">{fmtUsd(r.ud3_balance, 4)}</DetailStat>
        <DetailStat label="待发 USDT 收益">
          <Usd value={r.pending_usdt_yield} />
        </DetailStat>
        <DetailStat label="领导状态">
          <LeaderBadge status={r.market_leader_status} />
        </DetailStat>
        <DetailStat label="入盟时间">{r.joined_at?.slice(0, 10) ?? '—'}</DetailStat>
      </div>
    </div>
  );

  return (
    <PageShell title="合伙人管理" subtitle="已入盟合伙人、市场领袖与业绩概览">
      {error && (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile
          icon={<Users className="h-4 w-4" />}
          label="合伙人总数"
          value={loading ? '—' : rows.length.toLocaleString()}
        />
        <StatTile
          icon={<Crown className="h-4 w-4 text-amber-500" />}
          label="市场领袖"
          value={loading ? '—' : totals.leaders.toLocaleString()}
          accent="bg-amber-500/10"
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="团队业绩合计"
          value={loading ? '—' : <Usd value={totals.team} />}
        />
        <StatTile
          icon={<Coins className="h-4 w-4" />}
          label="UD3 余额合计"
          value={loading ? '—' : fmtUsd(totals.ud3, 4)}
        />
      </div>

      <DataList<PartnerRow>
        columns={columns}
        rows={rows}
        getRowId={(r) => r.wallet_address}
        searchKeys={['wallet_address']}
        searchPlaceholder="搜索钱包地址…"
        filters={filters}
        dateKey="joined_at"
        onRowClick={(r) => open(r.wallet_address)}
        renderExpanded={renderExpanded}
        pageSize={15}
        loading={loading}
        emptyText="暂无合伙人"
      />
    </PageShell>
  );
}
