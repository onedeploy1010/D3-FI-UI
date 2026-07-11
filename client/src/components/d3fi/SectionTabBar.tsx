import { motion } from 'framer-motion';

export type SectionTab = { id: string; label: string };

export function SectionTabBar({
  tabs,
  active,
  onChange,
  isDark,
}: {
  tabs: SectionTab[];
  active: string;
  onChange: (id: string) => void;
  isDark: boolean;
}) {
  if (tabs.length <= 1) return null;

  return (
    <div className="sticky top-[calc(3.25rem+env(safe-area-inset-top))] md:top-[4.25rem] z-30 -mx-0.5 mb-5">
      <div className="ios-glass-tab-bar flex gap-1">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`relative flex-1 py-2.5 px-1 sm:px-2 rounded-xl font-semibold transition-colors ios-glass-pressable ${
                tabs.length > 4 ? 'text-[10px]' : 'text-xs'
              } ${
                isActive
                  ? isDark
                    ? 'text-[#f9a8d4]'
                    : 'text-[#7A2450]'
                  : isDark
                    ? 'text-white/40'
                    : 'text-[#160510]/40'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="d3fi-section-tab"
                  className="ios-glass-tab-active absolute inset-0"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
