import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { ArrowLeft, Home, Landmark, Users, Wallet } from 'lucide-react';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteTopBar } from '@/components/layout/SiteTopBar';
import { GlassChip, GlassIconButton } from '@/components/ui/GlassSurface';
import { WalletGate } from '@/components/wallet/WalletGate';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/wallet-context';
import { usePartnerProgram } from '@/hooks/usePartnerProgram';
import { useReferralStatus } from '@/hooks/useReferralStatus';
import { useDepositPayment } from '@/hooks/useDepositPayment';
import { PARTNER_JOIN_USDT } from '@/components/partner/partnerData';
import { PartnerHomeTab } from '@/components/partner/PartnerHomeTab';
import { PartnerStakeTab } from '@/components/partner/PartnerStakeTab';
import { PartnerAssetsTab } from '@/components/partner/PartnerAssetsTab';
import { PartnerTeamTab } from '@/components/partner/PartnerTeamTab';
import { useAppLang } from '@/i18n/LanguageContext';
import { toLegacyLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';
import {
  formatPartnerPaymentError,
  partnerPaymentErrorTitle,
  toPartnerPaymentError,
} from '@/lib/partnerPaymentErrors';

type PartnerTab = 'home' | 'stake' | 'assets' | 'team';
type StakeSub = 'crowdfund' | 'partner' | 'mine';

const TAB_IDS: PartnerTab[] = ['home', 'stake', 'assets', 'team'];
const TAB_ICONS = { home: Home, stake: Landmark, assets: Wallet, team: Users } as const;
const TAB_KEYS: Record<PartnerTab, string> = {
  home: 'tabs.home',
  stake: 'tabs.stake',
  assets: 'tabs.assets',
  team: 'tabs.team',
};

export default function PartnerProgram() {
  const { lang } = useAppLang();
  const p = usePartnerTranslation(lang);
  const legacyLang = toLegacyLang(lang);
  const [tab, setTab] = useState<PartnerTab>('home');
  const [stakeSub, setStakeSub] = useState<StakeSub | undefined>();
  const [, navigate] = useLocation();
  const { theme } = useTheme();
  const { wallet } = useWallet();
  const isDark = theme === 'dark';

  const { hasReferralBound } = useReferralStatus(wallet);
  const { payForJoin, payForStake, paying: depositPaying, lastIntent } = useDepositPayment(wallet);

  const {
    state,
    teamNodes,
    teamStats,
    teamLoading,
    refreshTeamProfile,
    crowdfundStake,
    joinPartner,
    stakeSd3,
    transferSd3,
    withdrawYield,
    yieldWithdrawing,
    submitPartnerSubsidy,
    submitMarketSubsidy,
    minCrowdfundUsdt,
    hasStake,
  } = usePartnerProgram(wallet);

  const visibleTabs = useMemo(
    () => TAB_IDS.filter((id) => id !== 'assets' || state.isPartner),
    [state.isPartner],
  );

  useEffect(() => {
    if (tab === 'assets' && !state.isPartner) {
      setTab('home');
    }
  }, [tab, state.isPartner]);

  const handleWithdrawYield = useCallback(
    async (amount: number) => {
      const ok = await withdrawYield(amount);
      if (ok) {
        toast.success(p('assets.flashWithdrawSuccess'));
      } else {
        toast.error(partnerPaymentErrorTitle(p), {
          description: p('assets.flashWithdrawFailed'),
        });
      }
      return ok;
    },
    [withdrawYield, p],
  );

  const notifyPayError = useCallback(
    (e: unknown) => {
      toast.error(partnerPaymentErrorTitle(p), {
        description: formatPartnerPaymentError(p, toPartnerPaymentError(e)),
      });
    },
    [p],
  );

  const handleJoinPartner = useCallback(async () => {
      if (!hasReferralBound) return false;
      try {
        await payForJoin(PARTNER_JOIN_USDT);
        joinPartner(hasReferralBound);
        await refreshTeamProfile();
        return true;
      } catch (e) {
        notifyPayError(e);
        return false;
      }
    },
    [hasReferralBound, payForJoin, joinPartner, notifyPayError, refreshTeamProfile],
  );

  const handleCrowdfundStake = useCallback(
    async (amount: number) => {
      if (!hasReferralBound) return false;
      try {
        await payForStake(amount);
        crowdfundStake(amount, hasReferralBound);
        await refreshTeamProfile();
        return true;
      } catch (e) {
        notifyPayError(e);
        return false;
      }
    },
    [hasReferralBound, payForStake, crowdfundStake, notifyPayError, refreshTeamProfile],
  );

  const handleGoPartnerJoin = useCallback(() => {
    setStakeSub('partner');
    setTab('stake');
  }, []);

  return (
    <WalletGate lang={legacyLang}>
      <div
        className={`min-h-screen flex flex-col antialiased transition-colors duration-300 ${
          isDark ? 'bg-dark-gradient text-[#F5F0EB]' : 'bg-light-gradient text-foreground'
        }`}
      >
        <SiteTopBar
          logoTo="/portal"
          logoSize={48}
          isDark={isDark}
          onDisconnect={() => navigate('/portal')}
          leftSlot={
            <GlassIconButton onClick={() => navigate('/portal')} aria-label="Back" className="!h-8 !w-8">
              <ArrowLeft size={16} />
            </GlassIconButton>
          }
        />

        <div className="page-px pt-2 pb-1 max-w-md mx-auto md:max-w-xl w-full">
          <div className="flex items-center gap-2 flex-wrap">
            <GlassChip className="!py-1 !px-2.5 text-xs font-bold" style={{ color: '#E0568F' }}>
              {p('program.title')}
            </GlassChip>
            {state.isPartner && (
              <GlassChip className="!py-1 !px-2.5 text-xs font-bold text-emerald-400 !bg-emerald-500/10 !border-emerald-500/15">
                {p('program.partner')}
              </GlassChip>
            )}
            {!state.isPartner && hasStake && (
              <GlassChip className="!py-1 !px-2.5 text-xs font-bold text-sky-400/90 !bg-sky-500/10 !border-sky-500/15">
                {p('program.staked')}
              </GlassChip>
            )}
          </div>
        </div>

        <main className="page-px py-4 pb-28 max-w-md mx-auto md:max-w-xl flex-1 w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {tab === 'home' && (
                <PartnerHomeTab
                  lang={lang}
                  isDark={isDark}
                  state={state}
                  hasReferralBound={hasReferralBound}
                  onGoPartnerJoin={handleGoPartnerJoin}
                />
              )}
              {tab === 'stake' && (
                <PartnerStakeTab
                  lang={lang}
                  isDark={isDark}
                  state={state}
                  hasReferralBound={hasReferralBound}
                  minCrowdfundUsdt={minCrowdfundUsdt}
                  initialSub={stakeSub}
                  paying={depositPaying}
                  lastDepositIntent={lastIntent}
                  onCrowdfundStake={handleCrowdfundStake}
                  onJoinPartner={handleJoinPartner}
                />
              )}
              {tab === 'assets' && state.isPartner && (
                <PartnerAssetsTab
                  lang={lang}
                  isDark={isDark}
                  state={state}
                  onStakeSd3={stakeSd3}
                  onTransferSd3={transferSd3}
                  onWithdrawYield={handleWithdrawYield}
                  yieldWithdrawing={yieldWithdrawing}
                  onPartnerSubsidy={submitPartnerSubsidy}
                  onMarketSubsidy={submitMarketSubsidy}
                />
              )}
              {tab === 'team' && (
                <PartnerTeamTab
                  lang={lang}
                  isDark={isDark}
                  state={state}
                  wallet={wallet}
                  teamNodes={teamNodes}
                  teamStats={teamStats}
                  teamLoading={teamLoading}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <nav
          className={`fixed bottom-0 left-0 right-0 z-40 border-t pb-[env(safe-area-inset-bottom)] ${
            isDark ? 'border-white/[0.06] bg-[#0a0610]/90 backdrop-blur-xl' : 'border-[#8A2B57]/[0.08] bg-white/90 backdrop-blur-xl'
          }`}
        >
          <div className="max-w-md mx-auto md:max-w-xl flex">
            {visibleTabs.map((id) => {
              const Icon = TAB_ICONS[id];
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setTab(id);
                    if (id !== 'stake') setStakeSub(undefined);
                  }}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 ios-glass-pressable ${
                    active ? 'text-[#E0568F]' : isDark ? 'text-white/35' : 'text-[#160510]/35'
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                  <span className="text-[10px] font-semibold">{p(TAB_KEYS[id])}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="hidden">
          <SiteFooter lang={legacyLang} variant="compact" showCta={false} />
        </div>
      </div>
    </WalletGate>
  );
}
