import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, Activity, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { api, type SecurityOverview, type SecurityAlert } from '@/lib/api';
import { fmt } from '@/lib/supabase';

const PAUSE_LABEL: Record<string, string> = {
  deposits: '入金',
  withdrawals: '提现',
  settlement: '结算',
  flash_swap: '闪兑',
  global: '全局',
};

const LIMIT_LABEL: Record<string, string> = {
  max_transfer_usdt: '单笔上限 (USDT)',
  daily_transfer_usdt: '每日上限 (USDT)',
  max_daily_withdraw_usdt: '每日提现上限 (USDT)',
  max_single_withdraw_usdt: '单笔提现上限 (USDT)',
  min_solvency_ratio: '最低偿付比',
};

const SEV_STYLE: Record<string, string> = {
  critical: 'text-red-700 bg-red-500/12',
  high: 'text-red-600 bg-red-500/10',
  medium: 'text-amber-700 bg-amber-500/12',
  low: 'text-[#8A2B57] bg-[#8A2B57]/8',
};

export function SecurityTab() {
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, al] = await Promise.allSettled([api.securityOverview(), api.securityAlerts()]);
      if (ov.status === 'fulfilled') setData(ov.value);
      else throw ov.reason;
      if (al.status === 'fulfilled') setAlerts(al.value.rows ?? []);
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
  const solvencyHealthy =
    solvency?.healthy ?? (typeof ratio === 'number' ? ratio >= (solvency?.minRatio ?? 1) : undefined);
  const limits = (data?.limits ?? null) as Record<string, unknown> | null;
  const limitEntries = limits ? Object.entries(limits).filter(([k]) => k !== 'id' && k !== 'updated_at') : [];

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
        <div className="flex items-center gap-2 mb-2.5">
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
              <div className={`text-2xl font-extrabold tracking-tight leading-none mt-0.5 ${solvencyHealthy ? 'text-emerald-600' : 'text-red-500'}`}>
                {typeof ratio === 'number' ? `${(ratio * 100).toFixed(0)}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#8A2B57]/55">储备 / 负债 (USDT)</div>
              <div className="text-[13px] font-bold text-[#160510] mt-1">
                {fmt(solvency.reserveUsdt)} / {fmt(solvency.liabilityUsdt)}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[12px] text-[#8A2B57]/55">{loading ? '加载中…' : '暂无偿付数据'}</div>
        )}
      </motion.div>

      {/* 风控额度 */}
      {limitEntries.length > 0 && (
        <div className="brand-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <SlidersHorizontal size={15} className="text-[#8A2B57]" />
            <span className="text-[13px] font-bold text-[#160510]">风控额度</span>
          </div>
          <div className="space-y-1.5">
            {limitEntries.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-[#8A2B57]/70">{LIMIT_LABEL[k] ?? k}</span>
                <span className="text-[13px] font-bold text-[#160510] tabular-nums">
                  {typeof v === 'number' ? v.toLocaleString() : String(v ?? '—')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 熔断开关 */}
      <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider pt-1">熔断开关</h2>
      <div className="space-y-2">
        {(data?.pauseFlags ?? []).map((pf) => (
          <div key={pf.flag} className="brand-card rounded-2xl p-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {pf.paused ? <ShieldAlert size={15} className="text-red-500" /> : <ShieldCheck size={15} className="text-emerald-500" />}
              <span className="text-[13px] font-bold text-[#160510] truncate">{PAUSE_LABEL[pf.flag] ?? pf.flag}</span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${pf.paused ? 'text-red-600 bg-red-500/12' : 'text-emerald-700 bg-emerald-500/12'}`}>
              {pf.paused ? '已暂停' : '运行中'}
            </span>
          </div>
        ))}
        {(data?.pauseFlags ?? []).length === 0 && !loading && (
          <div className="brand-card rounded-2xl p-4 text-[13px] text-[#8A2B57]/55 text-center">无熔断开关</div>
        )}
      </div>

      {/* 风险告警列表 */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">风险告警</h2>
        <span className={`text-[11px] font-bold ${alerts.length > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{alerts.length}</span>
      </div>
      {alerts.length === 0 ? (
        <div className="brand-card rounded-2xl p-4 flex items-center gap-2 text-[13px] text-emerald-600 font-medium">
          <ShieldCheck size={15} /> 暂无未处理告警
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="brand-card rounded-2xl p-3.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[13px] font-bold text-[#160510] truncate">{a.title ?? a.kind ?? '告警'}</span>
                {a.severity && (
                  <span className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${SEV_STYLE[a.severity] ?? SEV_STYLE.low}`}>
                    <AlertTriangle size={10} /> {a.severity}
                  </span>
                )}
              </div>
              {a.message && <p className="text-[11px] text-[#160510]/70 leading-relaxed">{a.message}</p>}
              <div className="text-[10px] text-[#8A2B57]/45 mt-1">{new Date(a.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
