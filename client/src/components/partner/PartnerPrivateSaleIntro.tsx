import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { X, Sparkles } from 'lucide-react';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { PRIVATE_SALE_ROUNDS } from '@/components/partner/partnerData';
import { getPrivateSaleProgress, type PrivateSaleProgress } from '@/lib/unionApi';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

/** Accent per round — escalates with the rising price. */
const ROUND_ACCENTS = ['#8A2B57', '#B23A6E', '#E0568F', '#F472B6'];

/**
 * Liquid-fill gauge — a vessel filling with a wavy liquid up to `pct`%. Two waves
 * translate horizontally (different speeds) for depth; the surface rises to the fill
 * line on mount. The 第N轮 + % read out in the centre. Respects reduced-motion.
 */
function LiquidGauge({ pct, round, lang }: { pct: number; round: number; lang: AppLang }) {
  const p = usePartnerTranslation(lang);
  const reduce = useReducedMotion();
  const R = 54;
  const CX = 60;
  const CY = 60;
  const TOP = CY - R;
  const BOT = CY + R;
  const clamped = Math.min(100, Math.max(0, pct));
  const fillY = BOT - (clamped / 100) * (BOT - TOP);
  // A wavelength-120 wave drawn 240 wide so an x-shift of ±120 loops seamlessly.
  const wave = (amp: number) => `M0,${amp} q30,${-amp * 2} 60,0 t60,0 t60,0 t60,0 L240,140 L0,140 Z`;
  const fillAnim = { delay: 0.15, duration: 1.4, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className="relative mx-auto" style={{ width: 148, height: 148 }}>
      <svg viewBox="0 0 120 120" className="w-full h-full">
        <defs>
          <clipPath id="lg-orb">
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
          <linearGradient id="lg-liquid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F472B6" />
            <stop offset="100%" stopColor="#8A2B57" />
          </linearGradient>
        </defs>
        {/* Vessel */}
        <circle cx={CX} cy={CY} r={R} fill="rgba(224,86,143,0.08)" stroke="#E0568F" strokeOpacity="0.4" strokeWidth="3" />
        <g clipPath="url(#lg-orb)">
          {/* Back wave — slower, translucent */}
          <motion.g initial={reduce ? false : { y: BOT }} animate={{ y: fillY }} transition={fillAnim}>
            <motion.path
              d={wave(5)}
              fill="url(#lg-liquid)"
              opacity="0.5"
              animate={reduce ? undefined : { x: [-120, 0] }}
              transition={{ repeat: Infinity, duration: 3.6, ease: 'linear' }}
            />
          </motion.g>
          {/* Front wave */}
          <motion.g initial={reduce ? false : { y: BOT }} animate={{ y: fillY }} transition={fillAnim}>
            <motion.path
              d={wave(4)}
              fill="url(#lg-liquid)"
              animate={reduce ? undefined : { x: [0, -120] }}
              transition={{ repeat: Infinity, duration: 2.6, ease: 'linear' }}
            />
          </motion.g>
        </g>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="1" />
      </svg>
      {/* Centre readout */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.45)' }}
      >
        <div className="text-[11px] font-semibold text-white/95">{p('privateSale.roundLabel', { n: round })}</div>
        <div className="flex items-baseline text-3xl font-extrabold text-white leading-none">
          <NumberFlow value={clamped} willChange />
          <span className="text-base ml-0.5">%</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Intro popup for the 私募 (private-sale) page: a liquid-fill gauge of the current
 * round's real progress (from confirmed deposits + admin boost), the 4-round price
 * ladder, and coins-sold detail. Closeable.
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
  const [progress, setProgress] = useState<PrivateSaleProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPrivateSaleProgress()
      .then((r) => !cancelled && setProgress(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const currentRound = progress?.currentRound ?? 1;
  const displayPct = progress?.displayPct ?? 0;

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
            className="inline-flex items-center justify-center w-11 h-11 rounded-2xl mb-2 bg-[#E0568F]/12 text-[#E0568F]"
            animate={reduce ? undefined : { y: [0, -3, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Sparkles size={20} strokeWidth={2.25} />
          </motion.div>
          <h2 className={`text-lg font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
            {p('privateSale.introTitle')}
          </h2>
          <p className={`text-[11px] mt-1 ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
            {p('privateSale.introDesc')}
          </p>
        </div>

        {/* Liquid-fill progress gauge (real current-round fill + admin boost) */}
        <div className="relative px-5 pt-2 pb-1">
          <LiquidGauge pct={displayPct} round={currentRound} lang={lang} />
          <div className={`mt-2 text-center text-[11px] ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>
            {progress
              ? p('privateSale.soldOfTarget', {
                  sold: progress.roundSoldD3.toLocaleString(),
                  target: progress.roundTargetD3.toLocaleString(),
                })
              : '…'}
          </div>
        </div>

        {/* 4-round price ladder — current round highlighted */}
        <div className="relative px-4 pt-2 pb-1 grid grid-cols-4 gap-1.5">
          {PRIVATE_SALE_ROUNDS.map((r, i) => {
            const accent = ROUND_ACCENTS[i] ?? '#E0568F';
            const active = r.round === currentRound;
            return (
              <motion.div
                key={r.round}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.06, type: 'spring', stiffness: 320, damping: 24 }}
                className={`rounded-xl px-1.5 py-2 text-center border ${
                  active
                    ? 'border-[#E0568F]/50 bg-[#E0568F]/10'
                    : isDark
                      ? 'border-white/[0.06] bg-white/[0.03]'
                      : 'border-[#160510]/[0.06] bg-[#160510]/[0.02]'
                }`}
              >
                <div className={`text-[9px] font-semibold ${isDark ? 'text-white/45' : 'text-[#160510]/45'}`}>
                  {p('privateSale.roundLabel', { n: r.round })}
                </div>
                <div className="text-sm font-extrabold leading-tight" style={{ color: accent }}>
                  {r.priceUsdt}
                  <span className="text-[10px] opacity-70">U</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="relative px-4 pt-3 pb-4">
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white ios-glass-pressable"
            style={{ background: 'linear-gradient(135deg, #8A2B57, #E0568F)' }}
          >
            {p('privateSale.viewOrders')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
