import { motion } from 'framer-motion';

export function PartnerReferralLoading({
  label,
  isDark,
  className = '',
}: {
  label: string;
  isDark: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-20 ${className}`}>
      <div className="relative w-20 h-20 mb-5">
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(224,86,143,0.35) 0%, transparent 70%)',
          }}
          animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute inset-1 rounded-full border-2 border-[#E0568F]/25 border-t-[#E0568F]"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute inset-3 rounded-full border border-[#E0568F]/15 border-b-[#E0568F]/60"
          animate={{ rotate: -360 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            className="w-3 h-3 rounded-full bg-[#E0568F]"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
      <motion.p
        className={`text-sm font-medium tracking-wide ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}
        animate={{ opacity: [0.45, 0.85, 0.45] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        {label}
      </motion.p>
    </div>
  );
}
