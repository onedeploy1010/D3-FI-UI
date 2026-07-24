import { FlaskConical, Loader2, Wallet } from 'lucide-react';
import type { DepositIntent } from '@/lib/depositApi';

/**
 * Payment is sent directly from the user's connected wallet (BSC USDT) — there is
 * no manual "deposit to this address" step anymore. Show a wallet-pay hint before
 * confirming and a waiting animation while the transaction is in flight.
 */
function RealPaymentHint({
  amountUsdt,
  paying,
  isDark,
  label,
}: {
  amountUsdt: number;
  paying: boolean;
  isDark: boolean;
  label: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className={`partner-depth-inset rounded-xl p-4 mb-4 flex items-center gap-3 ${
        isDark ? 'text-white/70' : 'text-[#160510]/70'
      }`}
    >
      {paying ? (
        <Loader2 size={20} className="shrink-0 text-[#E0568F] animate-spin" aria-hidden />
      ) : (
        <Wallet size={20} className="shrink-0 text-[#E0568F]" aria-hidden />
      )}
      <div className="min-w-0">
        <div className={`text-sm font-semibold ${isDark ? 'text-white/90' : 'text-[#160510]/90'}`}>
          {paying ? label('stake.confirmingPayment') : label('stake.payFromWallet')}
        </div>
        <div className="text-[11px] mt-0.5 leading-relaxed">
          {paying
            ? label('stake.confirmingPaymentHint')
            : label('stake.payFromWalletHint', { amount: amountUsdt.toLocaleString() })}
        </div>
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
      <div className="text-[11px] uppercase tracking-widest mb-2 text-amber-500/80">
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
  depositIntent: _depositIntent,
  paying = false,
  isDark,
  label,
}: {
  isDemo: boolean;
  amountUsdt: number;
  depositIntent?: DepositIntent | null;
  paying?: boolean;
  isDark: boolean;
  label: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (isDemo) {
    return <DemoPaymentHint amountUsdt={amountUsdt} isDark={isDark} label={label} />;
  }
  return <RealPaymentHint amountUsdt={amountUsdt} paying={paying} isDark={isDark} label={label} />;
}
