import { useState } from 'react';
import { Wallet, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { MobileShell } from '@/components/MobileShell';
import { WalletsTab } from '@/pages/tabs/WalletsTab';
import { TransferTab } from '@/pages/tabs/TransferTab';
import { SecurityTab } from '@/pages/tabs/SecurityTab';

type Tab = 'wallets' | 'transfer' | 'security';

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'wallets', label: '钱包', icon: Wallet },
  { id: 'transfer', label: '转账', icon: ArrowUpRight },
  { id: 'security', label: '风控', icon: ShieldCheck },
];

const TITLES: Record<Tab, string> = {
  wallets: 'D3 多签系统',
  transfer: '发起转账',
  security: 'Policy · 风控',
};

export function SuperPartnerHome() {
  const [tab, setTab] = useState<Tab>('wallets');

  const bottom = (
    <div className="grid grid-cols-3 gap-1">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`tap flex flex-col items-center gap-0.5 py-1.5 rounded-xl ${
              active ? 'text-[#E0568F]' : 'text-[#8A2B57]/45'
            }`}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
            <span className="text-[10px] font-bold">{label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <MobileShell title={TITLES[tab]} bottom={bottom}>
      {tab === 'wallets' && <WalletsTab onGoTransfer={() => setTab('transfer')} />}
      {tab === 'transfer' && <TransferTab />}
      {tab === 'security' && <SecurityTab />}
    </MobileShell>
  );
}
