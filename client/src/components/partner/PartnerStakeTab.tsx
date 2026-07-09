import { useEffect, useMemo, useState } from 'react';
import { Shield, Users } from 'lucide-react';
import { glassCardClass, GlassButton } from '@/components/ui/GlassSurface';
import { PartnerModal } from '@/components/partner/PartnerModal';
import { SectionTabBar } from '@/components/d3fi/SectionTabBar';
import {
  aggregateStakeOrders,
  PARTNER_JOIN_USDT,
  stakeOrderDaysLeft,
  stakeOrderProgress,
  STAKE_LOCK_DAYS,
  type PartnerState,
  type StakeOrderKind,
} from '@/components/partner/partnerData';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

type StakeSub = 'crowdfund' | 'partner' | 'mine';

function stakeKindKey(kind: StakeOrderKind): string {
  if (kind === 'crowdfund') return 'stake.kind.crowdfund';
  if (kind === 'partner_join') return 'stake.kind.join';
  return 'stake.kind.sd3';
}

function PayConfirmBody({
  label,
  amount,
  unit,
  isDark,
}: {
  label: string;
  amount: number;
  unit: string;
  isDark: boolean;
}) {
  return (
    <div className="partner-depth-inset p-4 mb-5 text-center rounded-2xl">
      <div className={`text-[10px] uppercase tracking-widest mb-1 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
        {label}
      </div>
      <div className="text-2xl sm:text-3xl font-bold tracking-tight text-[#E0568F]">{amount.toLocaleString()}</div>
      <div className={`text-xs mt-0.5 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{unit}</div>
    </div>
  );
}

export function PartnerStakeTab({
  lang,
  isDark,
  state,
  hasReferralBound,
  minCrowdfundUsdt,
  initialSub,
  paying,
  payError,
  onCrowdfundStake,
  onJoinPartner,
}: {
  lang: AppLang;
  isDark: boolean;
  state: PartnerState;
  hasReferralBound: boolean;
  minCrowdfundUsdt: number;
  initialSub?: StakeSub;
  paying: boolean;
  payError: string | null;
  onCrowdfundStake: (amount: number) => Promise<boolean>;
  onJoinPartner: () => Promise<boolean>;
}) {
  const p = usePartnerTranslation(lang);
  const crowdfundOrders = useMemo(
    () => state.stakeOrders.filter((o) => o.kind === 'crowdfund' || o.kind === 'partner_join'),
    [state.stakeOrders],
  );
  const stats = aggregateStakeOrders(crowdfundOrders);
  const hasStake = stats.orderCount > 0;

  const defaultSub: StakeSub = initialSub ?? (hasStake ? 'mine' : 'crowdfund');
  const [sub, setSub] = useState<StakeSub>(defaultSub);
  const [amount, setAmount] = useState('');
  const [stakeOpen, setStakeOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  useEffect(() => {
    if (initialSub) setSub(initialSub);
  }, [initialSub]);

  const subs = [
    { id: 'crowdfund', label: p('stake.crowdfund') },
    ...(!state.isPartner ? [{ id: 'partner', label: p('stake.partner') }] : []),
    { id: 'mine', label: p('stake.mine') },
  ];

  if (!hasReferralBound) {
    return (
      <div className={`text-center py-16 text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
        {p('referral.required')}
      </div>
    );
  }

  const pendingAmount = Number(amount);
  const canOpenStake = Number.isFinite(pendingAmount) && pendingAmount >= minCrowdfundUsdt;

  const confirmStake = async () => {
    if (!canOpenStake) return;
    const ok = await onCrowdfundStake(pendingAmount);
    if (ok) {
      setStakeOpen(false);
      setAmount('');
      setSub('mine');
    }
  };

  const confirmJoin = async () => {
    const ok = await onJoinPartner();
    if (ok) {
      setJoinOpen(false);
      setSub('mine');
    }
  };

  const payActions = (onCancel: () => void, onConfirm: () => void) => (
  <>
    {payError && <p className="text-xs text-red-500 mb-3 leading-relaxed">{payError}</p>}
    <div className="flex flex-col-reverse sm:flex-row gap-3">
      <GlassButton variant="secondary" className="w-full sm:flex-1 !py-3" disabled={paying} onClick={onCancel}>
        {p('stake.cancel')}
      </GlassButton>
      <GlassButton className="w-full sm:flex-1 !py-3" disabled={paying} onClick={() => void onConfirm()}>
        {paying ? p('stake.paying') : p('stake.confirm')}
      </GlassButton>
    </div>
  </>
  );

  return (
    <div className="space-y-4">
      <SectionTabBar tabs={subs} active={sub} onChange={(id) => setSub(id as StakeSub)} isDark={isDark} />

      {sub === 'crowdfund' && (
        <div className="space-y-3">
          <div className={`partner-elevated-card p-5 ${glassCardClass('highlight', '')}`}>
            <span className="ios-glass-sheen pointer-events-none" aria-hidden />
            <div className="site-section-title mb-1">{p('stake.usdtTitle')}</div>
            <p className={`text-[10px] mb-4 ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
              {`${STAKE_LOCK_DAYS}${p('stake.lockHint')}${minCrowdfundUsdt} USDT`}
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                min={minCrowdfundUsdt}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`${minCrowdfundUsdt}+ USDT`}
                className={`flex-1 partner-depth-inset px-3 py-3 text-sm rounded-xl outline-none ${isDark ? 'text-white bg-transparent' : 'text-[#160510]'}`}
              />
              <GlassButton className="!px-5" disabled={!canOpenStake} onClick={() => setStakeOpen(true)}>
                {p('stake.stakeBtn')}
              </GlassButton>
            </div>
            <div className="flex gap-2">
              {[100, 500, 1000, 5000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(String(v))}
                  className="text-[10px] px-2.5 py-1 rounded-lg partner-depth-inset ios-glass-pressable text-[#E0568F] font-semibold"
                >
                  +{v}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sub === 'partner' && !state.isPartner && (
        <div className={`partner-elevated-card p-5 relative overflow-hidden ${glassCardClass('highlight', '')}`}>
          <span className="ios-glass-sheen pointer-events-none" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#E0568F]/10 text-[#E0568F] shadow-sm">
                <Shield size={18} />
              </div>
              <div>
                <div className={`text-sm font-semibold tracking-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                  {p('stake.joinTitle')}
                </div>
                <div className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
                  {p('stake.joinSubtitle')}
                </div>
              </div>
            </div>
            <p className={`text-[11px] leading-relaxed mb-4 ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
              {p('stake.joinDesc')}
            </p>
            <div className="partner-depth-inset p-5 mb-4 text-center rounded-2xl">
              <div className={`text-[10px] uppercase tracking-widest mb-1 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
                {p('stake.joinFee')}
              </div>
              <div className="text-3xl font-bold tracking-tight text-[#E0568F]">{PARTNER_JOIN_USDT.toLocaleString()}</div>
              <div className={`text-xs mt-0.5 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>USDT</div>
            </div>
            <GlassButton className="w-full !py-3.5 flex items-center justify-center gap-2" onClick={() => setJoinOpen(true)}>
              <Users size={16} />
              {p('stake.payJoin')}
            </GlassButton>
          </div>
        </div>
      )}

      {sub === 'mine' && (
        !hasStake ? (
          <div className={`text-center py-16 text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>{p('stake.noStake')}</div>
        ) : (
          <div className="space-y-3">
            <div className={`partner-elevated-card p-4 ${glassCardClass('highlight', '')}`}>
              <span className="ios-glass-sheen pointer-events-none" aria-hidden />
              <div className="grid grid-cols-2 gap-2">
                <div className="partner-depth-inset p-3 rounded-xl">
                  <div className="site-stat-label">{p('stake.total')}</div>
                  <div className="site-stat-value-md site-stat-value-accent">${stats.principalUsdt.toLocaleString()}</div>
                </div>
                <div className="partner-depth-inset p-3 rounded-xl">
                  <div className="site-stat-label">{p('stake.daily')}</div>
                  <div className="site-stat-value-md text-emerald-500">${stats.dailyUsdtYield.toFixed(2)}</div>
                </div>
              </div>
            </div>
            <div className={`text-[10px] font-semibold uppercase tracking-widest mb-1 px-0.5 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
              {p('stake.orders')} · {STAKE_LOCK_DAYS}{p('stake.daysEach')}
            </div>
            {crowdfundOrders.map((order) => {
              const progress = stakeOrderProgress(order);
              const daysLeft = stakeOrderDaysLeft(order);
              return (
                <div key={order.id} className={`partner-elevated-card p-4 ${glassCardClass('default', '')}`}>
                  <span className="ios-glass-sheen pointer-events-none" aria-hidden />
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-bold text-[#E0568F]">{p(stakeKindKey(order.kind))}</span>
                    <span className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{order.startedAt}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                      ${order.principalUsdt.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-emerald-500">${order.dailyYieldUsdt.toFixed(2)}/{p('stake.perDay')}</span>
                  </div>
                  <div className={`h-1 rounded-full overflow-hidden mb-1 partner-depth-inset`}>
                    <div className="h-full rounded-full" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #8A2B57, #E0568F)' }} />
                  </div>
                  <div className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
                    {daysLeft}{p('stake.daysLeft')} · {order.unlockAt}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <PartnerModal
        open={stakeOpen}
        onClose={() => !paying && setStakeOpen(false)}
        title={p('stake.confirmStake')}
        isDark={isDark}
      >
        <PayConfirmBody label={p('stake.stakeAmount')} amount={pendingAmount} unit="USDT" isDark={isDark} />
        {payActions(() => setStakeOpen(false), confirmStake)}
      </PartnerModal>

      <PartnerModal open={joinOpen} onClose={() => !paying && setJoinOpen(false)} title={p('stake.confirmPay')} isDark={isDark}>
        <PayConfirmBody label={p('stake.joinFee')} amount={PARTNER_JOIN_USDT} unit="USDT" isDark={isDark} />
        {payActions(() => setJoinOpen(false), confirmJoin)}
      </PartnerModal>
    </div>
  );
}
