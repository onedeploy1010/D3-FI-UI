import { useContext, type ReactNode } from 'react';
import { FlaskConical, Wallet } from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { DEMO_PROFILE } from '@/lib/demoWallet';
import { GlassButton } from '@/components/ui/GlassSurface';
import { LanguageContext } from '@/i18n/LanguageContext';
import { usePortalTranslation } from '@/i18n/usePortalTranslation';
import type { AppLang } from '@/i18n/types';
import { cn } from '@/lib/utils';

type WalletGateProps = {
  children: ReactNode;
  /** Optional overrides for the default gate title/description. */
  title?: string;
  desc?: string;
  /** Overrides the global app language (pages with their own local zh/en toggle). */
  lang?: AppLang;
};

export function WalletGate({ children, title, desc, lang }: WalletGateProps) {
  const { isConnected, isPrivyReady, privyInitFailed, isConnecting, connect, connectDemo, error } = useWallet();
  const langCtx = useContext(LanguageContext);
  const appLang: AppLang = lang ?? langCtx?.lang ?? 'zh-CN';
  const t = usePortalTranslation(appLang);

  if (isConnected) return <>{children}</>;

  return (
    <div className="min-h-[70vh] flex items-center justify-center page-px py-12">
      <div className={cn('ios-glass-card ios-glass-highlight max-w-md w-full p-8 text-center rounded-3xl')}>
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl ios-glass-inset flex items-center justify-center">
          <Wallet size={28} className="text-[#8A2B57]" />
        </div>
        <h2 className="text-xl font-bold mb-2">{title ?? t('gate.title')}</h2>
        <p className="text-sm text-[#160510]/55 dark:text-white/55 leading-relaxed mb-6 text-pretty">
          {desc ?? t('gate.desc')}
        </p>
        {error && <p className="text-xs text-red-500 mb-3 text-pretty">{error}</p>}
        {privyInitFailed && !error && (
          <p className="text-xs text-amber-600 mb-3 text-pretty">{t('gate.privyFailed')}</p>
        )}
        <GlassButton
          variant="primary"
          className="w-full !py-3.5"
          onClick={() => connect()}
          disabled={isConnecting}
        >
          {!isPrivyReady && !privyInitFailed
            ? t('gate.loading')
            : isConnecting
              ? t('gate.connecting')
              : privyInitFailed
                ? t('gate.walletUnavailable')
                : t('gate.connectWallet')}
        </GlassButton>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1 bg-[#8A2B57]/10 dark:bg-white/10" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#160510]/35 dark:text-white/35">
            {t('gate.or')}
          </span>
          <div className="h-px flex-1 bg-[#8A2B57]/10 dark:bg-white/10" />
        </div>

        <button
          type="button"
          onClick={() => void connectDemo()}
          disabled={isConnecting}
          className="w-full text-left ios-glass-inset rounded-2xl p-4 ios-glass-pressable disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <FlaskConical size={18} className="text-amber-500" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-sm font-bold text-[#160510] dark:text-white">
                {t('gate.useDemoAccount')}
              </div>
              <div className="text-[11px] font-mono text-[#E0568F] mt-0.5">{DEMO_PROFILE.short}</div>
              <p className="text-[11px] text-[#160510]/50 dark:text-white/45 mt-2 leading-relaxed">
                {t('demo.desc')}
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
