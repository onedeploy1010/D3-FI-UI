import { FlaskConical } from 'lucide-react';
import type { DepositIntent } from '@/lib/depositApi';

function RealDepositHint({
  intent,
  isDark,
  label,
}: {
  intent: DepositIntent | null | undefined;
  isDark: boolean;
  label: (key: string) => string;
}) {
  if (!intent) return null;
  return (
    <div
      className={`partner-depth-inset rounded-xl p-3 mb-4 text-left ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}
    >
      <div className="text-[10px] uppercase tracking-widest mb-1">{label('stake.depositAddress')}</div>
      <div className={`text-xs font-mono break-all ${isDark ? 'text-white/80' : 'text-[#160510]/80'}`}>
        {intent.depositAddress}
      </div>
      <div className="text-[10px] mt-2">
        {label('stake.depositHint')} · BSC USDT · {intent.expectedAmount} USDT
      </div>
    </div>
  );
}

function DemoPaymentHint({
  amountUsdt,
  isDark,
  label,
}: {
  amountUsdt: number;
  isDark: boolean;
  label: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className={`partner-depth-inset rounded-xl p-3.5 mb-4 text-left border border-amber-500/20 ${
        isDark ? 'text-white/60 bg-amber-500/[0.06]' : 'text-[#160510]/60 bg-amber-500/[0.04]'
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest mb-2 text-amber-500/80">
        {label('stake.payMethod')}
      </div>
      <div className="flex items-start gap-2.5">
        <FlaskConical size={18} className="shrink-0 text-amber-500 mt-0.5" aria-hidden />
        <div>
          <div className={`text-sm font-semibold ${isDark ? 'text-white/90' : 'text-[#160510]/90'}`}>
            {label('stake.demoPayMethod')}
          </div>
          <div className="text-[11px] mt-1 leading-relaxed">
            {label('stake.demoPayHint', { amount: amountUsdt.toLocaleString() })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PartnerPaymentConfirmSection({
  isDemo,
  amountUsdt,
  depositIntent,
  isDark,
  label,
}: {
  isDemo: boolean;
  amountUsdt: number;
  depositIntent?: DepositIntent | null;
  isDark: boolean;
  label: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (isDemo) {
    return <DemoPaymentHint amountUsdt={amountUsdt} isDark={isDark} label={label} />;
  }
  return <RealDepositHint intent={depositIntent} isDark={isDark} label={label} />;
}
