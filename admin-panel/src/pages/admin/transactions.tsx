import { useEffect, useMemo, useState } from 'react';
import { PageShell } from './page-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn, type DataListFilter } from '@/components/data-list';
import { AddressChip } from '@/components/address-chip';
import { getTransactions, type TransactionRow } from '@/lib/adminApi';
import { fmtUsd } from '@/lib/supabase';

/** Fetch cap — DataList paginates/filters in-memory over the loaded rows. */
const FETCH_LIMIT = 500;

/** Known status → label + tone; unknown values fall back to a neutral badge. */
const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '处理中', cls: 'bg-amber-500/15 text-amber-500' },
  processing: { label: '处理中', cls: 'bg-amber-500/15 text-amber-500' },
  submitted: { label: '已提交', cls: 'bg-sky-500/15 text-sky-500' },
  broadcast: { label: '已广播', cls: 'bg-indigo-500/15 text-indigo-500' },
  confirmed: { label: '已完成', cls: 'bg-emerald-500/15 text-emerald-500' },
  success: { label: '成功', cls: 'bg-emerald-500/15 text-emerald-500' },
  completed: { label: '已完成', cls: 'bg-emerald-500/15 text-emerald-500' },
  failed: { label: '失败', cls: 'bg-red-500/15 text-red-500' },
  cancelled: { label: '已取消', cls: 'bg-muted text-muted-foreground' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return <Badge className={meta.cls}>{meta.label}</Badge>;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return String(iso).replace('T', ' ').slice(0, 19);
}

/** Build the status filter options present in the current row set. */
function statusFilter(rows: TransactionRow[]): DataListFilter[] {
  const seen = new Set(rows.map((r) => r.status).filter(Boolean));
  if (seen.size === 0) return [];
  return [
    {
      key: 'status',
      label: '状态',
      options: [...seen].map((s) => ({ value: s, label: STATUS_META[s]?.label ?? s })),
    },
  ];
}

function useTransactions(type: TransactionRow['type']) {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTransactions({ type, limit: FETCH_LIMIT })
      .then((r) => {
        if (!cancelled) setRows(r.rows ?? []);
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
  }, [type]);

  return { rows, loading, error };
}

function FlashSwapTab() {
  const { rows, loading, error } = useTransactions('flash_swap');

  const columns = useMemo<DataListColumn<TransactionRow>[]>(
    () => [
      {
        key: 'wallet',
        label: '钱包',
        render: (r) => <AddressChip address={r.wallet} />,
      },
      {
        key: 'amountUd3',
        label: 'D3数量',
        sortable: true,
        className: 'text-right tabular-nums',
        render: (r) => `${fmtUsd(r.amountUd3, 4)} D3`,
      },
      {
        key: 'amountUsdt',
        label: 'USDT金额',
        sortable: true,
        className: 'text-right tabular-nums',
        render: (r) => `$${fmtUsd(r.amountUsdt, 4)}`,
      },
      {
        key: 'feeUsdt',
        label: '手续费',
        sortable: true,
        className: 'text-right tabular-nums text-muted-foreground',
        render: (r) => `$${fmtUsd(r.feeUsdt, 4)}`,
      },
      {
        key: 'status',
        label: '状态',
        render: (r) => <StatusBadge status={r.status} />,
      },
      {
        key: 'txHash',
        label: 'txHash',
        render: (r) => (r.txHash ? <AddressChip txHash={r.txHash} variant="compact" /> : <span className="text-muted-foreground">—</span>),
      },
      {
        key: 'createdAt',
        label: '时间',
        sortable: true,
        className: 'whitespace-nowrap text-xs text-muted-foreground',
        render: (r) => fmtTime(r.createdAt),
      },
    ],
    [],
  );

  const filters = useMemo(() => statusFilter(rows), [rows]);

  return (
    <>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      <DataList<TransactionRow>
        columns={columns}
        rows={rows}
        loading={loading}
        getRowId={(r) => r.id}
        searchKeys={['wallet', 'txHash']}
        searchPlaceholder="搜索钱包 / txHash…"
        filters={filters}
        dateKey="createdAt"
        emptyText="暂无闪兑记录"
        renderExpanded={(r) => (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 py-1 text-xs sm:grid-cols-2">
            <DetailRow label="钱包">
              <AddressChip address={r.wallet} />
            </DetailRow>
            <DetailRow label="交易哈希">
              {r.txHash ? <AddressChip txHash={r.txHash} /> : <span className="text-muted-foreground">—</span>}
            </DetailRow>
            <DetailRow label="D3数量">{fmtUsd(r.amountUd3, 6)} D3</DetailRow>
            <DetailRow label="USDT金额">${fmtUsd(r.amountUsdt, 6)}</DetailRow>
            <DetailRow label="手续费">${fmtUsd(r.feeUsdt, 6)}</DetailRow>
            <DetailRow label="状态">
              <StatusBadge status={r.status} />
            </DetailRow>
            <DetailRow label="时间">{fmtTime(r.createdAt)}</DetailRow>
            <DetailRow label="记录 ID">
              <span className="font-mono">{r.id}</span>
            </DetailRow>
          </dl>
        )}
      />
    </>
  );
}

function Ud3TransferTab() {
  const { rows, loading, error } = useTransactions('ud3_transfer');

  const columns = useMemo<DataListColumn<TransactionRow>[]>(
    () => [
      {
        key: 'wallet',
        label: '发送方',
        render: (r) => <AddressChip address={r.wallet} />,
      },
      {
        key: 'counterparty',
        label: '接收方',
        render: (r) =>
          r.counterparty ? <AddressChip address={r.counterparty} /> : <span className="text-muted-foreground">—</span>,
      },
      {
        key: 'amountUd3',
        label: 'UD3数量',
        sortable: true,
        className: 'text-right tabular-nums',
        render: (r) => `${fmtUsd(r.amountUd3, 4)} UD3`,
      },
      {
        key: 'status',
        label: '状态',
        render: (r) => <StatusBadge status={r.status} />,
      },
      {
        key: 'createdAt',
        label: '时间',
        sortable: true,
        className: 'whitespace-nowrap text-xs text-muted-foreground',
        render: (r) => fmtTime(r.createdAt),
      },
    ],
    [],
  );

  const filters = useMemo(() => statusFilter(rows), [rows]);

  return (
    <>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      <DataList<TransactionRow>
        columns={columns}
        rows={rows}
        loading={loading}
        getRowId={(r) => r.id}
        searchKeys={['wallet', 'counterparty']}
        searchPlaceholder="搜索发送方 / 接收方…"
        filters={filters}
        dateKey="createdAt"
        emptyText="暂无 UD3 转账记录"
      />
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <PageShell title="交易管理" subtitle="Transactions · 闪兑与 UD3 转账流水">
      <Tabs defaultValue="flash_swap">
        <TabsList>
          <TabsTrigger value="flash_swap">闪兑清单</TabsTrigger>
          <TabsTrigger value="ud3_transfer">UD3 转账</TabsTrigger>
        </TabsList>
        <TabsContent value="flash_swap" className="mt-4">
          <FlashSwapTab />
        </TabsContent>
        <TabsContent value="ud3_transfer" className="mt-4">
          <Ud3TransferTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
