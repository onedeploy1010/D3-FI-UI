import { useState, type MouseEvent } from 'react';
import { Check, Copy, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

type AddressBlockProps = {
  label?: string;
  value: string;
  isDark: boolean;
  showCopy?: boolean;
  compact?: boolean;
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
  onTransfer,
  transferAriaLabel = 'Transfer',
  transferLabel,
}: AddressBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleTransfer = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTransfer?.();
  };

  const actionBtnClass = cn(
    'shrink-0 rounded-lg transition',
    compact ? 'p-1.5' : 'p-2',
    isDark ? 'hover:bg-[#E0568F]/[0.08]' : 'hover:bg-[#8A2B57]/[0.06]',
  );

  return (
    <div
      className={cn(
        'rounded-xl',
        compact ? 'p-2.5' : 'p-4',
        isDark ? 'bg-[#E0568F]/[0.04]' : 'bg-[#8A2B57]/[0.03]',
      )}
    >
      {label && (
        <div className={`text-[10px] mb-2 font-medium ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
          {label}
        </div>
      )}
      <div className="flex items-start gap-2 min-w-0">
        <p
          className={cn(
            'address-full flex-1 min-w-0 select-all',
            compact ? 'text-[11px]' : '',
            isDark ? 'text-white/85' : 'text-[#160510]/85',
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
