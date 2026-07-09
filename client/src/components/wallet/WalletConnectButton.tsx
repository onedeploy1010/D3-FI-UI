import { LogOut, Wallet } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { cn } from '@/lib/utils';

type WalletConnectButtonProps = {
  lang?: 'zh' | 'en';
  className?: string;
  showDisconnect?: boolean;
  onDisconnect?: () => void;
};

export function WalletConnectButton({
  lang = 'zh',
  className,
  showDisconnect = true,
  onDisconnect,
}: WalletConnectButtonProps) {
  const { isConnected, shortAddress, isConnecting, connect, disconnect } = useWallet();
  const t = lang === 'zh';

  const handleDisconnect = () => {
    disconnect();
    onDisconnect?.();
  };

  if (!isConnected) {
    return (
      <button
        type="button"
        onClick={() => void connect()}
        disabled={isConnecting}
        className={cn(
          'h-8 px-2.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5 touch-manipulation disabled:opacity-50',
          className,
        )}
      >
        <Wallet size={14} />
        {isConnecting ? (t ? '连接中' : '…') : (t ? '连接钱包' : 'Connect')}
      </button>
    );
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
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
