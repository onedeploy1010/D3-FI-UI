import { useEffect, useState } from 'react';
import { PageShell } from './page-shell';
import { adminFetch } from '@/lib/adminApi';
import { Loader2 } from 'lucide-react';

type Dash = {
  partnerCount: number;
  memberCount: number;
  openSubsidyTickets: number;
  pendingYieldWithdrawals: number;
  activeStakePositions: number;
};

/** Concave KPI cell matching the shared cell-inset design system. `accent`
 * tints a subtle top edge + the value so different metrics stay legible. */
function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl cell-inset p-3 relative overflow-hidden">
      {accent && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px pointer-events-none opacity-60"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />
      )}
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className="mt-1.5 text-2xl font-bold tabular-nums text-foreground leading-none"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void adminFetch<Dash & { ok: boolean }>('/dashboard')
      .then((r) => setData(r))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'));
  }, []);

  return (
    <PageShell title="仪表盘" subtitle="D3 合伙人计划运营概览">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Kpi label="会员总数" value={String(data.memberCount)} accent="#E0568F" />
          <Kpi label="合伙人" value={String(data.partnerCount)} accent="#8A2B57" />
          <Kpi label="活跃质押" value={String(data.activeStakePositions)} />
          <Kpi label="待处理工单" value={String(data.openSubsidyTickets)} accent="#E0568F" />
          <Kpi label="待提现" value={String(data.pendingYieldWithdrawals)} />
        </div>
      )}
    </PageShell>
  );
}
