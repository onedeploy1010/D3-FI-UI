import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Landmark, UserRound, ClipboardCheck, ScrollText, Activity, Users, ChevronRight } from 'lucide-react';
import { MobileShell } from '@/components/MobileShell';
import { WalletsTab } from '@/pages/tabs/WalletsTab';
import { ApprovalsTab } from '@/pages/tabs/ApprovalsTab';
import { PolicyTab } from '@/pages/tabs/PolicyTab';
import { SecurityTab } from '@/pages/tabs/SecurityTab';
import { AccountsTab } from '@/pages/tabs/AccountsTab';
import { MeTab } from '@/pages/tabs/MeTab';

type Tab = 'wallets' | 'gov' | 'me';
type GovSub = 'approvals' | 'policy' | 'security' | 'accounts';

const GOV_ENTRIES: { id: GovSub; label: string; desc: string; icon: typeof Wallet }[] = [
  { id: 'approvals', label: '待批准事项', desc: 'maker-checker 批准队列 · Turnkey', icon: ClipboardCheck },
  { id: 'policy', label: '策略 Policy', desc: 'Turnkey 策略清单与模版', icon: ScrollText },
  { id: 'security', label: '风控', desc: '偿付能力 · 熔断 · 告警', icon: Activity },
  { id: 'accounts', label: '账户成员', desc: '超级合伙人账户与权限', icon: Users },
];

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'wallets', label: '钱包', icon: Wallet },
  { id: 'gov', label: '治理', icon: Landmark },
  { id: 'me', label: '我的', icon: UserRound },
];

function GovHub({ onOpen }: { onOpen: (s: GovSub) => void }) {
  return (
    <>
      <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">治理</h2>
      <div className="space-y-2.5">
        {GOV_ENTRIES.map((e, i) => (
          <motion.button
            key={e.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onOpen(e.id)}
            className="tap w-full brand-card rounded-2xl p-4 flex items-center gap-3 text-left"
          >
            <span className="w-11 h-11 rounded-xl bg-[#E0568F]/10 flex items-center justify-center text-[#E0568F] shrink-0">
              <e.icon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-[#160510]">{e.label}</div>
              <div className="text-[11px] text-[#8A2B57]/60 mt-0.5">{e.desc}</div>
            </div>
            <ChevronRight size={18} className="text-[#8A2B57]/35 shrink-0" />
          </motion.button>
        ))}
      </div>
    </>
  );
}

export function SuperPartnerHome() {
  const [tab, setTab] = useState<Tab>('wallets');
  const [govSub, setGovSub] = useState<GovSub | null>(null);

  const selectTab = (id: Tab) => {
    setTab(id);
    setGovSub(null);
  };

  let title = 'D3 多签系统';
  let onBack: (() => void) | undefined;
  if (tab === 'me') title = '我的';
  else if (tab === 'gov') {
    if (govSub) {
      title = GOV_ENTRIES.find((e) => e.id === govSub)?.label ?? '治理';
      onBack = () => setGovSub(null);
    } else title = '治理';
  }

  const bottom = (
    <div className="grid grid-cols-3 gap-0.5">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button key={id} type="button" onClick={() => selectTab(id)} className={`tap flex flex-col items-center gap-0.5 py-1.5 rounded-xl ${active ? 'text-[#E0568F]' : 'text-[#8A2B57]/45'}`}>
            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
            <span className="text-[10px] font-bold">{label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <MobileShell title={title} bottom={bottom} onBack={onBack}>
      {tab === 'wallets' && <WalletsTab />}
      {tab === 'me' && <MeTab />}
      {tab === 'gov' && !govSub && <GovHub onOpen={setGovSub} />}
      {tab === 'gov' && govSub === 'approvals' && <ApprovalsTab />}
      {tab === 'gov' && govSub === 'policy' && <PolicyTab />}
      {tab === 'gov' && govSub === 'security' && <SecurityTab />}
      {tab === 'gov' && govSub === 'accounts' && <AccountsTab />}
    </MobileShell>
  );
}
