import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Coins, Layers, Shield, TrendingUp } from 'lucide-react';
import { unionRevenueStreams } from './unionData';
import { cn } from '@/lib/utils';

type Lang = 'zh' | 'en';

const streamVisual = {
  fees: {
    icon: Coins,
    color: '#22c55e',
    glow: 'rgba(34,197,94,0.35)',
    angle: -90,
  },
  treasury: {
    icon: TrendingUp,
    color: '#6366f1',
    glow: 'rgba(99,102,241,0.35)',
    angle: 30,
  },
  line: {
    icon: Layers,
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.35)',
    angle: 150,
  },
} as const;

const ORBIT_R = 92;
const CX = 120;
const CY = 120;

function polar(angleDeg: number, radius = ORBIT_R) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

export function UnionRevenueStreams({
  lang,
  isDark,
  compact = false,
}: {
  lang: Lang;
  isDark: boolean;
  compact?: boolean;
}) {
  const t = lang === 'zh';
  const [active, setActive] = useState(0);
  const streams = unionRevenueStreams;

  useEffect(() => {
    if (compact) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % streams.length), 4200);
    return () => window.clearInterval(id);
  }, [compact, streams.length]);

  const muted = isDark ? 'text-white/50' : 'text-[#160510]/50';
  const title = t ? '三路收益' : 'Revenue streams';

  if (compact) {
    return (
      <div className="space-y-2">
        {streams.map((stream, i) => {
          const meta = streamVisual[stream.id];
          const Icon = meta.icon;
          const Cadence = stream.id === 'fees' ? Clock : Shield;
          return (
            <motion.div
              key={stream.id}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
              className="ios-glass-inset rounded-2xl p-3 flex items-center gap-3"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${meta.color}18`, boxShadow: `0 0 20px ${meta.glow}` }}
              >
                <Icon size={16} style={{ color: meta.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? stream.zh : stream.en}</div>
                <div className={`text-[10px] font-medium mt-0.5 flex items-center gap-1 ${muted}`}>
                  <Cadence size={10} />
                  {t ? stream.cycleZh : stream.cycleEn}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  }

  const activeStream = streams[active];
  const activeMeta = streamVisual[activeStream.id];
  const ActiveIcon = activeMeta.icon;

  return (
    <div className="relative">
      <div className={`text-sm font-bold uppercase tracking-wider mb-4 ${muted}`}>{title}</div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5 items-center">
        {/* Orbital diagram */}
        <div className="relative mx-auto w-full max-w-[280px] aspect-square">
          <svg viewBox="0 0 240 240" className="w-full h-full" aria-hidden>
            <defs>
              <radialGradient id="union-hub-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={isDark ? '#E0568F' : '#8A2B57'} stopOpacity="0.22" />
                <stop offset="100%" stopColor={isDark ? '#E0568F' : '#8A2B57'} stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle cx={CX} cy={CY} r={ORBIT_R + 18} fill="url(#union-hub-glow)" />

            <motion.circle
              cx={CX}
              cy={CY}
              r={ORBIT_R}
              fill="none"
              stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(138,43,87,0.08)'}
              strokeWidth="1.5"
              strokeDasharray="4 6"
              animate={{ rotate: 360 }}
              transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: `${CX}px ${CY}px` }}
            />

            {streams.map((stream, i) => {
              const meta = streamVisual[stream.id];
              const pos = polar(meta.angle);
              const isActive = i === active;
              return (
                <g key={stream.id}>
                  <motion.line
                    x1={CX}
                    y1={CY}
                    x2={pos.x}
                    y2={pos.y}
                    stroke={meta.color}
                    strokeWidth={isActive ? 2 : 1}
                    strokeOpacity={isActive ? 0.55 : 0.15}
                    animate={{ strokeOpacity: isActive ? 0.55 : 0.15 }}
                    transition={{ duration: 0.4 }}
                  />
                  {isActive && (
                    <motion.circle
                      r="3"
                      fill={meta.color}
                      initial={{ opacity: 0 }}
                      animate={{
                        opacity: [0.2, 1, 0.2],
                        cx: [CX, pos.x],
                        cy: [CY, pos.y],
                      }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                </g>
              );
            })}

            <circle
              cx={CX}
              cy={CY}
              r={34}
              fill={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(138,43,87,0.04)'}
              stroke={isDark ? 'rgba(224,86,143,0.35)' : 'rgba(138,43,87,0.2)'}
              strokeWidth="1.5"
            />
            <text
              x={CX}
              y={CY - 4}
              textAnchor="middle"
              fill={isDark ? '#E0568F' : '#8A2B57'}
              fontSize="9"
              fontWeight="700"
              letterSpacing="0.12em"
            >
              D³
            </text>
            <text
              x={CX}
              y={CY + 10}
              textAnchor="middle"
              fill={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(22,5,16,0.45)'}
              fontSize="7"
              fontWeight="600"
            >
              {t ? '协议收入' : 'Protocol'}
            </text>
          </svg>

          {streams.map((stream, i) => {
            const meta = streamVisual[stream.id];
            const Icon = meta.icon;
            const pos = polar(meta.angle, ORBIT_R + 2);
            const isActive = i === active;
            const leftPct = (pos.x / 240) * 100;
            const topPct = (pos.y / 240) * 100;

            return (
              <motion.button
                key={stream.id}
                type="button"
                onClick={() => setActive(i)}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                animate={{ scale: isActive ? 1.08 : 1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                aria-label={t ? stream.zh : stream.en}
              >
                <div
                  className={cn(
                    'w-11 h-11 rounded-2xl flex items-center justify-center border transition-shadow',
                    isActive ? 'border-transparent' : isDark ? 'border-white/10' : 'border-[#8A2B57]/10',
                  )}
                  style={{
                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
                    boxShadow: isActive ? `0 0 24px ${meta.glow}, 0 4px 16px rgba(0,0,0,0.12)` : '0 2px 8px rgba(0,0,0,0.06)',
                  }}
                >
                  <Icon size={18} style={{ color: meta.color }} />
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="min-w-0">
          <div className="flex gap-1.5 mb-3">
            {streams.map((stream, i) => {
              const meta = streamVisual[stream.id];
              return (
                <button
                  key={stream.id}
                  type="button"
                  onClick={() => setActive(i)}
                  className="h-1 flex-1 rounded-full overflow-hidden"
                  aria-label={t ? stream.zh : stream.en}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: meta.color }}
                    animate={{ opacity: i === active ? 1 : 0.2, scaleX: i === active ? 1 : 0.85 }}
                    transition={{ duration: 0.35 }}
                  />
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeStream.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'ios-glass-inset rounded-3xl p-4 sm:p-5 relative overflow-hidden',
                isDark ? 'ring-1 ring-white/[0.06]' : 'ring-1 ring-[#8A2B57]/[0.06]',
              )}
            >
              <div
                className="absolute -right-8 -top-8 w-32 h-32 rounded-full pointer-events-none"
                style={{ background: `radial-gradient(circle, ${activeMeta.glow} 0%, transparent 70%)` }}
              />

              <div className="relative flex items-start gap-3">
                <motion.div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: `${activeMeta.color}18` }}
                  animate={{ rotate: [0, 4, -4, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <ActiveIcon size={22} style={{ color: activeMeta.color }} />
                </motion.div>

                <div className="min-w-0 flex-1">
                  <div className={`text-base font-bold leading-snug ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                    {t ? activeStream.zh : activeStream.en}
                  </div>
                  <div className={`text-xs font-medium mt-1.5 leading-relaxed text-pretty ${muted}`}>
                    {t ? activeStream.sourceZh : activeStream.sourceEn}
                  </div>
                </div>
              </div>

              <div className="relative mt-4 flex flex-wrap gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold',
                    isDark ? 'bg-white/[0.06] text-white/65' : 'bg-[#8A2B57]/[0.06] text-[#160510]/65',
                  )}
                >
                  {activeStream.id === 'fees' ? <Clock size={12} /> : <Shield size={12} />}
                  {t ? activeStream.cycleZh : activeStream.cycleEn}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: `${activeMeta.color}14`, color: activeMeta.color }}
                >
                  USD3 + D3
                </span>
              </div>

              <div className={`mt-3 pt-3 border-t text-[11px] font-medium leading-relaxed grid sm:grid-cols-2 gap-2 ${isDark ? 'border-white/[0.06] text-white/40' : 'border-[#8A2B57]/[0.06] text-[#160510]/45'}`}>
                <div>
                  <span className="font-bold text-emerald-500">USD3</span>
                  <span className="ml-1">{t ? activeStream.usd3Zh : activeStream.usd3En}</span>
                </div>
                <div>
                  <span className="font-bold" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>D3</span>
                  <span className="ml-1">{t ? activeStream.d3Zh : activeStream.d3En}</span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
