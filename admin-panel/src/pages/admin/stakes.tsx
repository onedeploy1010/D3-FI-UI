import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PageShell } from './page-shell';
import { DataList, type DataListColumn } from '@/components/data-list';
import { AddressChip } from '@/components/address-chip';
import { getStakes, type StakeKind, type StakeRow } from '@/lib/adminApi';
import { fmtUsd } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Layers, Coins } from 'lucide-react';

/**
 * Stake orders — USDT (partner_join / crowdfund_stake) and UD3 stakes.
 * The 质押类型 filter drives the server query (`getStakes({ kind })`); the
 * DataList then handles wallet search, sortable columns, start-date range,
 * pagination and the mobile stacked-card view.
 */

// The backend may enrich a stake with detail fields the base StakeRow type
// doesn't yet declare; treat them as optional so the expanded panel can show
// them when present without breaking typecheck.
type StakeDetail = StakeRow & {
  dailyRate?: number | null;
  exitCapUsdt?: number | null;
  releasedUsdt?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
};

// A normalized row: `principal` collapses the USDT/UD3 principal into one
// numeric field so the 本金 column can sort regardless of stake kind.
type Row = StakeDetail & { principal: number };

type KindTab = 'all' | StakeKind;

const KIND_TABS: { value: KindTab; label: string; icon: ReactNode }[] = [
  { value: 'all', label: '全部', icon: <Layers className="h-3.5 w-3.5" /> },
  { value: 'usdt', label: 'USDT质押', icon: <Coins className="h-3.5 w-3.5" /> },
  { value: 'ud3', label: 'UD3质押', icon: <Coins className="h-3.5 w-3.5" /> },
];

function isUd3(kind: StakeKind): boolean {
  return kind === 'ud3';
}

/** Principal shown in its native unit ($ for USDT stakes, UD3 otherwise). */
function principalText(r: StakeDetail): string {
  return isUd3(r.kind) ? `${fmtUsd(r.principalUd3, 4)} UD3` : `$${fmtUsd(r.principalUsdt)}`;
}

function yieldText(r: StakeDetail): string {
  return isUd3(r.kind) ? `${fmtUsd(r.dailyYield, 4)} D3` : `$${fmtUsd(r.dailyYield, 4)}`;
}

function fmtDate(v: string | null | undefined, len = 10): string {
  if (!v) return '';
  return String(v).slice(0, len);
}

function KindBadge({ kind }: { kind: StakeKind }) {
  return isUd3(kind) ? (
    <Badge className="border-transparent bg-[#E0568F]/20 text-[#E0568F]">UD3质押</Badge>
  ) : (
    <Badge className="border-transparent bg-sky-500/20 text-sky-400">USDT质押</Badge>
  );
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  active: { label: '进行中', className: 'bg-emerald-500/20 text-emerald-400' },
  running: { label: '进行中', className: 'bg-emerald-500/20 text-emerald-400' },
  pending: { label: '待处理', className: 'bg-amber-500/20 text-amber-400' },
  completed: { label: '已完成', className: 'bg-muted text-muted-foreground' },
  exited: { label: '已出局', className: 'bg-muted text-muted-foreground' },
  closed: { label: '已关闭', className: 'bg-muted text-muted-foreground' },
  cancelled: { label: '已取消', className: 'bg-destructive/20 text-destructive' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status?.toLowerCase?.() ?? ''];
  return (
    <Badge className={cn('border-transparent', meta?.className ?? 'bg-secondary text-secondary-foreground')}>
      {meta?.label ?? status ?? '—'}
    </Badge>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums break-words">{children}</p>
    </div>
  );
}

export default function StakesPage() {
  const [kind, setKind] = useState<KindTab>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getStakes({ kind: kind === 'all' ? undefined : kind, limit: 500 })
      .then((r) => {
        if (cancelled) return;
        const mapped: Row[] = (r.rows as StakeDetail[]).map((s) => ({
          ...s,
          principal: isUd3(s.kind) ? s.principalUd3 : s.principalUsdt,
        }));
        setRows(mapped);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const columns = useMemo<DataListColumn<Row>[]>(
    () => [
      {
        key: 'wallet',
        label: '钱包',
        render: (r) => <AddressChip address={r.wallet} variant="compact" />,
      },
      {
        key: 'kind',
        label: '类型',
        render: (r) => <KindBadge kind={r.kind} />,
      },
      {
        key: 'principal',
        label: '本金',
        sortable: true,
        className: 'text-right tabular-nums',
        render: (r) => principalText(r),
      },
      {
        key: 'dailyYield',
        label: '日产出',
        sortable: true,
        className: 'text-right tabular-nums',
        render: (r) => yieldText(r),
      },
      {
        key: 'createdAt',
        label: '起止',
        sortable: true,
        render: (r) => (
          <span className="whitespace-nowrap text-xs">
            {fmtDate(r.startedAt ?? r.createdAt)}
            <span className="text-muted-foreground"> → </span>
            {r.endedAt ? fmtDate(r.endedAt) : <span className="text-muted-foreground">进行中</span>}
          </span>
        ),
      },
      {
        key: 'status',
        label: '状态',
        sortable: true,
        render: (r) => <StatusBadge status={r.status} />,
      },
    ],
    [],
  );

  const renderExpanded = (r: Row) => (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 py-1 sm:grid-cols-3 lg:grid-cols-4">
      <DetailField label="质押类型">
        <KindBadge kind={r.kind} />
      </DetailField>
      <DetailField label="本金">{principalText(r)}</DetailField>
      <DetailField label="日利率">
        {r.dailyRate != null ? `${(Number(r.dailyRate) * 100).toFixed(2)}%` : '—'}
      </DetailField>
      <DetailField label="日产出">{yieldText(r)}</DetailField>
      <DetailField label="出局上限">
        {r.exitCapUsdt != null ? `$${fmtUsd(r.exitCapUsdt)}` : '—'}
      </DetailField>
      <DetailField label="已释放">
        {r.releasedUsdt != null ? `$${fmtUsd(r.releasedUsdt)}` : '—'}
      </DetailField>
      <DetailField label="状态">
        <StatusBadge status={r.status} />
      </DetailField>
      <DetailField label="开始时间">{fmtDate(r.startedAt ?? r.createdAt, 19)}</DetailField>
      <DetailField label="结束时间">{r.endedAt ? fmtDate(r.endedAt, 19) : '—'}</DetailField>
      <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">钱包</p>
        <div className="mt-0.5">
          <AddressChip address={r.wallet} variant="full" />
        </div>
      </div>
    </div>
  );

  return (
    <PageShell title="质押管理" subtitle="USDT 质押（入盟金 / 众筹）与 UD3 质押订单">
      {/* Prominent 质押类型筛选 — drives the server query (getStakes). */}
      <div className="mb-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">质押类型筛选</p>
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border/60 bg-card/40 p-1">
          {KIND_TABS.map((t) => {
            const active = kind === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setKind(t.value)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-[#E0568F] text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <DataList<Row>
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        searchKeys={['wallet']}
        searchPlaceholder="搜索钱包地址…"
        dateKey="createdAt"
        renderExpanded={renderExpanded}
        loading={loading}
        emptyText="暂无质押订单"
        pageSize={20}
      />
    </PageShell>
  );
}
