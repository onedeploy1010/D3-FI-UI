import { motion } from 'framer-motion';
import { TrendingUp, Users, Coins, Layers } from 'lucide-react';
import type { PartnerProfile } from '@/lib/siwe';
import { fmt } from '@/lib/supabase';

export function PartnerPerformance({ profile, loading }: { profile: PartnerProfile | null; loading: boolean }) {
  const ts = profile?.partnerTeamStats ?? {};
  const acct = profile?.partnerAccount ?? {};
  const downline = profile?.partnerDownlineWallets?.length ?? 0;
  const stakedUsdt = (profile?.partnerStakePositions ?? []).reduce((s, p) => s + Number(p.principal_usdt ?? 0), 0);

  const stats: { label: string; value: string; icon: typeof TrendingUp; accent: string }[] = [
    { label: '伞下累计业绩', value: `$${fmt(ts.teamPerformanceUsd)}`, icon: TrendingUp, accent: '#8A2B57' },
    { label: '当日新增', value: `$${fmt(ts.dailyNewPerformanceUsd)}`, icon: TrendingUp, accent: '#E0568F' },
    { label: '小区业绩', value: `$${fmt(ts.smallAreaPerformanceUsd)}`, icon: Layers, accent: '#B23A6E' },
    { label: '伞下人数', value: String(downline), icon: Users, accent: '#f472b6' },
  ];

  return (
    <>
      {loading && !profile ? (
        <div className="brand-card rounded-2xl p-8 text-center text-[13px] text-[#8A2B57]/55">加载中…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {stats.map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="brand-card rounded-2xl p-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: s.accent }}>
                    <s.icon size={13} />
                  </span>
                  <span className="text-[11px] font-semibold text-[#8A2B57]/60">{s.label}</span>
                </div>
                <div className="text-xl font-extrabold tracking-tight text-[#160510] leading-none">{s.value}</div>
              </motion.div>
            ))}
          </div>

          {/* 反向金 UD3 + 质押 */}
          <div className="brand-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#8A2B57]/70"><Coins size={14} className="text-[#E0568F]" /> 反向金 UD3</span>
              <span className="text-[16px] font-extrabold text-[#E0568F]">{fmt(acct.ud3_balance)} <span className="text-[10px] opacity-70">UD3</span></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-[#8A2B57]/70">累计获得 UD3</span>
              <span className="text-[13px] font-bold text-[#160510]">{fmt(acct.lifetime_ud3_earned)} UD3</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-[#8A2B57]/70">已质押本金</span>
              <span className="text-[13px] font-bold text-[#160510]">${fmt(stakedUsdt)}</span>
            </div>
          </div>

          <p className="text-center text-[10px] text-[#8A2B57]/40 pt-1">数据来自合伙人系统实时账本</p>
        </>
      )}
    </>
  );
}
