import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { X, Sparkles, SkipForward, ChevronRight } from 'lucide-react';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { PRIVATE_SALE_ROUNDS } from '@/components/partner/partnerData';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

/** Accent per round — escalates with the rising price. */
const ROUND_ACCENTS = ['#8A2B57', '#B23A6E', '#E0568F', '#F472B6'];

/**
 * Intro popup for the 私募 (private-sale) page: an animated line chart of the unit
 * price climbing across the 4 rounds. Each round reveals in turn (auto, or tap /
 * 下一轮 to advance) — the line extends, the point pops, and the round's coin amount +
 * price roll in. Skippable (跳过 → reveal all) and closeable (X / 查看订单).
 */
export function PartnerPrivateSaleIntro({
  lang,
  isDark,
  onClose,
}: {
  lang: AppLang;
  isDark: boolean;
  onClose: () => void;
}) {
  const p = usePartnerTranslation(lang);
  const reduce = useReducedMotion();
  const rounds = PRIVATE_SALE_ROUNDS;
  const n = rounds.length;
  // How many rounds are revealed (1..n). Reduced-motion shows them all at once.
  const [revealed, setRevealed] = useState(reduce ? n : 1);
  const done = revealed >= n;

  // Auto-advance one round at a time until all are shown.
  useEffect(() => {
    if (reduce || done) return;
    const t = setTimeout(() => setRevealed((r) => Math.min(n, r + 1)), 950);
    return () => clearTimeout(t);
  }, [revealed, reduce, done, n]);

  // ── Chart geometry (viewBox units) ──
  const W = 300;
  const H = 148;
  const padX = 30;
  const padTop = 30;
  const padBottom = 28;
  const prices = rounds.map((r) => r.priceUsdt);
  const minP = Math.min(...prices) - 1;
  const maxP = Math.max(...prices) + 1;
  const cx = (i: number) => padX + (n > 1 ? (i / (n - 1)) * (W - 2 * padX) : 0);
  const cy = (v: number) => H - padBottom - ((v - minP) / (maxP - minP)) * (H - padTop - padBottom);
  const pts = rounds.map((r, i) => ({
    x: cx(i),
    y: cy(r.priceUsdt),
    round: r.round,
    d3: r.d3,
    price: r.priceUsdt,
    accent: ROUND_ACCENTS[i] ?? '#E0568F',
  }));
  const linePath = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
  const areaPath =
    `${linePath} L${pts[n - 1].x.toFixed(1)},${H - padBottom} L${pts[0].x.toFixed(1)},${H - padBottom} Z`;
  const drawFrac = n > 1 ? (revealed - 1) / (n - 1) : 1;
  const current = pts[Math.min(revealed, n) - 1];
  const axisColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(22,5,16,0.45)';

  const advance = () => setRevealed((r) => Math.min(n, r + 1));

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        aria-label={p('privateSale.viewOrders')}
        onClick={onClose}
        className={`absolute inset-0 ${isDark ? 'bg-black/55' : 'bg-[#160510]/25'} backdrop-blur-sm`}
      />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className={`relative w-full max-w-sm partner-elevated-card overflow-hidden ${glassCardClass('highlight', '')}`}
      >
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#8A2B57] via-[#E0568F] to-[#F472B6]" />

        <button
          type="button"
          onClick={onClose}
          aria-label={p('privateSale.viewOrders')}
          className={`absolute top-3 right-3 z-10 p-1.5 rounded-full ios-glass-pressable ${
            isDark ? 'text-white/60 bg-white/5' : 'text-[#160510]/50 bg-[#160510]/5'
          }`}
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="relative px-5 pt-6 pb-1 text-center">
          <motion.div
            className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-2.5 bg-[#E0568F]/12 text-[#E0568F]"
            animate={reduce ? undefined : { y: [0, -3, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Sparkles size={22} strokeWidth={2.25} />
          </motion.div>
          <h2 className={`text-lg font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
            {p('privateSale.introTitle')}
          </h2>
          <p className={`text-[11px] mt-1 ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
            {p('privateSale.introDesc')}
          </p>
        </div>

        {/* Price-climb line chart. Tap to reveal the next round early. */}
        <div
          className={`relative px-3 ${done ? '' : 'cursor-pointer'}`}
          onClick={done ? undefined : advance}
          role={done ? undefined : 'button'}
          aria-label={done ? undefined : p('privateSale.next')}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" aria-hidden>
            <defs>
              <linearGradient id="ps-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8A2B57" />
                <stop offset="55%" stopColor="#E0568F" />
                <stop offset="100%" stopColor="#F472B6" />
              </linearGradient>
              <linearGradient id="ps-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E0568F" stopOpacity="0.26" />
                <stop offset="100%" stopColor="#E0568F" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Baseline */}
            <line x1={padX} y1={H - padBottom} x2={W - padX} y2={H - padBottom} stroke={axisColor} strokeWidth="1" strokeDasharray="3 4" opacity="0.5" />

            {/* Area under the revealed line */}
            <motion.path
              d={areaPath}
              fill="url(#ps-area)"
              initial={false}
              animate={{ opacity: revealed > 1 ? 1 : 0 }}
              transition={{ duration: 0.5 }}
            />

            {/* The climbing line, drawn progressively as rounds reveal */}
            <motion.path
              d={linePath}
              fill="none"
              stroke="url(#ps-line)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: drawFrac }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />

            {/* Points + per-round price / round labels */}
            {pts.map((pt, i) =>
              i < revealed ? (
                <g key={pt.round}>
                  <text
                    x={pt.x}
                    y={pt.y - 10}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    style={{ fill: pt.accent }}
                  >
                    {pt.price}U
                  </text>
                  <motion.circle
                    cx={pt.x}
                    cy={pt.y}
                    r={4}
                    fill={isDark ? '#1a0d16' : '#fff'}
                    stroke={pt.accent}
                    strokeWidth={2.5}
                    initial={reduce ? false : { scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.18, type: 'spring', stiffness: 520, damping: 18 }}
                  />
                  <text x={pt.x} y={H - padBottom + 15} textAnchor="middle" fontSize="9" style={{ fill: axisColor }}>
                    {p('privateSale.roundLabel', { n: pt.round })}
                  </text>
                </g>
              ) : null,
            )}
          </svg>
        </div>

        {/* Current round detail — coin amount + price, rolling as rounds advance */}
        <div className="relative px-5 pt-0 pb-2 text-center">
          <div className={`flex items-center justify-center gap-2 ${isDark ? 'text-white' : 'text-[#160510]'}`}>
            <span className="text-sm font-bold tracking-tight">{current.d3.toLocaleString()} D3</span>
            <span className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>·</span>
            <span className="flex items-baseline text-xl font-extrabold" style={{ color: current.accent }}>
              <NumberFlow value={current.price} willChange trend={1} />
              <span className="text-[11px] font-bold opacity-70 ml-0.5">U</span>
            </span>
          </div>
          {/* Round progress dots */}
          <div className="mt-2 flex items-center justify-center gap-1.5">
            {pts.map((pt, i) => (
              <span
                key={pt.round}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === revealed - 1 ? 16 : 6,
                  background: i < revealed ? pt.accent : isDark ? 'rgba(255,255,255,0.18)' : 'rgba(22,5,16,0.15)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="relative px-4 pb-4 flex items-center gap-2">
          {!done && (
            <button
              type="button"
              onClick={() => setRevealed(n)}
              className={`inline-flex items-center gap-1 rounded-2xl px-3.5 py-3 text-xs font-semibold ios-glass-pressable ${
                isDark ? 'text-white/55 bg-white/[0.06]' : 'text-[#160510]/55 bg-[#160510]/[0.05]'
              }`}
            >
              {p('privateSale.skip')}
              <SkipForward size={13} strokeWidth={2.4} />
            </button>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={done ? onClose : advance}
            className="flex-1 inline-flex items-center justify-center gap-1 py-3.5 rounded-2xl text-sm font-bold text-white ios-glass-pressable"
            style={{ background: 'linear-gradient(135deg, #8A2B57, #E0568F)' }}
          >
            {done ? p('privateSale.viewOrders') : p('privateSale.next')}
            {!done && <ChevronRight size={16} strokeWidth={2.5} />}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
