import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, Activity, AlertTriangle } from 'lucide-react';
import { api, type SecurityOverview } from '@/lib/api';
import { fmt } from '@/lib/supabase';

const PAUSE_LABEL: Record<string, string> = {
  deposits: '入金',
  withdrawals: '提现',
  settlement: '结算',
  flash_swap: '闪兑',
  global: '全局',
};

export function SecurityTab() {
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.securityOverview());
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const solvency = data?.solvency ?? null;
  const ratio = solvency?.ratio;
  const solvencyHealthy = solvency?.healthy ?? (typeof ratio === 'number' ? ratio >= (solvency?.minRatio ?? 1) : undefined);
  const alertCounts = data?.alertCounts ?? {};
  const totalAlerts = Object.values(alertCounts).reduce((s, n) => s + Number(n || 0), 0);

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">Policy · 风控</h2>
        <button type="button" onClick={() => void load()} className="tap p-1.5 rounded-lg text-[#8A2B57]/60 bg-[#8A2B57]/6">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {error && <div className="brand-card rounded-2xl p-4 text-[13px] text-red-500 font-medium">{error}</div>}

      {/* 偿付能力 */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="brand-card rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Activity size={16} className="text-[#E0568F]" />
          <span className="text-[13px] font-bold text-[#160510]">偿付能力</span>
          {solvencyHealthy !== undefined && (
            <span
              className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                solvencyHealthy ? 'text-emerald-700 bg-emerald-500/12' : 'text-red-600 bg-red-500/12'
              }`}
            >
              {solvencyHealthy ? '健康' : '预警'}
            </span>
          )}
        </div>
        {solvency ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-[#8A2B57]/55">储备 / 负债比</div>
              <div className={`text-xl font-extrabold tracking-tight ${solvencyHealthy ? 'text-emerald-600' : 'text-red-500'}`}>
                {typeof ratio === 'number' ? `${(ratio * 100).toFixed(0)}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#8A2B57]/55">储备 / 负债 (USDT)</div>
              <div className="text-[13px] font-bold text-[#160510] mt-0.5">
                {fmt(solvency.reserveUsdt)} / {fmt(solvency.liabilityUsdt)}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[12px] text-[#8A2B57]/55">{loading ? '加载中…' : '暂无偿付数据'}</div>
        )}
      </motion.div>

      {/* 熔断开关 / policy 状态 */}
      <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider pt-1">熔断开关</h2>
      <div className="space-y-2">
        {(data?.pauseFlags ?? []).map((pf) => (
          <div key={pf.flag} className="brand-card rounded-2xl p-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {pf.paused ? <ShieldAlert size={15} className="text-red-500" /> : <ShieldCheck size={15} className="text-emerald-500" />}
              <span className="text-[13px] font-bold text-[#160510] truncate">{PAUSE_LABEL[pf.flag] ?? pf.flag}</span>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                pf.paused ? 'text-red-600 bg-red-500/12' : 'text-emerald-700 bg-emerald-500/12'
              }`}
            >
              {pf.paused ? '已暂停' : '运行中'}
            </span>
          </div>
        ))}
        {(data?.pauseFlags ?? []).length === 0 && !loading && (
          <div className="brand-card rounded-2xl p-4 text-[13px] text-[#8A2B57]/55 text-center">无熔断开关</div>
        )}
      </div>

      {/* 风险告警 */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">风险告警</h2>
        <span className={`text-[11px] font-bold ${totalAlerts > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{totalAlerts}</span>
      </div>
      <div className="brand-card rounded-2xl p-4">
        {totalAlerts === 0 ? (
          <div className="flex items-center gap-2 text-[13px] text-emerald-600 font-medium">
            <ShieldCheck size={15} /> 暂无未处理告警
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(alertCounts).map(([sev, n]) => (
              <span key={sev} className="flex items-center gap-1 text-[12px] font-bold text-red-600 bg-red-500/10 px-2.5 py-1 rounded-lg">
                <AlertTriangle size={12} /> {sev}: {n}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
