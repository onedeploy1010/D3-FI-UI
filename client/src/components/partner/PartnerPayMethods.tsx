import { CreditCard, Globe, Wallet } from 'lucide-react';
import type { PartnerPaymentMethod } from '@/lib/partnerDepositPay';

const METHODS: {
  id: PartnerPaymentMethod;
  titleKey: string;
  hintKey: string;
  Icon: typeof Wallet;
}[] = [
  { id: 'wallet', titleKey: 'stake.payWallet', hintKey: 'stake.payWalletHint', Icon: Wallet },
  { id: 'fiat', titleKey: 'stake.payFiat', hintKey: 'stake.payFiatHint', Icon: CreditCard },
  { id: 'crypto', titleKey: 'stake.payCrossChain', hintKey: 'stake.payCrossChainHint', Icon: Globe },
];

export function PartnerPayMethods({
  method,
  onChange,
  isDark,
  label,
}: {
  method: PartnerPaymentMethod;
  onChange: (method: PartnerPaymentMethod) => void;
  isDark: boolean;
  label: (key: string) => string;
}) {
  return (
    <div className="mb-5">
      <div className={`text-[10px] uppercase tracking-widest mb-2 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
        {label('stake.payMethod')}
      </div>
      <div className="space-y-2">
        {METHODS.map(({ id, titleKey, hintKey, Icon }) => {
          const active = method === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`w-full text-left partner-depth-inset rounded-xl p-3 transition-colors ios-glass-pressable ${
                active ? 'ring-2 ring-[#E0568F]/50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    active ? 'bg-[#E0568F]/15 text-[#E0568F]' : isDark ? 'bg-white/5 text-white/50' : 'bg-black/5 text-[#160510]/45'
                  }`}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                    {label(titleKey)}
                  </div>
                  <div className={`text-[11px] leading-relaxed mt-0.5 ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
                    {label(hintKey)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function partnerPayConfirmLabel(method: PartnerPaymentMethod, label: (key: string) => string): string {
  if (method === 'fiat') return label('stake.payFiatBtn');
  if (method === 'crypto') return label('stake.payCrossChainBtn');
  return label('stake.confirm');
}
