import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { motion } from 'framer-motion';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crown,
  Gem,
  GitBranch,
  Scale,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { unionRuleCards } from './unionData';

type Lang = 'zh' | 'en';

const ruleIcons = {
  qualify: Crown,
  channels: GitBranch,
  'usd3-source': Coins,
  'usd3-use': ArrowLeftRight,
  d3: Gem,
  principle: Scale,
} as const;

export function UnionRulesCarousel({ lang, isDark }: { lang: Lang; isDark: boolean }) {
  const t = lang === 'zh';
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: false,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [snapCount, setSnapCount] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    setSnapCount(emblaApi.scrollSnapList().length);
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollTo = (index: number) => emblaApi?.scrollTo(index);
  const scrollPrev = () => emblaApi?.scrollPrev();
  const scrollNext = () => emblaApi?.scrollNext();

  const muted = isDark ? 'text-white/45' : 'text-[#160510]/45';
  const accent = isDark ? '#E0568F' : '#8A2B57';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={`text-sm font-bold uppercase tracking-wider ${muted}`}>
            {t ? '规则说明' : 'Rules'}
          </div>
          <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
            {t ? '左右滑动查看' : 'Swipe to explore'}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={scrollPrev}
            disabled={selectedIndex === 0}
            className={cn(
              'ios-glass-inset w-8 h-8 rounded-xl flex items-center justify-center ios-glass-pressable',
              selectedIndex === 0 && 'opacity-35 pointer-events-none',
            )}
            aria-label={t ? '上一张' : 'Previous'}
          >
            <ChevronLeft size={16} className={muted} />
          </button>
          <button
            type="button"
            onClick={scrollNext}
            disabled={selectedIndex >= snapCount - 1}
            className={cn(
              'ios-glass-inset w-8 h-8 rounded-xl flex items-center justify-center ios-glass-pressable',
              selectedIndex >= snapCount - 1 && 'opacity-35 pointer-events-none',
            )}
            aria-label={t ? '下一张' : 'Next'}
          >
            <ChevronRight size={16} className={muted} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden -mx-1" ref={emblaRef}>
        <div className="flex touch-pan-y">
          {unionRuleCards.map((card, index) => {
            const Icon = ruleIcons[card.id];
            const isActive = index === selectedIndex;
            return (
              <div
                key={card.id}
                className="min-w-0 shrink-0 grow-0 basis-[88%] sm:basis-[72%] pl-3 first:pl-0"
              >
                <motion.article
                  initial={false}
                  animate={{
                    scale: isActive ? 1 : 0.96,
                    opacity: isActive ? 1 : 0.72,
                  }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    'relative h-full rounded-3xl p-4 sm:p-5 overflow-hidden',
                    isDark
                      ? 'ios-glass-inset ring-1 ring-white/[0.06]'
                      : 'ios-glass-inset ring-1 ring-[#8A2B57]/[0.08]',
                    isActive && (isDark ? 'ring-[#E0568F]/25' : 'ring-[#8A2B57]/20'),
                  )}
                >
                  <div
                    className="absolute -right-8 -top-8 w-32 h-32 rounded-full pointer-events-none opacity-40"
                    style={{ background: `radial-gradient(circle, ${card.accent}44 0%, transparent 70%)` }}
                  />
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-full"
                    style={{ background: `linear-gradient(180deg, ${card.accent}, transparent)` }}
                  />

                  <div className="relative flex items-start justify-between gap-3 mb-4">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                      style={{
                        background: `${card.accent}18`,
                        boxShadow: `0 0 24px ${card.accent}33`,
                      }}
                    >
                      <Icon size={20} style={{ color: card.accent }} />
                    </div>
                    <span
                      className="text-[9px] px-2 py-1 rounded-full font-bold uppercase tracking-wider shrink-0"
                      style={{
                        color: card.accent,
                        background: `${card.accent}14`,
                      }}
                    >
                      {t ? card.tagZh : card.tagEn}
                    </span>
                  </div>

                  <h4 className={`text-base font-bold mb-2 pr-2 ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                    {t ? card.titleZh : card.titleEn}
                  </h4>
                  <p className={`text-xs leading-relaxed text-pretty-wrap ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>
                    {t ? card.bodyZh : card.bodyEn}
                  </p>

                  <div className={`mt-4 pt-3 flex items-center justify-between border-t ${isDark ? 'border-white/[0.06]' : 'border-[#8A2B57]/[0.06]'}`}>
                    <span className={`text-[10px] font-semibold tabular-nums ${muted}`}>
                      {String(index + 1).padStart(2, '0')} / {String(unionRuleCards.length).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] font-semibold" style={{ color: card.accent }}>
                      {t ? '股东联盟' : 'Alliance'}
                    </span>
                  </div>
                </motion.article>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        {unionRuleCards.map((card, index) => (
          <button
            key={card.id}
            type="button"
            onClick={() => scrollTo(index)}
            className={cn(
              'rounded-full transition-all duration-300 ios-glass-pressable',
              index === selectedIndex ? 'w-6 h-2' : 'w-2 h-2 opacity-40',
            )}
            style={{
              background: index === selectedIndex ? (card.accent ?? accent) : isDark ? 'rgba(255,255,255,0.25)' : 'rgba(138,43,87,0.25)',
            }}
            aria-label={`${t ? '规则' : 'Rule'} ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
