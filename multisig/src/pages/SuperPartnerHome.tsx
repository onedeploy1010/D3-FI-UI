import { useState } from 'react';
import { Wallet, ArrowUpRight, ClipboardCheck, ScrollText, Activity } from 'lucide-react';
import { MobileShell } from '@/components/MobileShell';
import { WalletsTab } from '@/pages/tabs/WalletsTab';
import { TransferTab } from '@/pages/tabs/TransferTab';
import { ApprovalsTab } from '@/pages/tabs/ApprovalsTab';
import { PolicyTab } from '@/pages/tabs/PolicyTab';
import { SecurityTab } from '@/pages/tabs/SecurityTab';

type Tab = 'wallets' | 'transfer' | 'approvals' | 'policy' | 'security';

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'wallets', label: '钱包', icon: Wallet },
  { id: 'transfer', label: '转账', icon: ArrowUpRight },
  { id: 'approvals', label: '批准', icon: ClipboardCheck },
  { id: 'policy', label: '策略', icon: ScrollText },
  { id: 'security', label: '风控', icon: Activity },
];

const TITLES: Record<Tab, string> = {
  wallets: 'D3 多签系统',
  transfer: '发起转账',
  approvals: '待批准事项',
  policy: 'Policy 策略',
  security: 'Policy · 风控',
};

export function SuperPartnerHome() {
  const [tab, setTab] = useState<Tab>('wallets');

  const bottom = (
    <div className="grid grid-cols-5 gap-0.5">
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
            <Icon size={19} strokeWidth={active ? 2.5 : 2} />
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
      {tab === 'approvals' && <ApprovalsTab />}
      {tab === 'policy' && <PolicyTab />}
      {tab === 'security' && <SecurityTab />}
    </MobileShell>
  );
}
