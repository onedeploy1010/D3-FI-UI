import { motion } from 'framer-motion';
import { X, Hourglass } from 'lucide-react';
import { glassCardClass } from '@/components/ui/GlassSurface';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

/**
 * Pre-launch "staking coming soon" popup — shown when a stake CTA is tapped while
 * STAKING_ENABLED is false. Title/body: 上线时间正在倒计时 / 敬请关注.
 */
export function ComingSoonModal({
  open,
  onClose,
  lang,
  isDark,
}: {
  open: boolean;
  onClose: () => void;
  lang: AppLang;
  isDark: boolean;
}) {
  const p = usePartnerTranslation(lang);
  if (!open) return null;

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
        aria-label="close"
        onClick={onClose}
        className={`absolute inset-0 ${isDark ? 'bg-black/55' : 'bg-[#160510]/25'} backdrop-blur-sm`}
      />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className={`relative w-full max-w-xs partner-elevated-card overflow-hidden text-center ${glassCardClass('highlight', '')}`}
      >
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#8A2B57] via-[#E0568F] to-[#F472B6]" />

        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className={`absolute top-3 right-3 z-10 p-1.5 rounded-full ios-glass-pressable ${
            isDark ? 'text-white/60 bg-white/5' : 'text-[#160510]/50 bg-[#160510]/5'
          }`}
        >
          <X size={16} />
        </button>

        <div className="relative px-6 pt-8 pb-7">
          <motion.div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-[#E0568F]/12 text-[#E0568F]"
            animate={{ rotate: [0, 180, 180, 360, 360] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', times: [0, 0.35, 0.5, 0.85, 1] }}
          >
            <Hourglass size={26} strokeWidth={2} />
          </motion.div>
          <h2 className={`text-lg font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
            {p('home.stakeComingSoonTitle')}
          </h2>
          <p className={`mt-2 text-[13px] font-medium ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>
            {p('home.stakeComingSoonBody')}
          </p>

          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="mt-6 w-full py-3 rounded-2xl text-sm font-bold text-white ios-glass-pressable"
            style={{ background: 'linear-gradient(135deg, #8A2B57, #E0568F)' }}
          >
            {p('home.stakeComingSoonOk')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
