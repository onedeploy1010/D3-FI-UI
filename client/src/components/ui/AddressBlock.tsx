import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

type AddressBlockProps = {
  label?: string;
  value: string;
  isDark: boolean;
  showCopy?: boolean;
  compact?: boolean;
};

export function AddressBlock({ label, value, isDark, showCopy = true, compact = false }: AddressBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

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
      <div className="flex items-start gap-2">
        <p
          className={cn(
            'address-full flex-1 min-w-0 select-all',
            compact ? 'text-[11px]' : '',
            isDark ? 'text-white/85' : 'text-[#160510]/85',
          )}
        >
          {value}
        </p>
        {showCopy && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy"
            className={cn(
              'shrink-0 rounded-lg transition',
              compact ? 'p-1.5' : 'p-2',
              isDark ? 'hover:bg-[#E0568F]/[0.08]' : 'hover:bg-[#8A2B57]/[0.06]',
            )}
          >
            {copied ? (
              <Check size={compact ? 12 : 14} className="text-emerald-500" />
            ) : (
              <Copy size={compact ? 12 : 14} className={isDark ? 'text-white/45' : 'text-[#160510]/45'} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
