import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  toChecksumAddress,
  isAddress,
  explorerAddressUrl,
  explorerTxUrl,
} from '@/lib/address';
import { useMemberDialog } from './member-dialog-provider';

export type AddressChipProps = {
  /** Wallet address (checksummed on display). Ignored when `txHash` is set. */
  address?: string | null;
  /** When set, the chip represents a tx hash and links to the tx explorer. */
  txHash?: string | null;
  /** `full` shows the entire value (break-all); `compact` shows 0x1234…abcd. */
  variant?: 'full' | 'compact';
  className?: string;
  /** Set false to disable opening the member modal on click (address mode). */
  clickable?: boolean;
};

function compact(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function IconButton({
  label,
  onClick,
  href,
  children,
}: {
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  children: React.ReactNode;
}) {
  const cls =
    'inline-flex items-center justify-center h-6 w-6 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors';
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title={label}
        onClick={(e) => e.stopPropagation()}
        className={cls}
      >
        {children}
      </a>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export function AddressChip({
  address,
  txHash,
  variant = 'full',
  className,
  clickable = true,
}: AddressChipProps) {
  const [copied, setCopied] = useState(false);
  const { open } = useMemberDialog();

  const isTx = Boolean(txHash);
  const raw = (isTx ? txHash : address) ?? '';
  if (!raw) return <span className="text-muted-foreground">—</span>;

  // Addresses are checksummed; tx hashes stay as-is.
  const canonical = !isTx && isAddress(raw) ? toChecksumAddress(raw) : raw;
  const shown = variant === 'compact' ? compact(canonical) : canonical;
  const explorerUrl = isTx ? explorerTxUrl(canonical) : explorerAddressUrl(canonical);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(canonical);
      setCopied(true);
      toast.success('已复制');
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error('复制失败');
    }
  }

  const openModal = !isTx && clickable && isAddress(canonical);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg bg-muted/30 px-1.5 py-0.5 align-middle',
        className,
      )}
    >
      {openModal ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open(canonical);
          }}
          className={cn(
            'font-mono text-xs text-left hover:text-[#E0568F] transition-colors',
            variant === 'full' ? 'break-all' : 'whitespace-nowrap',
          )}
        >
          {shown}
        </button>
      ) : (
        <span
          className={cn(
            'font-mono text-xs',
            variant === 'full' ? 'break-all' : 'whitespace-nowrap',
          )}
        >
          {shown}
        </span>
      )}
      <IconButton label="复制" onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </IconButton>
      <IconButton label="在 BscScan 查看" href={explorerUrl}>
        <ExternalLink className="h-3.5 w-3.5" />
      </IconButton>
    </span>
  );
}
