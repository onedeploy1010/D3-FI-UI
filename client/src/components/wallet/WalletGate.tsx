import type { ReactNode } from 'react';
import { Wallet } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { GlassButton } from '@/components/ui/GlassSurface';
import { cn } from '@/lib/utils';

type WalletGateProps = {
  children: ReactNode;
  titleZh?: string;
  titleEn?: string;
  descZh?: string;
  descEn?: string;
  lang?: 'zh' | 'en';
};

export function WalletGate({
  children,
  titleZh = '连接 Privy 钱包',
  titleEn = 'Connect with Privy',
  descZh = '通过 Privy 登录并连接以太坊钱包（0x 地址）。账户数据与您的钱包地址绑定。',
  descEn = 'Sign in with Privy and connect your Ethereum wallet (0x address). All data is bound to your wallet.',
  lang = 'zh',
}: WalletGateProps) {
  const { isConnected, isReady, isConnecting, connect, error } = useWallet();
  const t = lang === 'zh';

  if (!isReady) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center page-px py-12">
        <p className="text-sm text-[#160510]/50">{t ? '正在加载 Privy…' : 'Loading Privy…'}</p>
      </div>
    );
  }

  if (isConnected) return <>{children}</>;

  return (
    <div className="min-h-[70vh] flex items-center justify-center page-px py-12">
      <div className={cn('ios-glass-card ios-glass-highlight max-w-md w-full p-8 text-center rounded-3xl')}>
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl ios-glass-inset flex items-center justify-center">
          <Wallet size={28} className="text-[#8A2B57]" />
        </div>
        <h2 className="text-xl font-bold mb-2">{t ? titleZh : titleEn}</h2>
        <p className="text-sm text-[#160510]/55 dark:text-white/55 leading-relaxed mb-6 text-pretty">
          {t ? descZh : descEn}
        </p>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <GlassButton variant="primary" className="w-full !py-3.5" onClick={() => void connect()} disabled={isConnecting}>
          {isConnecting ? (t ? '连接中…' : 'Connecting…') : (t ? 'Privy 登录' : 'Sign in with Privy')}
        </GlassButton>
      </div>
    </div>
  );
}
