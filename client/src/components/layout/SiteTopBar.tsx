import type { ReactNode } from 'react';
import { useContext } from 'react';
import { D3Logo } from '@/components/D3Logo';
import { WalletConnectButton } from '@/components/wallet/WalletConnectButton';
import { SiteNotificationBell } from '@/components/layout/SiteNotificationBell';
import { AppLanguageSwitcher } from '@/components/layout/AppLanguageSwitcher';
import { LanguageContext } from '@/i18n/LanguageContext';
import { toLegacyLang, type AppLang } from '@/i18n/types';
import { cn } from '@/lib/utils';

type SiteTopBarProps = {
  /** @deprecated use LanguageProvider */
  lang?: 'zh' | 'en';
  /** @deprecated use LanguageProvider */
  onLangToggle?: () => void;
  logoTo?: string;
  logoSize?: number;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  onDisconnect?: () => void;
  showNotifications?: boolean;
  isDark?: boolean;
  className?: string;
};

export function SiteTopBar({
  lang: legacyLang,
  onLangToggle,
  logoTo = '/',
  logoSize = 46,
  leftSlot,
  rightSlot,
  onDisconnect,
  showNotifications = true,
  isDark,
  className,
}: SiteTopBarProps) {
  const langCtx = useContext(LanguageContext);
  const appLang: AppLang = langCtx?.lang ?? (legacyLang === 'en' ? 'en' : 'zh-CN');
  const legacy = toLegacyLang(appLang);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 safe-area-pt',
        className,
      )}
    >
      <div className="h-12 sm:h-11 flex items-center justify-between gap-2 page-px">
        <div className="flex items-center gap-2 min-w-0">
          {leftSlot}
          <D3Logo size={logoSize} showText to={logoTo} className="min-w-0 shrink" />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {rightSlot}
          {showNotifications && <SiteNotificationBell lang={legacy} isDark={isDark} />}
          {langCtx ? (
            <AppLanguageSwitcher />
          ) : (
            onLangToggle && (
              <button
                type="button"
                onClick={onLangToggle}
                className="h-8 min-w-[2.25rem] px-2 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors touch-manipulation"
              >
                {legacyLang === 'zh' ? 'EN' : '中文'}
              </button>
            )
          )}
          <WalletConnectButton lang={legacy} onDisconnect={onDisconnect} />
        </div>
      </div>
    </header>
  );
}
