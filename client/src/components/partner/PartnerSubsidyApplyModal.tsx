import { useEffect, useMemo, useState } from 'react';
import { PartnerModal } from '@/components/partner/PartnerModal';
import {
  clearSubsidyReceiptPreviews,
  PartnerSubsidyReceiptUpload,
  type SubsidyReceiptPreview,
} from '@/components/partner/PartnerSubsidyReceiptUpload';
import { partnerModalSurfaces } from '@/components/partner/partnerStyles';
import type { SubsidyApplicationType } from '@/components/partner/partnerData';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { GlassButton } from '@/components/ui/GlassSurface';
import { uploadSubsidyReceipts } from '@/lib/subsidyReceiptUpload';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

function clampAmount(raw: string, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, max);
}

export function PartnerSubsidyApplyModal({
  open,
  onClose,
  title,
  lang,
  isDark,
  wallet,
  ratePct,
  remainingUsd,
  accentClass,
  purposePlaceholder,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  lang: AppLang;
  isDark: boolean;
  wallet: string | null;
  ratePct: number;
  remainingUsd: number;
  accentClass: string;
  purposePlaceholder: string;
  onSubmit: (input: {
    amountUsd: number;
    purpose: string;
    applicationType: SubsidyApplicationType;
    receiptPaths: string[];
  }) => Promise<boolean>;
}) {
  const p = usePartnerTranslation(lang);
  const ui = partnerModalSurfaces(isDark);
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [applicationType, setApplicationType] = useState<SubsidyApplicationType>('reserve');
  const [receipts, setReceipts] = useState<SubsidyReceiptPreview[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    clearSubsidyReceiptPreviews(receipts);
    setAmount('');
    setPurpose('');
    setApplicationType('reserve');
    setReceipts([]);
    setError('');
    setSubmitting(false);
    setUploading(false);
  };

  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (applicationType === 'reserve') {
      clearSubsidyReceiptPreviews(receipts);
      setReceipts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationType]);

  const amountNum = useMemo(() => clampAmount(amount, remainingUsd), [amount, remainingUsd]);
  const overQuota = amount !== '' && Number(amount) > remainingUsd;

  const submit = async () => {
    if (!wallet) {
      setError(p('subsidy.err.wallet'));
      return;
    }
    if (!purpose.trim()) {
      setError(p('subsidy.err.purpose'));
      return;
    }
    if (amountNum <= 0) {
      setError(p('subsidy.err.amount'));
      return;
    }
    if (amountNum > remainingUsd) {
      setError(p('subsidy.err.quota'));
      return;
    }
    if (applicationType === 'reimbursement' && receipts.length === 0) {
      setError(p('subsidy.err.receipts'));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      let receiptPaths: string[] = [];
      if (applicationType === 'reimbursement') {
        setUploading(true);
        receiptPaths = await uploadSubsidyReceipts(
          wallet,
          receipts.map((r) => r.file),
        );
        setUploading(false);
      }
      const ok = await onSubmit({
        amountUsd: amountNum,
        purpose: purpose.trim(),
        applicationType,
        receiptPaths,
      });
      if (ok) {
        reset();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : p('subsidy.err.upload'));
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const typeBtn = (type: SubsidyApplicationType, label: string) => {
    const active = applicationType === type;
    return (
      <button
        type="button"
        onClick={() => setApplicationType(type)}
        className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition ${
          active
            ? isDark
              ? 'bg-[#E0568F]/20 border-[#E0568F]/40 text-[#f9a8d4]'
              : 'bg-[#E0568F]/12 border-[#E0568F]/35 text-[#8A2B57]'
            : isDark
              ? 'border-white/10 text-white/55 hover:bg-white/[0.04]'
              : 'border-[#8A2B57]/15 text-[#160510]/60 hover:bg-[#E0568F]/5'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <PartnerModal open={open} onClose={onClose} title={title} isDark={isDark}>
      {wallet && (
        <div className={`mb-4 p-3.5 rounded-2xl ${ui.panel}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${ui.labelMuted}`}>
            {p('subsidy.wallet')}
          </div>
          <AddressBlock value={wallet} isDark={isDark} compact surface={isDark ? 'default' : 'solid'} />
        </div>
      )}

      <div className={`p-3.5 mb-4 rounded-2xl flex justify-between items-center ${ui.panel}`}>
        <span className={`text-xs font-semibold ${ui.labelMuted}`}>
          {p('subsidy.quotaRate', { pct: ratePct })}
        </span>
        <span className={`text-base font-bold ${accentClass}`}>${remainingUsd.toLocaleString()}</span>
      </div>

      <div className="mb-4">
        <div className={`text-xs font-semibold mb-2 ${ui.labelMuted}`}>{p('subsidy.applicationType')}</div>
        <div className="flex gap-2">
          {typeBtn('reserve', p('subsidy.typeReserve'))}
          {typeBtn('reimbursement', p('subsidy.typeReimbursement'))}
        </div>
      </div>

      <div className="mb-4">
        <div className={`text-xs font-semibold mb-2 ${ui.labelMuted}`}>{p('subsidy.amountUsdt')}</div>
        <div className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl ${ui.inputPanel}`}>
          <input
            type="number"
            min={0}
            max={remainingUsd}
            value={amount}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                setAmount('');
                return;
              }
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              setAmount(String(Math.min(n, remainingUsd)));
            }}
            placeholder="0"
            className={`flex-1 bg-transparent text-2xl font-bold font-stat outline-none ${
              isDark ? 'text-white placeholder:text-white/30' : 'text-[#160510] placeholder:text-[#160510]/40'
            }`}
          />
          <span className={`text-sm font-semibold shrink-0 ${ui.labelMuted}`}>USDT</span>
          <button
            type="button"
            className={`text-xs font-bold shrink-0 px-2 py-1 rounded-lg ${
              isDark ? 'text-[#E0568F] bg-[#E0568F]/10' : 'text-[#8A2B57] bg-[#E0568F]/15'
            }`}
            onClick={() => setAmount(String(remainingUsd))}
          >
            MAX
          </button>
        </div>
        {overQuota && <p className="text-[11px] text-red-500 mt-1.5">{p('subsidy.err.quota')}</p>}
        {remainingUsd > 0 && (
          <p className={`text-[10px] mt-1.5 ${ui.labelMuted}`}>{p('subsidy.amountMaxHint', { max: remainingUsd })}</p>
        )}
      </div>

      <div className="mb-4">
        <div className={`text-xs font-semibold mb-2 ${ui.labelMuted}`}>{p('subsidy.purpose')}</div>
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={3}
          placeholder={purposePlaceholder}
          className={`w-full px-3.5 py-2.5 text-xs rounded-2xl outline-none resize-none ${ui.textarea}`}
        />
      </div>

      {applicationType === 'reimbursement' && (
        <div className="mb-4">
          <PartnerSubsidyReceiptUpload
            lang={lang}
            isDark={isDark}
            files={receipts}
            onChange={setReceipts}
            uploading={uploading}
          />
        </div>
      )}

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      <GlassButton
        className="w-full !py-3.5"
        disabled={remainingUsd <= 0 || submitting || uploading || overQuota}
        onClick={() => void submit()}
      >
        {submitting || uploading ? p('subsidy.submitting') : p('subsidy.submit')}
      </GlassButton>
    </PartnerModal>
  );
}
