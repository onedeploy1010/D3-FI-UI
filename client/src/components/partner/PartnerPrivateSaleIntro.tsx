import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { X, Sparkles, TrendingUp } from 'lucide-react';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { PRIVATE_SALE_ROUNDS } from '@/components/partner/partnerData';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

/** Accent per round — escalates with the rising price. */
const ROUND_ACCENTS = ['#8A2B57', '#B23A6E', '#E0568F', '#F472B6'];

/**
 * Unit price that rolls UP to its value via NumberFlow (odometer-style digit
 * animation) — the core "每轮上涨" motion. Starts at the first round's floor price
 * then, after the row's stagger delay, animates to this round's price so later
 * rounds visibly climb higher. Respects prefers-reduced-motion.
 */
function RollingPrice({
  value,
  from,
  delay,
  color,
  animateRoll,
}: {
  value: number;
  from: number;
  delay: number;
  color: string;
  animateRoll: boolean;
}) {
  const [n, setN] = useState(animateRoll ? from : value);
  useEffect(() => {
    if (!animateRoll) {
      setN(value);
      return;
    }
    const t = setTimeout(() => setN(value), Math.max(0, delay * 1000));
    return () => clearTimeout(t);
  }, [value, delay, animateRoll]);
  return (
    <div className="flex items-baseline justify-end text-lg font-extrabold leading-none tracking-tight" style={{ color }}>
      <NumberFlow value={n} willChange trend={1} />
      <span className="text-[11px] font-bold opacity-70 ml-0.5">U</span>
    </div>
  );
}

/**
 * Intro popup shown when entering the 私募 (private-sale) page: the 4-round
 * schedule (each 500万 D3 at a rising unit price). Closeable → reveals the
 * user's own private-sale orders underneath.
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
  const floorPrice = PRIVATE_SALE_ROUNDS[0]?.priceUsdt ?? 0;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Backdrop */}
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

        {/* Close */}
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
        <div className="relative px-5 pt-6 pb-3 text-center">
          <motion.div
            className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-2.5 bg-[#E0568F]/12 text-[#E0568F]"
            animate={{ y: [0, -3, 0] }}
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

        {/* Rounds — staggered rise + rolling price to convey the per-round climb. */}
        <div className="relative px-4 pb-4 space-y-2">
          {/* Vertical "climb" rail linking the round badges, drawn top→bottom. */}
          <motion.span
            aria-hidden
            className="absolute left-[30px] top-5 bottom-7 w-px origin-top bg-gradient-to-b from-[#8A2B57]/40 via-[#E0568F]/40 to-[#F472B6]/60"
            initial={reduce ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.14, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
          {PRIVATE_SALE_ROUNDS.map((r, i) => {
            const accent = ROUND_ACCENTS[i] ?? '#E0568F';
            const prev = i > 0 ? PRIVATE_SALE_ROUNDS[i - 1].priceUsdt : null;
            const delta = prev != null ? r.priceUsdt - prev : 0;
            const rowDelay = 0.1 + i * 0.1;
            return (
              <motion.div
                key={r.round}
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: rowDelay, type: 'spring', stiffness: 340, damping: 26 }}
                className="relative partner-depth-inset rounded-xl px-3.5 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <motion.span
                    className="relative z-10 shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-extrabold text-white shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}
                    initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: rowDelay + 0.04, type: 'spring', stiffness: 420, damping: 18 }}
                  >
                    {r.round}
                  </motion.span>
                  <div className="min-w-0">
                    <div className={`text-[11px] font-semibold ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>
                      {p('privateSale.roundLabel', { n: r.round })}
                    </div>
                    <div className={`text-sm font-bold leading-tight tracking-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                      {r.d3.toLocaleString()} D3
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {delta > 0 && (
                    <motion.span
                      className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-[#E0568F] bg-[#E0568F]/12"
                      initial={reduce ? false : { opacity: 0, scale: 0.7, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ delay: rowDelay + 0.7, type: 'spring', stiffness: 500, damping: 20 }}
                    >
                      <TrendingUp size={10} strokeWidth={2.75} />+{delta}U
                    </motion.span>
                  )}
                  <div className="text-right">
                    <div className={`text-[10px] font-semibold ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
                      {p('privateSale.unitPrice')}
                    </div>
                    <RollingPrice
                      value={r.priceUsdt}
                      from={floorPrice}
                      delay={rowDelay + 0.05}
                      color={accent}
                      animateRoll={!reduce}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="relative px-4 pb-4">
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
