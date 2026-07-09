import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Zap, ChevronRight, Sparkles } from 'lucide-react';
import { glassCardClass, GlassButton } from '@/components/ui/GlassSurface';
import { cn } from '@/lib/utils';
import type { D3FiViewModel } from '@/lib/d3fiViewModel';

type Lang = 'zh' | 'en';

const listParent = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
} as const;

const listItem = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
} as const;

const DYNAMIC_RULES = [
  {
    id: 'poc',
    icon: TrendingUp,
    color: '#E0568F',
    titleZh: 'PoC 级差奖励',
    titleEn: 'PoC differential',
    rateZh: '级差',
    rateEn: 'Diff rate',
    descZh: '下级动态收益 × 你的实际级差（V 级门槛 + PoC 综合分）。180 天线性释放，在「收益」页领取 USDT / D3。',
    descEn: 'Downline dynamic × your rate (V level + PoC score). 180d linear vesting; claim USDT / D3 on Earn.',
  },
  {
    id: 'pon',
    icon: Zap,
    color: '#22c55e',
    titleZh: 'PoN 算力奖励',
    titleEn: 'PoN hashpower bonus',
    rateZh: '池分配',
    rateEn: 'Pool share',
    descZh: '按小区算力占全网比例分配 PoN 池，与 PoC 级差叠加；同周期结算。',
    descEn: 'Small-area hashpower share of PoN pool; stacks with PoC; same epoch settlement.',
  },
] as const;

export function TeamDynamicRewardsPanel({
  lang,
  isDark,
  vm,
  onGoEarn,
  onGoScore,
}: {
  lang: Lang;
  isDark: boolean;
  vm: D3FiViewModel | null;
  onGoEarn: () => void;
  onGoScore: () => void;
}) {
  const t = lang === 'zh';
  const poc = vm?.poc;
  const pending = vm?.teamDynamicPending ?? { usdt: 0, d3: 0, epoch: '—' };
  const history = vm?.teamDynamicHistory ?? [];
  const hasPending = pending.usdt > 0 || pending.d3 > 0;
  const diffRate = poc?.levelDiffRate ?? 0;
  const diffPct = poc ? Math.min(100, ((diffRate - poc.diffFloorPct) / (poc.diffCeilPct - poc.diffFloorPct || 1)) * 100) : 0;

  return (
    <motion.div variants={listParent} initial="hidden" animate="show" className="space-y-5">
      {/* PoC / PoN rule cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DYNAMIC_RULES.map((rule) => {
          const Icon = rule.icon;
          const isPoc = rule.id === 'poc';
          return (
            <motion.div
              key={rule.id}
              variants={listItem}
              whileHover={{ y: -3, scale: 1.01 }}
              className={cn(glassCardClass(isPoc ? 'highlight' : 'default', 'p-4 relative overflow-hidden'))}
            >
              {isPoc && (
                <motion.div
                  className="absolute -right-8 -top-8 w-24 h-24 rounded-full pointer-events-none opacity-20"
                  style={{ background: `radial-gradient(circle, ${rule.color} 0%, transparent 70%)` }}
                  animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.28, 0.15] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <div className="relative flex items-start gap-3">
                <motion.div
                  className="ios-glass-inset w-10 h-10 flex items-center justify-center shrink-0 rounded-xl"
                  animate={isPoc ? { rotate: [0, 4, -4, 0] } : { scale: [1, 1.06, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Icon size={18} style={{ color: rule.color }} />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="site-card-title">{t ? rule.titleZh : rule.titleEn}</span>
                    <span className="site-stat-value-sm site-stat-value-accent shrink-0">
                      {isPoc && poc ? `${diffRate}%` : t ? rule.rateZh : rule.rateEn}
                    </span>
                  </div>
                  <p className="site-stat-label text-pretty leading-relaxed">{t ? rule.descZh : rule.descEn}</p>
                  {isPoc && poc && (
                    <div className="mt-3">
                      <div className="flex justify-between site-stat-label mb-1">
                        <span>{t ? '级差区间' : 'Diff range'}</span>
                        <span>{poc.diffFloorPct}% – {poc.diffCeilPct}%</span>
                      </div>
                      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-[#8A2B57]/[0.06]'}`}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: `linear-gradient(90deg, ${rule.color}, #22c55e)` }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(8, diffPct)}%` }}
                          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Pending dynamic */}
      <AnimatePresence>
        {hasPending && (
          <motion.div
            variants={listItem}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={glassCardClass('accent', 'p-5 relative overflow-hidden')}
          >
            <motion.div
              className="absolute inset-0 pointer-events-none opacity-30"
              style={{
                background: 'linear-gradient(105deg, transparent 40%, rgba(224,86,143,0.12) 50%, transparent 60%)',
              }}
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'linear', repeatDelay: 1.2 }}
            />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} className="text-[#E0568F]" />
                <span className="site-stat-label">
                  {t ? `待释放动态奖励 · Epoch ${pending.epoch}` : `Pending dynamic · Epoch ${pending.epoch}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 mb-4">
                {pending.usdt > 0 && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="site-stat-value-lg site-stat-value-accent"
                  >
                    ${pending.usdt.toLocaleString()} <span className="text-sm font-heading">USDT</span>
                  </motion.div>
                )}
                {pending.d3 > 0 && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.08 }}
                    className="site-stat-value-lg site-stat-value-accent"
                  >
                    {pending.d3.toLocaleString()} <span className="text-sm font-heading">D3</span>
                  </motion.div>
                )}
              </div>
              <p className="site-stat-label mb-4 text-pretty">
                {t ? '180 天线性释放，达标后在「收益」页领取至钱包。' : '180d linear vesting; claim to wallet on Earn when ready.'}
              </p>
              <GlassButton variant="primary" className="w-full !py-2.5 !text-xs" onClick={onGoEarn}>
                {t ? '前往收益页领取' : 'Go to Earn'}
              </GlassButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History */}
      <motion.div variants={listItem} className={glassCardClass('default', 'p-5')}>
        <div className="flex items-center justify-between mb-4">
          <div className="site-section-title">{t ? '动态奖励记录' : 'Dynamic reward history'}</div>
          <button
            type="button"
            onClick={onGoScore}
            className={`text-[10px] font-semibold flex items-center gap-0.5 ios-glass-pressable ${isDark ? 'text-[#E0568F]/80' : 'text-[#8A2B57]/75'}`}
          >
            {t ? 'PoC 分数' : 'PoC score'} <ChevronRight size={12} />
          </button>
        </div>
        <div className="space-y-1">
          {history.length === 0 ? (
            <div className="site-stat-label text-center py-6">{t ? '暂无动态奖励记录' : 'No dynamic rewards yet'}</div>
          ) : (
            history.map((row, i) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  'flex items-center justify-between py-3 border-b last:border-0',
                  isDark ? 'border-white/[0.03]' : 'border-[#8A2B57]/[0.04]',
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {row.type === 'pon' ? (
                      <Zap size={12} className="text-emerald-500 shrink-0" />
                    ) : (
                      <TrendingUp size={12} className="text-[#E0568F] shrink-0" />
                    )}
                    <span className="site-card-title text-xs truncate">{t ? row.labelZh : row.labelEn}</span>
                  </div>
                  <div className="site-stat-label mt-0.5">{row.date}</div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="site-stat-value-sm site-stat-value-accent">
                    +{row.amount} {row.asset}
                  </div>
                  <div className="site-stat-label capitalize">{row.status}</div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
