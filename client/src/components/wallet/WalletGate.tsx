import type { ReactNode } from 'react';
import { FlaskConical, Wallet } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { DEMO_PROFILE } from '@/lib/demoWallet';
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
  const { isConnected, isReady, isConnecting, connect, connectDemo, error } = useWallet();
  const t = lang === 'zh';

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
        <GlassButton
          variant="primary"
          className="w-full !py-3.5"
          onClick={() => void connect()}
          disabled={isConnecting || !isReady}
        >
          {!isReady
            ? t
              ? '正在加载 Privy…'
              : 'Loading Privy…'
            : isConnecting
              ? t
                ? '连接中…'
                : 'Connecting…'
              : t
                ? 'Privy 登录'
                : 'Sign in with Privy'}
        </GlassButton>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1 bg-[#8A2B57]/10 dark:bg-white/10" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#160510]/35 dark:text-white/35">
            {t ? '或' : 'or'}
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
                {t ? '使用演示账户' : 'Use demo account'}
              </div>
              <div className="text-[11px] font-mono text-[#E0568F] mt-0.5">{DEMO_PROFILE.short}</div>
              <p className="text-[11px] text-[#160510]/50 dark:text-white/45 mt-2 leading-relaxed">
                {t ? DEMO_PROFILE.descZh : DEMO_PROFILE.descEn}
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
