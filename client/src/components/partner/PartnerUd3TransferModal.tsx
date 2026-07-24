import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { PartnerModal } from '@/components/partner/PartnerModal';
import { PartnerLevelBadge, PartnerUd3Amount } from '@/components/partner/partnerUiKit';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { GlassButton } from '@/components/ui/GlassSurface';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

function clampAmount(raw: string, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, max);
}

export function PartnerUd3TransferModal({
  open,
  onClose,
  lang,
  isDark,
  toAddress,
  levelLabel,
  layerLabel,
  recipientIsDirect = false,
  toAlias,
  transferQuota,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  lang: AppLang;
  isDark: boolean;
  toAddress: string;
  /** Partner tier label — same as team tree level badge. */
  levelLabel: string;
  /** Direct / layer depth chip, e.g. 直推、二层. */
  layerLabel?: string;
  recipientIsDirect?: boolean;
  /** Optional remark alias for the recipient. */
  toAlias?: string;
  transferQuota: number;
  onConfirm: (amount: number) => Promise<boolean>;
}) {
  const p = usePartnerTranslation(lang);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const labelMuted = isDark ? 'text-white/60' : 'text-[#160510]/72';
  const panelClass = isDark
    ? 'bg-white/[0.06] border border-white/12'
    : 'bg-[#FFF8FC] border border-[#8A2B57]/22 shadow-sm';
  const inputPanelClass = isDark
    ? 'bg-black/25 border border-white/10'
    : 'bg-white border border-[#8A2B57]/20 shadow-sm';

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
    <PartnerModal open={open} onClose={onClose} title={p('assets.balanceTitle')} isDark={isDark}>
      <div className={`mb-4 p-3.5 rounded-2xl ${panelClass}`}>
        <div className={`text-[11px] font-semibold uppercase tracking-widest mb-2 ${labelMuted}`}>
          {p('tree.transferTo')}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          <PartnerLevelBadge label={levelLabel} />
          {layerLabel ? (
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                recipientIsDirect
                  ? 'text-[#E0568F] bg-[#E0568F]/10 border border-[#E0568F]/20'
                  : isDark
                    ? 'text-white/45 bg-white/[0.06] border border-white/10'
                    : 'text-[#160510]/50 bg-[#160510]/5 border border-[#160510]/10'
              }`}
            >
              {layerLabel}
            </span>
          ) : null}
          {toAlias ? (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-[#E0568F] bg-[#E0568F]/10 border border-[#E0568F]/20 max-w-[8rem] truncate">
              {toAlias}
            </span>
          ) : null}
        </div>
        <AddressBlock value={toAddress} isDark={isDark} compact showCopy />
      </div>

      <div className={`p-3.5 rounded-2xl flex justify-between items-center mb-4 ${panelClass}`}>
        <span className={`text-xs font-semibold ${labelMuted}`}>{p('assets.balanceTitle')}</span>
        <span className={`text-base font-bold ${isDark ? 'text-amber-400' : 'text-[#d97706]'}`}>
          <PartnerUd3Amount value={transferQuota} />
        </span>
      </div>

      <div>
        <div className={`text-xs font-semibold mb-2 ${labelMuted}`}>{p('assets.transferAmount')}</div>
        <div className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl ${inputPanelClass}`}>
          <input
            type="number"
            min={0}
            max={transferQuota}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={`flex-1 bg-transparent text-2xl font-bold font-stat outline-none ${
              isDark ? 'text-white placeholder:text-white/30' : 'text-[#160510] placeholder:text-[#160510]/40'
            }`}
          />
          <span className={`text-sm font-semibold shrink-0 ${isDark ? 'text-white/60' : 'text-[#160510]/65'}`}>
            UD3
          </span>
          <button
            type="button"
            className={`text-xs font-bold shrink-0 px-2 py-1 rounded-lg ${
              isDark ? 'text-[#E0568F] bg-[#E0568F]/10' : 'text-[#8A2B57] bg-[#E0568F]/15'
            }`}
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
