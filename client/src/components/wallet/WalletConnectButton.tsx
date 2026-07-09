import { FlaskConical, LogOut, Wallet } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { DEMO_PROFILE } from '@/lib/demoWallet';
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
  const { isConnected, isDemo, shortAddress, isConnecting, connect, connectDemo, disconnect } = useWallet();
  const t = lang === 'zh';

  const handleDisconnect = () => {
    disconnect();
    onDisconnect?.();
  };

  if (!isConnected) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <button
          type="button"
          onClick={() => void connect()}
          disabled={isConnecting}
          className="h-8 px-2.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5 touch-manipulation disabled:opacity-50"
        >
          <Wallet size={14} />
          {isConnecting ? (t ? '连接中' : '…') : (t ? '连接钱包' : 'Connect')}
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
