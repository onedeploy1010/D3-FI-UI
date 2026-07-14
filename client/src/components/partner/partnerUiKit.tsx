import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { GlassChip } from '@/components/ui/GlassSurface';
import { cn } from '@/lib/utils';
import type { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

export function PartnerLevelBadge({
  label,
  className = '',
}: {
  label: string;
  className?: string;
}) {
  return (
    <GlassChip
      className={`!py-1 !px-2.5 text-[10px] font-bold partner-level-badge w-fit ${className}`}
      style={{ color: '#E0568F' }}
    >
      {label}
    </GlassChip>
  );
}

export function PartnerTagChip({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide ${
        accent
          ? 'bg-[#E0568F]/15 text-[#E0568F] border border-[#E0568F]/25'
          : 'partner-depth-inset text-[#8A2B57]/80 dark:text-white/55'
      }`}
    >
      {children}
    </span>
  );
}

/** Numeric UD3 with smaller unit suffix. */
export function PartnerSd3Amount({
  value,
  className = '',
  unitClassName = 'text-[0.62em] font-semibold opacity-75 ml-0.5 align-baseline',
}: {
  value: number;
  className?: string;
  unitClassName?: string;
}) {
  return (
    <span className={className}>
      {value.toLocaleString()}
      <span className={unitClassName}>UD3</span>
    </span>
  );
}

export function PartnerInsetCell({
  label,
  value,
  isDark,
  accent,
}: {
  label: string;
  value: string;
  isDark: boolean;
  accent?: boolean;
}) {
  return (
    <div className="partner-inset-cell p-2.5 rounded-xl text-center">
      <div className={`text-[9px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
        {label}
      </div>
      <div className={`text-xs font-bold leading-tight ${accent ? 'text-[#E0568F]' : isDark ? 'text-white' : 'text-[#160510]'}`}>
        {value}
      </div>
    </div>
  );
}

export function PartnerRaisedButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
  'data-guide': dataGuide,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  className?: string;
  'data-guide'?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-guide={dataGuide}
      className={`partner-raised-btn flex-1 py-2.5 px-3 rounded-xl text-[11px] font-bold ios-glass-pressable disabled:opacity-40 disabled:pointer-events-none ${
        variant === 'primary'
          ? 'partner-raised-btn-primary text-white'
          : 'partner-raised-btn-secondary text-[#E0568F]'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function PartnerAnimatedBar({
  label,
  value,
  display,
  max,
  isDark,
  accent = '#E0568F',
  badge,
}: {
  label: string;
  value: number;
  display: string;
  max: number;
  isDark: boolean;
  accent?: string;
  badge?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-2">
        <span className={`text-[10px] font-semibold ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>{label}</span>
        <div className="text-right">
          <span className="text-xs font-bold" style={{ color: accent }}>
            {display}
          </span>
          {badge && (
            <span className="block text-[9px] font-semibold text-amber-500/90 mt-0.5">{badge}</span>
          )}
        </div>
      </div>
      <div className="partner-depth-inset h-2 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${accent}88, ${accent})` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

export function PartnerDualAnimatedBar({
  title,
  totalLabel,
  totalValue,
  totalDisplay,
  newLabel,
  newValue,
  newDisplay,
  isDark,
  totalAccent = '#E0568F',
  newAccent = '#f472b6',
  badge,
  featured = false,
  featuredHint,
}: {
  title: string;
  totalLabel: string;
  totalValue: number;
  totalDisplay: string;
  newLabel: string;
  newValue: number;
  newDisplay: string;
  isDark: boolean;
  totalAccent?: string;
  newAccent?: string;
  badge?: string;
  featured?: boolean;
  featuredHint?: string;
}) {
  const max = Math.max(totalValue, newValue, 1);
  const totalPct = Math.min(100, (totalValue / max) * 100);
  const newPct = Math.min(100, (newValue / max) * 100);
  const muted = isDark ? 'text-white/50' : 'text-[#160510]/55';

  return (
    <div
      className={cn(
        'partner-metric-shell relative overflow-hidden rounded-xl px-3 py-2.5',
        featured && 'partner-metric-featured',
      )}
    >
      {featured && <div className="partner-metric-featured-glow pointer-events-none" aria-hidden />}

      <div className="relative flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              'text-xs font-bold tracking-wide truncate',
              featured
                ? isDark
                  ? 'text-[#f9a8d4]'
                  : 'text-[#8A2B57]'
                : isDark
                  ? 'text-white/60'
                  : 'text-[#160510]/65',
            )}
          >
            {title}
          </span>
          {featuredHint && (
            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md partner-metric-pill-accent">
              {featuredHint}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2.5">
        <div className="partner-metric-stat rounded-lg px-2.5 py-1.5">
          <div className={`text-[10px] font-semibold mb-0.5 ${muted}`}>{totalLabel}</div>
          <div className="text-xs font-bold leading-tight tracking-tight" style={{ color: totalAccent }}>
            {totalDisplay}
          </div>
        </div>
        <div className="partner-metric-stat rounded-lg px-2.5 py-1.5">
          <div className={`text-[10px] font-semibold mb-0.5 flex items-center flex-wrap gap-1 ${muted}`}>
            <span>{newLabel}</span>
            {badge && (
              <span className="text-[8px] font-medium text-amber-500/90 px-1 py-0 rounded bg-amber-500/10 border border-amber-500/18 leading-none scale-95 origin-left">
                {badge}
              </span>
            )}
          </div>
          <div className="text-xs font-bold leading-tight tracking-tight" style={{ color: newAccent }}>
            {newDisplay}
          </div>
        </div>
      </div>

      <div className="partner-metric-track relative h-2.5 rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: `linear-gradient(90deg, ${totalAccent}28, ${totalAccent}a8)` }}
          initial={{ width: 0 }}
          animate={{ width: `${totalPct}%` }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        />
        <motion.div
          className="absolute inset-y-[1px] left-0 rounded-full z-[1]"
          style={{
            background: `linear-gradient(90deg, ${newAccent}b3, ${newAccent})`,
            boxShadow: newPct > 0 ? `0 0 8px ${newAccent}55` : undefined,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${newPct}%` }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
        />
      </div>
    </div>
  );
}

export type PartnerSortDir = 'desc' | 'asc';

export function PartnerListFilters({
  isDark,
  p,
  search,
  onSearchChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  sortLabel,
  sortValue,
  sortOptions,
  onSortChange,
}: {
  isDark: boolean;
  p: ReturnType<typeof usePartnerTranslation>;
  search: string;
  onSearchChange: (v: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  sortLabel: string;
  sortValue: string;
  sortOptions: { id: string; label: string }[];
  onSortChange: (v: string) => void;
}) {
  return (
    <div className="partner-depth-inset p-3 rounded-2xl space-y-2">
      <div className="flex items-center gap-2 px-2 py-2 rounded-xl partner-inset-cell">
        <Search size={14} className={isDark ? 'text-white/45' : 'text-[#160510]/45'} />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={p('filters.search')}
          className={`flex-1 bg-transparent text-xs outline-none ${isDark ? 'text-white placeholder:text-white/25' : 'text-[#160510] placeholder:text-[#160510]/40'}`}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className={`partner-inset-cell px-3 py-2 text-xs rounded-xl outline-none ${isDark ? 'text-white' : 'text-[#160510]'}`}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className={`partner-inset-cell px-3 py-2 text-xs rounded-xl outline-none ${isDark ? 'text-white' : 'text-[#160510]'}`}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-semibold shrink-0 ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
          {sortLabel}
        </span>
        <select
          value={sortValue}
          onChange={(e) => onSortChange(e.target.value)}
          className={`flex-1 partner-inset-cell px-3 py-2 text-xs rounded-xl outline-none ${isDark ? 'text-white bg-transparent' : 'text-[#160510] bg-transparent'}`}
        >
          {sortOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
