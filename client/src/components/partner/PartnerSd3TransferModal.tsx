import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { PartnerModal } from '@/components/partner/PartnerModal';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { GlassButton } from '@/components/ui/GlassSurface';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

function clampAmount(raw: string, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, max);
}

export function PartnerSd3TransferModal({
  open,
  onClose,
  lang,
  isDark,
  toAddress,
  toLabel,
  transferQuota,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  lang: AppLang;
  isDark: boolean;
  toAddress: string;
  toLabel?: string;
  transferQuota: number;
  onConfirm: (amount: number) => Promise<boolean>;
}) {
  const p = usePartnerTranslation(lang);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const muted = isDark ? 'text-white/50' : 'text-[#160510]/50';

  useEffect(() => {
    if (open) setAmount('');
  }, [open, toAddress]);

  const submit = async () => {
    const n = clampAmount(amount, transferQuota);
    if (n <= 0 || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onConfirm(n);
      if (ok) {
        setAmount('');
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PartnerModal open={open} onClose={onClose} title={p('tree.transferTitle')} isDark={isDark}>
      <p className={`text-[11px] leading-relaxed mb-4 px-3 py-2 rounded-xl ios-glass-inset ${isDark ? 'text-[#E0568F]/80' : 'text-[#8A2B57]/80'}`}>
        {p('assets.transferHint')}
      </p>
      <div className="mb-4">
        <div className={`text-xs font-semibold mb-2 ${muted}`}>{p('tree.transferTo')}</div>
        <AddressBlock label={toLabel} value={toAddress} isDark={isDark} compact />
      </div>
      <div className="ios-glass-inset p-3 flex justify-between items-center text-xs mb-4">
        <span className={muted}>{p('assets.canTransfer')}</span>
        <span className="font-bold text-amber-500">{transferQuota.toLocaleString()} sD3</span>
      </div>
      <div>
        <div className={`text-xs font-semibold mb-2 ${muted}`}>{p('assets.transferAmount')}</div>
        <div className="flex items-center gap-3 ios-glass-inset px-3 py-3">
          <input
            type="number"
            min={0}
            max={transferQuota}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={`flex-1 bg-transparent text-xl font-bold font-stat outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/20'}`}
          />
          <span className={`text-sm shrink-0 ${muted}`}>sD3</span>
          <button
            type="button"
            className="text-[#E0568F] text-xs font-bold shrink-0"
            onClick={() => setAmount(String(transferQuota))}
          >
            MAX
          </button>
        </div>
      </div>
      <GlassButton
        className="w-full !py-3.5 mt-5 flex items-center justify-center gap-2"
        disabled={transferQuota <= 0 || submitting}
        onClick={() => void submit()}
      >
        <Send size={14} /> {submitting ? p('stake.paying') : p('assets.confirmTransfer')}
      </GlassButton>
    </PartnerModal>
  );
}
