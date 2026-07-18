import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

const EXPLORER = 'https://bscscan.com/address/';

/**
 * Full wallet address (never truncated) + copy button + block-explorer (BscScan)
 * link. Address wraps (break-all) so the whole thing is always verifiable.
 */
export function AddressDisplay({
  address,
  label,
}: {
  address: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="rounded-xl bg-[#8A2B57]/[0.05] border border-[#8A2B57]/10 px-3 py-2">
      {label && <div className="text-[10px] font-semibold text-[#8A2B57]/60 mb-0.5">{label}</div>}
      <div className="flex items-start gap-2">
        <span className="flex-1 min-w-0 font-mono text-[11px] leading-[1.5] text-[#160510] break-all">
          {address}
        </span>
        <div className="flex items-center gap-1 shrink-0 pt-0.5">
          <button
            type="button"
            onClick={copy}
            className="tap p-1.5 rounded-lg text-[#8A2B57]/60 bg-white/60"
            aria-label="复制地址"
          >
            {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
          </button>
          <a
            href={`${EXPLORER}${address}`}
            target="_blank"
            rel="noreferrer"
            className="tap p-1.5 rounded-lg text-[#8A2B57]/60 bg-white/60"
            aria-label="在区块浏览器查看"
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </div>
  );
}
