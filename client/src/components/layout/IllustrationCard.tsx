import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function IllustrationCard({
  children,
  caption,
  isDark,
  className = '',
}: {
  children: ReactNode;
  caption?: string;
  isDark: boolean;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        'ios-glass-card ios-glass-highlight rounded-3xl overflow-hidden relative px-4 py-5 sm:px-5 sm:py-8 md:p-6 flex flex-col items-center justify-center min-h-[220px] sm:min-h-[280px] md:min-h-0 md:aspect-[3/2] w-full',
        className,
      )}
    >
      <span className="ios-glass-sheen pointer-events-none" aria-hidden />
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse at 30% 20%, rgba(201,169,110,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(107,26,58,0.2) 0%, transparent 45%)'
            : 'radial-gradient(ellipse at 30% 20%, rgba(201,176,138,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(155,90,110,0.08) 0%, transparent 45%)',
        }}
      />
      <div className="relative z-10 w-full flex flex-col items-center justify-center flex-1">{children}</div>
      {caption && (
        <div className="mt-2 md:mt-4 text-center relative z-10">
          <div className={`text-xs md:text-[11px] font-medium tracking-wide ${isDark ? 'text-[#C9A96E]/75' : 'text-[#6B1A3A]/65'}`}>
            {caption}
          </div>
        </div>
      )}
    </motion.div>
  );
}
