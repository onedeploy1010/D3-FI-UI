import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassButton } from '@/components/ui/GlassSurface';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

const GUIDE_STEPS = ['guide.search', 'guide.tree', 'guide.transfer'] as const;

export function PartnerTransferGuide({
  lang,
  isDark,
  active,
  onComplete,
}: {
  lang: AppLang;
  isDark: boolean;
  active: boolean;
  onComplete: () => void;
}) {
  const p = usePartnerTranslation(lang);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (active) setStep(0);
  }, [active]);

  if (!active) return null;

  const isLast = step >= GUIDE_STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 pb-28 sm:pb-4"
      >
        <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onComplete} aria-hidden />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className={`relative w-full max-w-sm rounded-2xl p-5 shadow-2xl ${
            isDark ? 'bg-[#1a0f18] border border-white/10' : 'bg-white border border-[#8A2B57]/10'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-3">
            {GUIDE_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-[#E0568F]' : isDark ? 'bg-white/10' : 'bg-[#160510]/10'}`}
              />
            ))}
          </div>
          <h3 className={`text-sm font-bold mb-2 ${isDark ? 'text-white' : 'text-[#160510]'}`}>
            {p('guide.title')}
          </h3>
          <p className={`text-[12px] leading-relaxed mb-5 ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>
            {p(GUIDE_STEPS[step])}
          </p>
          <div className="flex gap-2">
            <GlassButton variant="secondary" className="flex-1 !py-2.5 !text-xs" onClick={onComplete}>
              {p('guide.skip')}
            </GlassButton>
            <GlassButton
              className="flex-1 !py-2.5 !text-xs"
              onClick={() => {
                if (isLast) onComplete();
                else setStep((s) => s + 1);
              }}
            >
              {isLast ? p('guide.done') : p('guide.next')}
            </GlassButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
