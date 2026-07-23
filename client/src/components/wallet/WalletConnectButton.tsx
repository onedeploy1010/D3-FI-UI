import { useContext } from 'react';
import { FlaskConical, LogOut, Wallet } from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { LanguageContext } from '@/i18n/LanguageContext';
import { usePortalTranslation } from '@/i18n/usePortalTranslation';
import type { AppLang } from '@/i18n/types';
import { cn } from '@/lib/utils';

type WalletConnectButtonProps = {
  /** Overrides the global app language (pages with their own local zh/en toggle). */
  lang?: AppLang;
  className?: string;
  showDisconnect?: boolean;
  showDemoConnect?: boolean;
  onDisconnect?: () => void;
};

export function WalletConnectButton({
  lang,
  className,
  showDisconnect = true,
  showDemoConnect = true,
  onDisconnect,
}: WalletConnectButtonProps) {
  const {
    isConnected,
    isDemo,
    shortAddress,
    isConnecting,
    isPrivyReady,
    privyInitFailed,
    error,
    connect,
    connectDemo,
    disconnect,
  } = useWallet();
  const langCtx = useContext(LanguageContext);
  const appLang: AppLang = lang ?? langCtx?.lang ?? 'zh-CN';
  const t = usePortalTranslation(appLang);

  const handleConnect = () => {
    connect();
  };

  const handleDisconnect = () => {
    disconnect();
    onDisconnect?.();
  };

  if (!isConnected) {
    return (
      <div className={cn('flex flex-col items-end gap-0.5', className)}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleConnect}
            disabled={isConnecting}
            className="h-8 px-2.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5 touch-manipulation disabled:opacity-50"
          >
            <Wallet size={14} />
            {!isPrivyReady && !privyInitFailed
              ? t('connect.loading')
              : isConnecting
                ? t('connect.connecting')
                : privyInitFailed
                  ? t('connect.privyUnavailable')
                  : t('connect.connect')}
          </button>
          {showDemoConnect && (
            <button
              type="button"
              onClick={() => void connectDemo()}
              disabled={isConnecting}
              title={t('demo.desc')}
              className="h-8 px-2 rounded-md text-[10px] font-semibold text-amber-600/90 hover:text-amber-600 hover:bg-amber-500/10 transition-colors inline-flex items-center gap-1 touch-manipulation disabled:opacity-50"
            >
              <FlaskConical size={12} />
              {t('demo.tag')}
            </button>
          )}
        </div>
        {error && (
          <p className="max-w-[14rem] text-[9px] leading-snug text-red-500 text-right">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {isDemo && (
        <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600">
          {t('demo.tag')}
        </span>
      )}
      <span className="hidden min-[380px]:inline text-[11px] font-mono font-semibold text-muted-foreground max-w-[9rem] truncate px-2 py-1 rounded-md bg-card border border-border/60">
        {shortAddress}
      </span>
      {showDisconnect && (
        <button
          type="button"
          onClick={handleDisconnect}
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors touch-manipulation"
          aria-label={t('connect.disconnect')}
        >
          <LogOut size={14} />
        </button>
      )}
    </div>
  );
}
