import { useState, type MouseEvent, type PointerEvent } from 'react';
import { Check, Copy, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/copyToClipboard';

type AddressBlockProps = {
  label?: string;
  value: string;
  isDark: boolean;
  showCopy?: boolean;
  compact?: boolean;
  /** Tighter row height for dashboard headers. */
  dense?: boolean;
  surface?: 'default' | 'solid' | 'inset';
  onTransfer?: () => void;
  transferAriaLabel?: string;
  /** Visible caption under transfer icon, e.g. "sD3". */
  transferLabel?: string;
};

export function AddressBlock({
  label,
  value,
  isDark,
  showCopy = true,
  compact = false,
  dense = false,
  surface = 'default',
  onTransfer,
  transferAriaLabel = 'Transfer',
  transferLabel,
}: AddressBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e?: MouseEvent | PointerEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTransfer = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTransfer?.();
  };

  const actionBtnClass = cn(
    'shrink-0 rounded-lg transition touch-manipulation flex items-center justify-center',
    dense
      ? 'min-w-[40px] min-h-[40px] p-1.5'
      : compact
        ? 'min-w-[44px] min-h-[44px] p-2'
        : 'min-w-[48px] min-h-[48px] p-2.5',
    isDark ? 'hover:bg-[#E0568F]/[0.12] active:bg-[#E0568F]/20' : 'hover:bg-[#8A2B57]/[0.08] active:bg-[#8A2B57]/12',
  );

  const resolvedSurface = surface === 'inset' || dense ? 'inset' : surface;

  return (
    <div
      className={cn(
        'rounded-xl',
        dense ? 'px-2 py-1.5' : compact ? 'p-2.5' : 'p-4',
        resolvedSurface === 'inset'
          ? 'partner-depth-inset'
          : resolvedSurface === 'solid'
            ? isDark
              ? 'bg-white/[0.06] border border-white/10'
              : 'bg-white border border-[#8A2B57]/16'
            : isDark
              ? 'bg-[#E0568F]/[0.04]'
              : 'bg-[#8A2B57]/[0.03]',
      )}
    >
      {label && (
        <div
          className={cn(
            'font-medium',
            dense ? 'text-[9px] mb-1' : 'text-[10px] mb-2',
            isDark ? 'text-white/40' : 'text-[#160510]/55',
          )}
        >
          {label}
        </div>
      )}
      <div className={cn('flex gap-1.5 min-w-0', dense ? 'items-center' : 'items-start gap-2')}>
        <p
          className={cn(
            'address-full flex-1 min-w-0 select-all leading-snug',
            dense ? 'text-[11px]' : compact ? 'text-[11px]' : '',
            isDark ? 'text-white/90' : 'text-[#160510]',
          )}
        >
          {value}
        </p>
        <div className="flex items-start gap-0.5 shrink-0">
          {showCopy && (
            <button
              type="button"
              onClick={(e) => void handleCopy(e)}
              aria-label="Copy"
              className={actionBtnClass}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {copied ? (
                <Check size={compact ? 12 : 14} className="text-emerald-500" />
              ) : (
                <Copy size={compact ? 12 : 14} className={isDark ? 'text-white/45' : 'text-[#160510]/45'} />
              )}
            </button>
          )}
          {onTransfer && (
            <button
              type="button"
              onClick={handleTransfer}
              aria-label={transferAriaLabel}
              className={cn(
                actionBtnClass,
                'flex flex-col items-center justify-center gap-0.5',
                compact ? 'min-w-[2.25rem]' : 'min-w-[2.5rem]',
              )}
            >
              <Send size={compact ? 12 : 14} className="text-amber-500" />
              {transferLabel && (
                <span className="text-[8px] font-bold leading-none text-amber-500 whitespace-nowrap">
                  {transferLabel}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
