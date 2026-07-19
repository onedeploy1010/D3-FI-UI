import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/** Small inline copy-to-clipboard button. */
export function CopyButton({ text, size = 13 }: { text: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="tap shrink-0 p-1.5 rounded-lg text-[#8A2B57]/55 bg-[#8A2B57]/[0.06]"
      aria-label="复制"
    >
      {copied ? <Check size={size} className="text-emerald-500" /> : <Copy size={size} />}
    </button>
  );
}
