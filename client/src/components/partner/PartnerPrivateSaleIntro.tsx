import { motion } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { PRIVATE_SALE_ROUNDS } from '@/components/partner/partnerData';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

/** Accent per round — escalates with the rising price. */
const ROUND_ACCENTS = ['#8A2B57', '#B23A6E', '#E0568F', '#F472B6'];

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

        {/* Rounds */}
        <div className="relative px-4 pb-4 space-y-2">
          {PRIVATE_SALE_ROUNDS.map((r, i) => {
            const accent = ROUND_ACCENTS[i] ?? '#E0568F';
            return (
              <motion.div
                key={r.round}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 + i * 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="partner-depth-inset rounded-xl px-3.5 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-extrabold text-white"
                    style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}
                  >
                    {r.round}
                  </span>
                  <div className="min-w-0">
                    <div className={`text-[11px] font-semibold ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>
                      {p('privateSale.roundLabel', { n: r.round })}
                    </div>
                    <div className={`text-sm font-bold leading-tight tracking-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                      {r.d3.toLocaleString()} D3
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[10px] font-semibold ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
                    {p('privateSale.unitPrice')}
                  </div>
                  <div className="text-lg font-extrabold leading-none tracking-tight" style={{ color: accent }}>
                    {r.priceUsdt}
                    <span className="text-[11px] font-bold opacity-70 ml-0.5">U</span>
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
