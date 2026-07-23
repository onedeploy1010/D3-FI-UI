import { useEffect, useState } from 'react';
import { PageShell } from './page-shell';
import { adminFetch } from '@/lib/adminApi';
import { Loader2 } from 'lucide-react';

type Dash = {
  partnerCount: number;
  memberCount: number;
  registeredMemberCount: number;
  newRegisteredToday: number;
  effectiveMemberCount: number;
  newMembersToday: number;
  openSubsidyTickets: number;
  pendingYieldWithdrawals: number;
  activeStakePositions: number;
  totalDepositedUsdt: number;
  depositsTodayUsdt: number;
  activePrincipalUsdt: number;
  ud3TotalBalance: number;
  ud3LifetimeEarned: number;
  d3Price: number | null;
  pendingD3: number | null;
  d3LiabilityUsdt: number | null;
  flashSwapReserveUsdt: number | null;
  treasuryReserveUsdt: number | null;
  solvencyRatio: number | null;
  solvencyHealthy: boolean | null;
};

const fmtNum = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('en-US', { maximumFractionDigits: digits });

/** ratio -1 means liability is zero (backend maps Infinity to -1) */
const fmtRatio = (r: number | null | undefined) =>
  r === null || r === undefined ? '—' : r === -1 ? '∞' : `${(r * 100).toFixed(1)}%`;

/** Concave KPI cell matching the shared cell-inset design system. `accent`
 * tints a subtle top edge + the value so different metrics stay legible. */
function Kpi({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
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
        className="mt-1.5 text-xl font-bold tabular-nums text-foreground leading-none"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground tracking-wide mb-2">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{children}</div>
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
        <div className="space-y-6">
          <Section title="资金 (USDT)">
            <Kpi label="累计入金" value={fmtNum(data.totalDepositedUsdt)} accent="#E0568F" />
            <Kpi label="今日入金" value={fmtNum(data.depositsTodayUsdt)} accent="#8A2B57" />
            <Kpi label="活跃质押本金" value={fmtNum(data.activePrincipalUsdt)} />
            <Kpi label="闪兑储备" value={fmtNum(data.flashSwapReserveUsdt)} sub="链上 USDT" />
            <Kpi label="金库储备" value={fmtNum(data.treasuryReserveUsdt)} sub="链上 USDT" />
          </Section>

          <Section title="代币与偿付">
            <Kpi label="D3 价格" value={fmtNum(data.d3Price, 4)} sub="USDT" />
            <Kpi label="产出D3 待释放" value={fmtNum(data.pendingD3)} sub="D3" />
            <Kpi label="D3 负债折算" value={fmtNum(data.d3LiabilityUsdt)} sub="USDT" />
            <Kpi
              label="偿付率"
              value={fmtRatio(data.solvencyRatio)}
              accent={
                data.solvencyHealthy === null ? undefined : data.solvencyHealthy ? '#10B981' : '#EF4444'
              }
              sub={
                data.solvencyHealthy === null ? '链上数据不可用' : data.solvencyHealthy ? '健康' : '储备不足'
              }
            />
            <Kpi label="UD3 总余额" value={fmtNum(data.ud3TotalBalance)} sub={`累计发放 ${fmtNum(data.ud3LifetimeEarned)}`} />
          </Section>

          <Section title="运营">
            <Kpi label="注册会员" value={String(data.registeredMemberCount)} accent="#E0568F" sub={`今日新增 ${data.newRegisteredToday}`} />
            <Kpi label="正式会员" value={String(data.effectiveMemberCount)} accent="#8A2B57" sub="个人入金 ≥ 100U" />
            <Kpi label="合伙人" value={String(data.partnerCount)} />
            <Kpi label="活跃质押笔数" value={String(data.activeStakePositions)} />
            <Kpi label="待处理工单" value={String(data.openSubsidyTickets)} accent="#E0568F" />
            <Kpi label="待提现" value={String(data.pendingYieldWithdrawals)} />
          </Section>
        </div>
      )}
    </PageShell>
  );
}
