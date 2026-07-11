import { useEffect, useState } from 'react';
import { PageShell } from './page-shell';
import { StatsCard } from '@/components/stats-card';
import { adminFetch } from '@/lib/adminApi';
import { Loader2 } from 'lucide-react';

type Dash = {
  partnerCount: number;
  memberCount: number;
  openSubsidyTickets: number;
  pendingYieldWithdrawals: number;
  activeStakePositions: number;
};

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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatsCard title="会员总数" value={String(data.memberCount)} color="#E0568F" />
          <StatsCard title="合伙人" value={String(data.partnerCount)} color="#8A2B57" />
          <StatsCard title="活跃质押" value={String(data.activeStakePositions)} />
          <StatsCard title="待处理工单" value={String(data.openSubsidyTickets)} color="#E0568F" />
          <StatsCard title="待提现" value={String(data.pendingYieldWithdrawals)} />
        </div>
      )}
    </PageShell>
  );
}
