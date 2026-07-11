import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassButton } from '@/components/ui/GlassSurface';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

const GUIDE_STEPS = ['guide.search', 'guide.tree', 'guide.transfer'] as const;

const SPOTLIGHT_SELECTORS: Record<number, string> = {
  0: '[data-guide="tree-search"]',
  1: '[data-guide="tree-panel"]',
  2: '[data-guide="tree-transfer-btn"]',
};

const CARD_MAX_W = 384;
const CARD_EST_H = 210;
const CARD_GAP = 14;
const VIEWPORT_SAFE = 16;
const MOBILE_TAB_BAR = 88;

function computeGuideCardStyle(rect: DOMRect | null, cardHeight: number, step: number): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_MAX_W, vw - VIEWPORT_SAFE * 2);
  const left = (vw - width) / 2;
  const h = cardHeight || CARD_EST_H;

  if (!rect) {
    return {
      position: 'fixed',
      left,
      bottom: VIEWPORT_SAFE + MOBILE_TAB_BAR,
      width,
    };
  }

  const spaceAbove = rect.top - VIEWPORT_SAFE;
  const spaceBelow = vh - rect.bottom - VIEWPORT_SAFE - MOBILE_TAB_BAR;

  // Transfer step: keep the highlighted button fully visible — prefer card above it.
  if (step === 2) {
    if (spaceAbove >= h + CARD_GAP) {
      return { position: 'fixed', left, top: rect.top - h - CARD_GAP, width };
    }
    return { position: 'fixed', left, top: VIEWPORT_SAFE, width };
  }

  if (spaceBelow >= h + CARD_GAP) {
    return { position: 'fixed', left, top: rect.bottom + CARD_GAP, width };
  }
  if (spaceAbove >= h + CARD_GAP) {
    return { position: 'fixed', left, top: rect.top - h - CARD_GAP, width };
  }

  const rectMid = rect.top + rect.height / 2;
  if (rectMid > vh / 2) {
    return { position: 'fixed', left, top: VIEWPORT_SAFE, width };
  }
  return { position: 'fixed', left, bottom: VIEWPORT_SAFE + MOBILE_TAB_BAR, width };
}

function GuideSpotlight({ rect }: { rect: DOMRect | null }) {
  if (!rect) {
    return <div className="fixed inset-0 z-[59] bg-black/55 backdrop-blur-[1px]" aria-hidden />;
  }
  const pad = 8;
  return (
    <div className="fixed inset-0 z-[59] pointer-events-none" aria-hidden>
      <div
        className="absolute rounded-xl ring-2 ring-[#E0568F] ring-offset-2 ring-offset-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.58)] animate-pulse"
        style={{
          left: rect.left - pad,
          top: rect.top - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
        }}
      />
    </div>
  );
}

export function PartnerTransferGuide({
  lang,
  isDark,
  active,
  onComplete,
  onStepChange,
}: {
  lang: AppLang;
  isDark: boolean;
  active: boolean;
  onComplete: () => void;
  onStepChange?: (step: number) => void;
}) {
  const p = usePartnerTranslation(lang);
  const cardRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);
  const [cardStyle, setCardStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (active) {
      setStep(0);
      onStepChange?.(0);
    }
  }, [active, onStepChange]);

  const measureSpotlight = useCallback(() => {
    if (!active) {
      setSpotRect(null);
      setCardStyle({});
      return;
    }
    const selector = SPOTLIGHT_SELECTORS[step];
    const el = document.querySelector(selector);
    if (!el) {
      setSpotRect(null);
      setCardStyle(computeGuideCardStyle(null, cardRef.current?.offsetHeight ?? CARD_EST_H, step));
      return;
    }
    el.scrollIntoView({
      behavior: 'smooth',
      block: step === 2 ? 'start' : 'center',
      inline: 'nearest',
    });
    window.setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const cardHeight = cardRef.current?.offsetHeight ?? CARD_EST_H;
      setSpotRect(rect);
      setCardStyle(computeGuideCardStyle(rect, cardHeight, step));
    }, step === 2 ? 320 : 180);
  }, [active, step]);

  useLayoutEffect(() => {
    measureSpotlight();
  }, [measureSpotlight]);

  useLayoutEffect(() => {
    if (!active || !spotRect) return;
    const cardHeight = cardRef.current?.offsetHeight ?? CARD_EST_H;
    setCardStyle(computeGuideCardStyle(spotRect, cardHeight, step));
  }, [active, spotRect, step]);

  useEffect(() => {
    if (!active) return;
    const onResize = () => measureSpotlight();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [active, measureSpotlight]);

  const goStep = (next: number) => {
    setStep(next);
    onStepChange?.(next);
  };

  const finish = () => {
    setSpotRect(null);
    onStepChange?.(-1);
    onComplete();
  };

  if (!active) return null;

  const isLast = step >= GUIDE_STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] pointer-events-none"
      >
        <GuideSpotlight rect={spotRect} />
        <div className="absolute inset-0 pointer-events-auto" onClick={finish} aria-hidden />
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          style={cardStyle}
          className={`pointer-events-auto rounded-2xl p-5 shadow-2xl ${
            isDark ? 'bg-[#1a0f18] border border-white/10' : 'bg-white border border-[#8A2B57]/10'
          }`}
          onClick={(e) => e.stopPropagation()}
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
            <GlassButton variant="secondary" className="flex-1 !py-2.5 !text-xs" onClick={finish}>
              {p('guide.skip')}
            </GlassButton>
            <GlassButton
              className="flex-1 !py-2.5 !text-xs"
              onClick={() => {
                if (isLast) finish();
                else goStep(step + 1);
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
