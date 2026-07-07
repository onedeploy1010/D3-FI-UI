import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

type AddressBlockProps = {
  label?: string;
  value: string;
  isDark: boolean;
  showCopy?: boolean;
};

export function AddressBlock({ label, value, isDark, showCopy = true }: AddressBlockProps) {
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
    <div className={`rounded-xl p-4 ${isDark ? 'bg-[#C9A96E]/[0.04]' : 'bg-[#6B1A3A]/[0.03]'}`}>
      {label && (
        <div className={`text-[10px] mb-2 font-medium ${isDark ? 'text-white/30' : 'text-[#2C2824]/35'}`}>
          {label}
        </div>
      )}
      <div className="flex items-start gap-2">
        <p
          className={`address-full flex-1 min-w-0 select-all ${isDark ? 'text-white/85' : 'text-[#2C2824]/85'}`}
        >
          {value}
        </p>
        {showCopy && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy"
            className={`shrink-0 p-2 rounded-lg transition ${isDark ? 'hover:bg-[#C9A96E]/[0.08]' : 'hover:bg-[#6B1A3A]/[0.06]'}`}
          >
            {copied ? (
              <Check size={14} className="text-emerald-500" />
            ) : (
              <Copy size={14} className={isDark ? 'text-white/45' : 'text-[#2C2824]/45'} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
