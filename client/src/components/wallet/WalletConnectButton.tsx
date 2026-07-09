import { FlaskConical, LogOut, Wallet } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { DEMO_PROFILE } from '@/lib/demoWallet';
import { isMobileBrowser } from '@/lib/tokenPocket';
import { cn } from '@/lib/utils';

type WalletConnectButtonProps = {
  lang?: 'zh' | 'en';
  className?: string;
  showDisconnect?: boolean;
  showDemoConnect?: boolean;
  onDisconnect?: () => void;
};

export function WalletConnectButton({
  lang = 'zh',
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
    connectTokenPocket,
    connectDemo,
    disconnect,
  } = useWallet();
  const t = lang === 'zh';
  const privyBlocked = privyInitFailed || !isPrivyReady;

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
            onClick={() => connectTokenPocket()}
            disabled={isConnecting || privyBlocked}
            className="h-8 px-2.5 rounded-md text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-500/10 transition-colors inline-flex items-center gap-1 touch-manipulation disabled:opacity-50"
          >
            {t ? 'TP钱包' : 'TokenPocket'}
          </button>
          <button
            type="button"
            onClick={() => connect()}
            disabled={isConnecting || privyBlocked}
            className="h-8 px-2.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5 touch-manipulation disabled:opacity-50"
          >
            <Wallet size={14} />
            {!isPrivyReady && !privyInitFailed
              ? t
                ? '加载中'
                : '…'
              : isConnecting
                ? t
                  ? '连接中'
                  : '…'
                : privyInitFailed
                  ? t
                    ? 'Privy 不可用'
                    : 'Unavailable'
                  : t
                    ? '其他钱包'
                    : 'Other'}
          </button>
          {showDemoConnect && (
            <button
              type="button"
              onClick={() => void connectDemo()}
              disabled={isConnecting}
              title={t ? DEMO_PROFILE.descZh : DEMO_PROFILE.descEn}
              className="h-8 px-2 rounded-md text-[10px] font-semibold text-amber-600/90 hover:text-amber-600 hover:bg-amber-500/10 transition-colors inline-flex items-center gap-1 touch-manipulation disabled:opacity-50"
            >
              <FlaskConical size={12} />
              {t ? '演示' : 'Demo'}
            </button>
          )}
        </div>
        {isMobileBrowser() && !error && (
          <p className="max-w-[14rem] text-[9px] leading-snug text-muted-foreground text-right">
            {t ? '手机请优先点「TP钱包」在 App 内打开' : 'On mobile, tap TokenPocket first'}
          </p>
        )}
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
          {t ? DEMO_PROFILE.tagZh : DEMO_PROFILE.tagEn}
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
          aria-label={t ? '断开钱包' : 'Disconnect'}
        >
          <LogOut size={14} />
        </button>
      )}
    </div>
  );
}
