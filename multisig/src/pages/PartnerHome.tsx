import { useEffect, useState } from 'react';
import { TrendingUp, HandCoins, FileText, Users, ClipboardCheck, ChevronRight } from 'lucide-react';
import { MobileShell } from '@/components/MobileShell';
import { AddressDisplay } from '@/components/AddressDisplay';
import { PartnerPerformance } from '@/pages/tabs/PartnerPerformance';
import { PartnerSubsidy } from '@/pages/tabs/PartnerSubsidy';
import { fetchPartnerProfile, type PartnerProfile } from '@/lib/siwe';
import { shortAddr } from '@/lib/supabase';

type Sub = 'performance' | 'subsidy' | 'templates' | 'committee' | 'events';

const SECTIONS: { id: Sub; icon: typeof TrendingUp; title: string; desc: string; soon?: boolean }[] = [
  { id: 'performance', icon: TrendingUp, title: '我的业绩', desc: '伞下入金 · 团队业绩 · 反向金 UD3' },
  { id: 'subsidy', icon: HandCoins, title: '补贴申请', desc: '合伙人补贴 / 市场补贴申请与进度' },
  { id: 'templates', icon: FileText, title: '申请事项模版', desc: '常用申请事项的标准模版', soon: true },
  { id: 'committee', icon: Users, title: '任命委员会', desc: '发起 / 参与委员会任命', soon: true },
  { id: 'events', icon: ClipboardCheck, title: '事件多签批准', desc: '合伙人事务的多方签名批准', soon: true },
];

export function PartnerHome({ address, onLogout }: { address: string; onLogout: () => void }) {
  const [sub, setSub] = useState<Sub | null>(null);
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchPartnerProfile(address);
        if (!cancelled) setProfile(p);
      } catch {
        /* keep null */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const current = SECTIONS.find((s) => s.id === sub);
  const title = current ? current.title : '合伙人中心';
  const onBack = sub ? () => setSub(null) : undefined;

  return (
    <MobileShell title={title} subtitle={`合伙人 · ${shortAddr(address)}`} onLogout={onLogout} onBack={onBack}>
      {!sub && (
        <>
          <AddressDisplay address={address} label="我的钱包" />
          <div className="space-y-2.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSub(s.id)}
                className="tap w-full brand-card rounded-2xl p-4 flex items-center gap-3 text-left"
              >
                <span className="w-11 h-11 rounded-xl bg-[#E0568F]/10 flex items-center justify-center text-[#E0568F] shrink-0">
                  <s.icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-[#160510]">{s.title}</span>
                    {s.soon && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-amber-700 bg-amber-500/12">即将开放</span>}
                  </div>
                  <div className="text-[11px] text-[#8A2B57]/60 mt-0.5">{s.desc}</div>
                </div>
                <ChevronRight size={18} className="text-[#8A2B57]/35 shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}

      {sub === 'performance' && <PartnerPerformance profile={profile} loading={loading} />}
      {sub === 'subsidy' && <PartnerSubsidy />}

      {sub && sub !== 'performance' && sub !== 'subsidy' && (
        <div className="brand-card rounded-2xl p-8 text-center">
          <div className="text-[14px] font-bold text-[#160510] mb-1">{current?.title}</div>
          <div className="text-[12px] text-[#8A2B57]/60">该功能即将开放</div>
        </div>
      )}
    </MobileShell>
  );
}
