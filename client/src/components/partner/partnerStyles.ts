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
