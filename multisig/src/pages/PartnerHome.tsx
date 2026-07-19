import { TrendingUp, HandCoins, FileText, Users, ClipboardCheck, ChevronRight } from 'lucide-react';
import { MobileShell } from '@/components/MobileShell';
import { AddressDisplay } from '@/components/AddressDisplay';
import { shortAddr } from '@/lib/supabase';

type Section = {
  icon: typeof TrendingUp;
  title: string;
  desc: string;
  soon?: boolean;
};

const SECTIONS: Section[] = [
  { icon: TrendingUp, title: '我的业绩', desc: '伞下入金 · 团队业绩 · 反向金 UD3' },
  { icon: HandCoins, title: '补贴申请', desc: '合伙人补贴 / 市场补贴申请与进度' },
  { icon: FileText, title: '申请事项模版', desc: '常用申请事项的标准模版' },
  { icon: Users, title: '任命委员会', desc: '发起 / 参与委员会任命', soon: true },
  { icon: ClipboardCheck, title: '事件多签批准', desc: '合伙人事务的多方签名批准', soon: true },
];

export function PartnerHome({ address, onLogout }: { address: string; onLogout: () => void }) {
  return (
    <MobileShell title="合伙人中心" subtitle={`合伙人 · ${shortAddr(address)}`} onLogout={onLogout}>
      <AddressDisplay address={address} label="我的钱包" />

      <div className="space-y-2.5">
        {SECTIONS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            style={{ ['--d' as string]: `${i * 45}ms` }}
            className="tap w-full brand-card rounded-2xl p-4 flex items-center gap-3 text-left"
          >
            <span className="w-11 h-11 rounded-xl bg-[#E0568F]/10 flex items-center justify-center text-[#E0568F] shrink-0">
              <s.icon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-[#160510]">{s.title}</span>
                {s.soon && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-amber-700 bg-amber-500/12">即将开放</span>
                )}
              </div>
              <div className="text-[11px] text-[#8A2B57]/60 mt-0.5">{s.desc}</div>
            </div>
            <ChevronRight size={18} className="text-[#8A2B57]/35 shrink-0" />
          </button>
        ))}
      </div>

      <p className="text-center text-[10px] text-[#8A2B57]/40 pt-1">合伙人功能陆续开放中</p>
    </MobileShell>
  );
}
