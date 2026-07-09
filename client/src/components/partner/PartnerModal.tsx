import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { GlassIconButton } from '@/components/ui/GlassSurface';
import { partnerElevated } from '@/components/partner/partnerStyles';

export function PartnerModal({
  open,
  onClose,
  title,
  children,
  isDark,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  isDark: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-md flex items-center justify-center px-4 py-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className={partnerElevated(
              'w-full max-w-md mx-auto rounded-[1.35rem] p-5 sm:p-6 relative max-h-[min(85dvh,calc(100dvh-2rem))] overflow-y-auto',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="ios-glass-sheen pointer-events-none" aria-hidden />
            <GlassIconButton onClick={onClose} className="absolute top-4 right-4 z-10">
              <X size={16} className={isDark ? 'text-white/40' : 'text-[#160510]/40'} />
            </GlassIconButton>
            <h3 className="text-[15px] font-semibold tracking-tight mb-5 pr-8">{title}</h3>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
