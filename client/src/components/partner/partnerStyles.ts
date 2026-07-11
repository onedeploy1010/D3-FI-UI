import { cn } from '@/lib/utils';

/** Elevated iOS-style surface for partner program cards */
export function partnerElevated(extra?: string) {
  return cn('partner-elevated-card', extra);
}

export function partnerInset(extra?: string) {
  return cn('partner-depth-inset', extra);
}

export function partnerStatTile(extra?: string) {
  return cn('partner-stat-tile', extra);
}

export function partnerModalSurfaces(isDark: boolean) {
  return {
    labelMuted: isDark ? 'text-white/60' : 'text-[#160510]/72',
    panel: isDark
      ? 'bg-white/[0.06] border border-white/12'
      : 'bg-[#FFF8FC] border border-[#8A2B57]/22 shadow-sm',
    hintPanel: isDark
      ? 'bg-[#E0568F]/12 border border-[#E0568F]/28 text-[#f9a8d4]'
      : 'bg-[#FFF0F6] border border-[#E0568F]/35 text-[#6B1D42]',
    inputPanel: isDark
      ? 'bg-black/25 border border-white/10'
      : 'bg-white border border-[#8A2B57]/20 shadow-sm',
    textarea: isDark
      ? 'bg-black/25 border border-white/10 text-white placeholder:text-white/30'
      : 'bg-white border border-[#8A2B57]/20 text-[#160510] placeholder:text-[#160510]/40 shadow-sm',
  };
}
