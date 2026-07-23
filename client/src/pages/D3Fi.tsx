import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { TrendingUp, Home, Wallet, Vote, Coins, User, ArrowDownToLine, Gift, Shield, Clock, Zap, RefreshCw, ExternalLink, ChevronDown, AlertTriangle, Flame, Eye, Lock, HelpCircle } from 'lucide-react';
import { D3Logo } from '@/components/D3Logo';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { SecurityShieldDiagram } from '@/components/illustrations/SecurityShieldDiagram';
import { IllustrationCard } from '@/components/layout/IllustrationCard';
import { SectionTabBar } from '@/components/d3fi/SectionTabBar';
import { BribeMarketTab } from '@/components/d3fi/BribeMarketTab';
import { VoteTabContent } from '@/components/d3fi/VoteTabContent';
import { DividendsTabContent } from '@/components/d3fi/DividendsTabContent';
import { TeamTreeTab } from '@/components/d3fi/TeamTreeTab';
import { PocScoreTab } from '@/components/d3fi/PocScoreTab';
import { DUsdTab } from '@/components/d3fi/DUsdTab';
import { RulesSheet } from '@/components/d3fi/RulesSheet';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SitePageHeader } from '@/components/layout/SitePageHeader';
import { glassCardClass, GlassButton, GlassIconButton } from '@/components/ui/GlassSurface';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/wallet-context';
import { SiteNotificationBell } from '@/components/layout/SiteNotificationBell';
import { WalletConnectButton } from '@/components/wallet/WalletConnectButton';
import { WalletGate } from '@/components/wallet/WalletGate';
import { useD3FiProfile, type D3FiViewModel } from '@/hooks/useD3FiProfile';
import { useProtocolEpoch } from '@/hooks/useProtocolEpoch';
import { TeamDynamicRewardsPanel } from '@/components/d3fi/TeamDynamicRewardsPanel';
import { fmtNum, fmtUsd } from '@/lib/d3fiViewModel';
import { buildReferralLink } from '@/lib/referral';
import type { ProtocolEpochView } from '@/lib/protocolTypes';
import type { AppLang } from '@/i18n/types';

type Lang = 'zh' | 'en';
type Section = 'home' | 'assets' | 'govern' | 'earn' | 'me';

const sections: { id: Section; icon: typeof Home; zh: string; en: string; descZh: string; descEn: string }[] = [
  { id: 'home', icon: Home, zh: '总览', en: 'Home', descZh: '资产快照与快捷入口', descEn: 'Portfolio snapshot & shortcuts' },
  { id: 'assets', icon: Wallet, zh: '资产', en: 'Assets', descZh: '持仓管理与入场方式', descEn: 'Holdings & entry methods' },
  { id: 'govern', icon: Vote, zh: '治理', en: 'Govern', descZh: '投票权与贿赂市场', descEn: 'Voting & bribe market' },
  { id: 'earn', icon: Coins, zh: '收益', en: 'Earn', descZh: '分红领取与收益明细', descEn: 'Claims & reward breakdown' },
  { id: 'me', icon: User, zh: '我的', en: 'Me', descZh: '团队网络、PoC 分数与安全帮助', descEn: 'Team network, PoC score & help' },
];

const subTabLabels = {
  assets: {
    holdings: { zh: '持仓', en: 'Holdings' },
    dusd: { zh: 'UD3', en: 'UD3' },
    enter: { zh: '入场', en: 'Enter' },
  },
  govern: {
    vote: { zh: '投票', en: 'Vote' },
    bribe: { zh: '贿赂', en: 'Bribe' },
  },
  me: {
    network: { zh: '推荐', en: 'Refer' },
    team: { zh: '团队', en: 'Team' },
    score: { zh: '分数', en: 'Score' },
    safety: { zh: '安全', en: 'Safety' },
    help: { zh: '帮助', en: 'Help' },
  },
  earn: {
    overview: { zh: '总览', en: 'Overview' },
    breakdown: { zh: '明细', en: 'Breakdown' },
    history: { zh: '历史', en: 'History' },
  },
} as const;

const lpPeriodTiers = [
  { days: 90, lpCoef: 'x1.0', veD3Zh: '标准', veD3En: 'Standard', exit: '3x', dt: true, daily: '0.40-0.60%' },
  { days: 180, lpCoef: 'x1.6', veD3Zh: '+60%', veD3En: '+60%', exit: '4x', dt: true, daily: '0.40-0.80%' },
  { days: 360, lpCoef: 'x3.0', veD3Zh: '+200%', veD3En: '+200%', exit: '5x', dt: true, daily: '0.40-1.00%' },
  { days: 540, lpCoef: 'x4.5', veD3Zh: '+350%', veD3En: '+350%', exit: '6x', dt: true, daily: '0.40-1.20%' },
] as const;

export default function D3Fi() {
  const [lang, setLang] = useState<Lang>('zh');
  const [section, setSection] = useState<Section>('home');
  const [assetsSub, setAssetsSub] = useState<'holdings' | 'dusd' | 'enter'>('holdings');
  const [governSub, setGovernSub] = useState<'vote' | 'bribe'>('vote');
  const [meSub, setMeSub] = useState<'network' | 'team' | 'score' | 'safety' | 'help'>('network');
  const [earnSub, setEarnSub] = useState<'overview' | 'breakdown' | 'history'>('overview');
  const [voteFocusProject, setVoteFocusProject] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { theme } = useTheme();
  const { wallet, shortAddress } = useWallet();
  // This page keeps its own local zh/en toggle; map it to the app-wide 6-lang
  // type for shared components (WalletGate/SiteFooter/bell/connect/epoch).
  const appLang: AppLang = lang === 'zh' ? 'zh-CN' : 'en';
  const { vm, isLoading, refetch } = useD3FiProfile(wallet, lang);
  const { epoch: protocolEpoch, bribeProjects, activeProjects, isLoading: protocolLoading } = useProtocolEpoch(appLang);
  const isDark = theme === 'dark';

  const current = sections.find((s) => s.id === section)!;
  const pageTitle = lang === 'zh' ? current.zh : current.en;
  const pageDesc = lang === 'zh' ? current.descZh : current.descEn;

  const goSection = (next: Section, sub?: string) => {
    setSection(next);
    if (next === 'assets' && (sub === 'holdings' || sub === 'dusd' || sub === 'enter')) setAssetsSub(sub as typeof assetsSub);
    if (next === 'govern' && (sub === 'vote' || sub === 'bribe')) setGovernSub(sub);
    if (next === 'me' && (sub === 'network' || sub === 'team' || sub === 'score' || sub === 'safety' || sub === 'help')) setMeSub(sub as typeof meSub);
    if (next === 'earn' && (sub === 'overview' || sub === 'breakdown' || sub === 'history')) setEarnSub(sub as typeof earnSub);
  };

  const contentKey =
    section === 'assets'
      ? `${section}-${assetsSub}`
      : section === 'govern'
        ? `${section}-${governSub}`
        : section === 'me'
          ? `${section}-${meSub}`
          : section === 'earn'
            ? `${section}-${earnSub}`
            : section;

  return (
    <WalletGate lang={appLang}>
    <div className={`min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-64 flex flex-col transition-colors duration-300 ${
      isDark ? 'bg-dark-gradient text-[#F5F0EB]' : 'bg-light-gradient text-[#160510]'
    }`}>
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex fixed left-0 top-0 bottom-0 w-64 flex-col z-50 border-r transition-colors duration-300 ${
        isDark ? 'bg-dark-sidebar border-[#E0568F]/[0.06]' : 'bg-light-sidebar border-[#8A2B57]/[0.06]'
      }`}>
        <div className={`flex items-center gap-2.5 px-6 py-5 border-b ${isDark ? 'border-[#E0568F]/[0.06]' : 'border-[#8A2B57]/[0.06]'}`}>
          <D3Logo size={48} showText to="/" textClassName={isDark ? 'text-white' : ''} />
        </div>
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {sections.map((item) => {
            const Icon = item.icon;
            const isActive = section === item.id;
            const subItems =
              item.id === 'assets'
                ? [
                    { id: 'holdings', zh: subTabLabels.assets.holdings.zh, en: subTabLabels.assets.holdings.en },
                    { id: 'dusd', zh: subTabLabels.assets.dusd.zh, en: subTabLabels.assets.dusd.en },
                    { id: 'enter', zh: subTabLabels.assets.enter.zh, en: subTabLabels.assets.enter.en },
                  ]
                : item.id === 'govern'
                  ? [
                      { id: 'vote', zh: subTabLabels.govern.vote.zh, en: subTabLabels.govern.vote.en },
                      { id: 'bribe', zh: subTabLabels.govern.bribe.zh, en: subTabLabels.govern.bribe.en },
                    ]
                  : item.id === 'me'
                    ? [
                        { id: 'network', zh: subTabLabels.me.network.zh, en: subTabLabels.me.network.en },
                        { id: 'team', zh: subTabLabels.me.team.zh, en: subTabLabels.me.team.en },
                        { id: 'score', zh: subTabLabels.me.score.zh, en: subTabLabels.me.score.en },
                        { id: 'safety', zh: subTabLabels.me.safety.zh, en: subTabLabels.me.safety.en },
                        { id: 'help', zh: subTabLabels.me.help.zh, en: subTabLabels.me.help.en },
                      ]
                    : item.id === 'earn'
                      ? [
                          { id: 'overview', zh: subTabLabels.earn.overview.zh, en: subTabLabels.earn.overview.en },
                          { id: 'breakdown', zh: subTabLabels.earn.breakdown.zh, en: subTabLabels.earn.breakdown.en },
                          { id: 'history', zh: subTabLabels.earn.history.zh, en: subTabLabels.earn.history.en },
                        ]
                      : null;

            return (
              <div key={item.id} className="mb-1">
                <button
                  type="button"
                  onClick={() => goSection(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? (isDark ? 'text-white' : 'text-[#8A2B57]')
                      : (isDark ? 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]' : 'text-[#160510]/40 hover:text-[#8A2B57]/60 hover:bg-[#8A2B57]/[0.03]')
                  }`}
                  style={isActive ? (isDark
                    ? { background: 'linear-gradient(135deg, rgba(138,43,87,0.2), rgba(224,86,143,0.08))', border: '1px solid rgba(224,86,143,0.1)' }
                    : { background: 'linear-gradient(135deg, rgba(138,43,87,0.08), rgba(224,86,143,0.04))', border: '1px solid rgba(138,43,87,0.1)' }
                  ) : {}}
                >
                  <Icon size={18} style={isActive ? { color: isDark ? '#E0568F' : '#8A2B57' } : {}} />
                  <span className="flex-1 text-left">{lang === 'zh' ? item.zh : item.en}</span>
                </button>
                {isActive && subItems && (
                  <div className="mt-1 ml-3 pl-3 border-l space-y-0.5" style={{ borderColor: isDark ? 'rgba(224,86,143,0.12)' : 'rgba(138,43,87,0.1)' }}>
                    {subItems.map((sub) => {
                      const subActive =
                        (item.id === 'assets' && assetsSub === sub.id) ||
                        (item.id === 'govern' && governSub === sub.id) ||
                        (item.id === 'me' && meSub === sub.id) ||
                        (item.id === 'earn' && earnSub === sub.id);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => goSection(item.id, sub.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${
                            subActive
                              ? isDark
                                ? 'text-[#E0568F] bg-[#E0568F]/[0.08]'
                                : 'text-[#8A2B57] bg-[#8A2B57]/[0.06]'
                              : isDark
                                ? 'text-white/35 hover:text-white/55'
                                : 'text-[#160510]/35 hover:text-[#8A2B57]/60'
                          }`}
                        >
                          {lang === 'zh' ? sub.zh : sub.en}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className={`p-4 border-t ${isDark ? 'border-[#E0568F]/[0.06]' : 'border-[#8A2B57]/[0.06]'}`}>
          <div className={`rounded-xl p-3 text-center ${isDark ? 'bg-white/[0.02]' : 'bg-[#8A2B57]/[0.02]'}`}>
            <div className={`text-[10px] mb-1 ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>Wallet</div>
            <div className={`font-mono text-xs ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>{shortAddress ?? '—'}</div>
          </div>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <nav className="ios-glass-topbar sticky top-0 z-40 md:hidden page-px py-2.5 sm:py-3 flex items-center justify-between gap-2 safe-area-pt">
        <D3Logo size={32} showText to="/" className="min-w-0 shrink" textClassName={`text-sm ${isDark ? 'text-white' : 'text-[#8A2B57]'}`} />
        <div className="flex items-center gap-1.5 shrink-0">
          <SiteNotificationBell lang={appLang} isDark={isDark} />
          <GlassIconButton onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="text-[10px] px-2 py-1.5 font-medium">
            {lang === 'zh' ? 'EN' : '中文'}
          </GlassIconButton>
          <WalletConnectButton lang={appLang} showDisconnect={false} />
        </div>
      </nav>

      {/* Mobile page title */}
      <div className="md:hidden page-px pt-4 pb-1">
        <SitePageHeader title={pageTitle} subtitle={pageDesc} />
      </div>

      {/* Desktop Top Bar */}
      <div className={`hidden md:flex sticky top-0 z-40 backdrop-blur-2xl border-b px-8 py-4 items-center justify-between transition-colors duration-300 ${
        isDark ? 'bg-dark-surface border-[#E0568F]/[0.06]' : 'bg-light-surface border-[#8A2B57]/[0.06]'
      }`}>
        <SitePageHeader title={pageTitle} subtitle={pageDesc} />
        <div className="flex items-center gap-3">
          <SiteNotificationBell lang={appLang} isDark={isDark} />
          <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
            isDark ? 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]' : 'bg-[#8A2B57]/[0.06] text-[#8A2B57]/60 hover:bg-[#8A2B57]/[0.1]'
          }`}>
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
          <button onClick={() => navigate('/portal')} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
            isDark ? 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]' : 'bg-[#8A2B57]/[0.06] text-[#8A2B57]/60 hover:bg-[#8A2B57]/[0.1]'
          }`}>
            {lang === 'zh' ? '返回门户' : 'Back to Portal'}
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="page-px py-4 sm:py-6 md:px-8 md:py-8 max-w-4xl w-full mx-auto flex-1 mobile-page-stack">
        {section === 'assets' && (
          <div className="md:hidden">
            <SectionTabBar
            isDark={isDark}
            active={assetsSub}
            onChange={(id) => setAssetsSub(id as typeof assetsSub)}
            tabs={[
              { id: 'holdings', label: lang === 'zh' ? subTabLabels.assets.holdings.zh : subTabLabels.assets.holdings.en },
              { id: 'dusd', label: lang === 'zh' ? subTabLabels.assets.dusd.zh : subTabLabels.assets.dusd.en },
              { id: 'enter', label: lang === 'zh' ? subTabLabels.assets.enter.zh : subTabLabels.assets.enter.en },
            ]}
            />
          </div>
        )}
        {section === 'govern' && (
          <div className="md:hidden">
            <SectionTabBar
            isDark={isDark}
            active={governSub}
            onChange={(id) => setGovernSub(id as 'vote' | 'bribe')}
            tabs={[
              { id: 'vote', label: lang === 'zh' ? subTabLabels.govern.vote.zh : subTabLabels.govern.vote.en },
              { id: 'bribe', label: lang === 'zh' ? subTabLabels.govern.bribe.zh : subTabLabels.govern.bribe.en },
            ]}
            />
          </div>
        )}
        {section === 'me' && (
          <div className="md:hidden">
            <SectionTabBar
            isDark={isDark}
            active={meSub}
            onChange={(id) => setMeSub(id as typeof meSub)}
            tabs={[
              { id: 'network', label: lang === 'zh' ? subTabLabels.me.network.zh : subTabLabels.me.network.en },
              { id: 'team', label: lang === 'zh' ? subTabLabels.me.team.zh : subTabLabels.me.team.en },
              { id: 'score', label: lang === 'zh' ? subTabLabels.me.score.zh : subTabLabels.me.score.en },
              { id: 'safety', label: lang === 'zh' ? subTabLabels.me.safety.zh : subTabLabels.me.safety.en },
              { id: 'help', label: lang === 'zh' ? subTabLabels.me.help.zh : subTabLabels.me.help.en },
            ]}
            />
          </div>
        )}
        {section === 'earn' && (
          <div className="md:hidden">
            <SectionTabBar
              isDark={isDark}
              active={earnSub}
              onChange={(id) => setEarnSub(id as typeof earnSub)}
              tabs={[
                { id: 'overview', label: lang === 'zh' ? subTabLabels.earn.overview.zh : subTabLabels.earn.overview.en },
                { id: 'breakdown', label: lang === 'zh' ? subTabLabels.earn.breakdown.zh : subTabLabels.earn.breakdown.en },
                { id: 'history', label: lang === 'zh' ? subTabLabels.earn.history.zh : subTabLabels.earn.history.en },
              ]}
            />
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={contentKey}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            {section === 'home' && (
              <DashboardTab
                lang={lang}
                isDark={isDark}
                vm={vm}
                protocolEpoch={protocolEpoch}
                isLoading={isLoading || protocolLoading}
                onNavigate={goSection}
              />
            )}
            {section === 'assets' && assetsSub === 'holdings' && <AssetsTab lang={lang} isDark={isDark} vm={vm} isLoading={isLoading} onNavigate={goSection} />}
            {section === 'assets' && assetsSub === 'dusd' && <DUsdTab lang={lang} isDark={isDark} vm={vm} isLoading={isLoading} onClaim={refetch} wallet={wallet} />}
            {section === 'assets' && assetsSub === 'enter' && <EnterTab lang={lang} isDark={isDark} vm={vm} />}
            {section === 'govern' && governSub === 'vote' && (
              <VoteTabContent
                lang={lang}
                isDark={isDark}
                totalPower={vm?.veD3Weight ?? 0}
                focusProjectId={voteFocusProject}
                onFocusHandled={() => setVoteFocusProject(null)}
                epoch={protocolEpoch}
                projects={activeProjects}
                isLoading={protocolLoading}
              />
            )}
            {section === 'govern' && governSub === 'bribe' && (
              <BribeMarketTab
                lang={lang}
                isDark={isDark}
                epoch={protocolEpoch}
                projects={bribeProjects}
                isLoading={protocolLoading}
                onGoVote={(projectId) => {
                  setVoteFocusProject(projectId);
                  goSection('govern', 'vote');
                }}
              />
            )}
            {section === 'earn' && (
              <DividendsTabContent
                lang={lang}
                isDark={isDark}
                earnSub={earnSub}
                onNavigateSub={setEarnSub}
                vm={vm}
                protocolEpoch={protocolEpoch}
                isLoading={isLoading || protocolLoading}
              />
            )}
            {section === 'me' && meSub === 'network' && (
              <NetworkTab lang={lang} isDark={isDark} wallet={wallet} vm={vm} onNavigate={goSection} />
            )}
            {section === 'me' && meSub === 'team' && <TeamTreeTab lang={lang} isDark={isDark} vm={vm} wallet={wallet} />}
            {section === 'me' && meSub === 'score' && (
              <PocScoreTab lang={lang} isDark={isDark} poc={vm?.poc} isLoading={isLoading} />
            )}
            {section === 'me' && meSub === 'safety' && <SafetyTab lang={lang} isDark={isDark} />}
            {section === 'me' && meSub === 'help' && <HelpTab lang={lang} isDark={isDark} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <div className="hidden md:block mt-auto">
        <SiteFooter lang={appLang} variant="compact" showCta={false} />
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="ios-glass-nav fixed bottom-0 left-0 right-0 z-50 md:hidden px-1 sm:px-2 pt-2 safe-area-pb flex items-center justify-around">
        {sections.map((item) => {
          const Icon = item.icon;
          const isActive = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => goSection(item.id)}
              className={`relative flex flex-col items-center gap-0.5 px-1.5 sm:px-2 py-1.5 rounded-xl ios-glass-pressable min-w-0 flex-1 max-w-[4.5rem] ${
                isActive ? '' : 'opacity-45'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="d3fi-bottom-nav"
                  className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full"
                  style={{ background: isDark ? '#E0568F' : '#8A2B57' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon size={20} style={isActive ? { color: isDark ? '#E0568F' : '#8A2B57' } : {}} />
              <span className="text-[8px] sm:text-[9px] font-medium truncate w-full text-center" style={isActive ? { color: isDark ? '#E0568F' : '#8A2B57' } : {}}>
                {lang === 'zh' ? item.zh : item.en}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
    </WalletGate>
  );
}

// ===== DASHBOARD TAB =====
function DashboardTab({
  lang,
  isDark,
  vm,
  protocolEpoch,
  isLoading,
  onNavigate,
}: {
  lang: Lang;
  isDark: boolean;
  vm: D3FiViewModel | null;
  protocolEpoch: ProtocolEpochView | null;
  isLoading: boolean;
  onNavigate: (section: Section, sub?: string) => void;
}) {
  const t = lang === 'zh';
  const portfolio = vm ? fmtUsd(vm.portfolioTotalUsd) : isLoading ? '…' : fmtUsd(0);
  const claimable = vm ? fmtUsd(vm.claimableUsdt) : isLoading ? '…' : fmtUsd(0);
  const veD3 = vm ? fmtNum(vm.veD3Weight) : isLoading ? '…' : '0';
  const level = vm?.level ?? (isLoading ? '…' : 'V0');
  const epoch = protocolEpoch?.label ?? (isLoading ? '…' : '—');
  const activity = vm?.recentActivity ?? [];

  return (
    <div className="space-y-5">
      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent" />
        <div className={`text-xs mb-2 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{t ? '资产总价值' : 'Total Portfolio'}</div>
        <div className="site-stat-value-lg site-stat-value-accent mb-1">{portfolio}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: t ? '待领取收益' : 'Claimable', value: claimable, color: 'text-emerald-500', action: () => onNavigate('earn') },
          { label: t ? 'veD3 权重' : 'veD3 Weight', value: veD3, color: '', action: () => onNavigate('govern', 'vote') },
          { label: t ? '身份等级' : 'Level', value: level, color: '', action: () => onNavigate('me', 'team') },
          { label: t ? '当前 Epoch' : 'Current Epoch', value: epoch, color: '', action: () => onNavigate('govern', 'bribe') },
        ].map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={item.action}
            className={glassCardClass('default', 'p-4 text-left ios-glass-pressable')}
          >
            <div className={`text-[10px] mb-1 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>{item.label}</div>
            <div className={cn('site-stat-value-md', !item.color && 'site-stat-value-accent', item.color)}>{item.value}</div>
          </button>
        ))}
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>{t ? '快捷操作' : 'Quick Actions'}</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: ArrowDownToLine, label: t ? '入场' : 'Enter', color: '#E0568F', section: 'assets' as const, sub: 'enter' },
            { icon: Vote, label: t ? '投票' : 'Vote', color: '#B23A6E', section: 'govern' as const, sub: 'vote' },
            { icon: Coins, label: t ? '领取' : 'Claim', color: '#22c55e', section: 'earn' as const },
          ].map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onNavigate(action.section, action.sub)}
              className="flex flex-col items-center gap-2 py-3 rounded-xl ios-glass-pressable"
            >
              <div className="ios-glass-inset w-10 h-10 flex items-center justify-center">
                <action.icon size={18} style={{ color: action.color }} />
              </div>
              <span className={`text-[10px] font-medium ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>{t ? '最近活动' : 'Recent Activity'}</div>
        <div className="space-y-3">
          {activity.length === 0 ? (
            <div className={`text-xs py-4 text-center ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
              {isLoading ? (t ? '加载中…' : 'Loading…') : (t ? '暂无活动记录' : 'No activity yet')}
            </div>
          ) : (
            activity.map((item, i) => (
              <div key={i} className={`flex items-center justify-between py-2 border-b last:border-0 ${isDark ? 'border-white/[0.03]' : 'border-[#8A2B57]/[0.04]'}`}>
                <div>
                  <div className={`text-xs font-medium ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? item.actionZh : item.actionEn}</div>
                  <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>{item.time}</div>
                </div>
                <div className={`text-xs font-semibold ${item.positive ? 'text-emerald-500' : (isDark ? 'text-white/60' : 'text-[#160510]/60')}`}>{item.amount}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ===== ASSETS TAB =====
function AssetsTab({
  lang,
  isDark,
  vm,
  isLoading,
  onNavigate,
}: {
  lang: Lang;
  isDark: boolean;
  vm: D3FiViewModel | null;
  isLoading: boolean;
  onNavigate: (section: Section, sub?: string) => void;
}) {
  const t = lang === 'zh';
  const positions = vm?.positions ?? [];

  return (
    <div className="space-y-5">
      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent" />
        <div className="site-stat-label mb-2">{t ? '资产总览' : 'Asset Overview'}</div>
        <div className="site-stat-value-lg site-stat-value-accent mb-3">
          {vm ? fmtUsd(vm.portfolioTotalUsd) : isLoading ? '…' : fmtUsd(0)}
        </div>
      </div>

      {/* UD3 quick access */}
      <button
        type="button"
        onClick={() => onNavigate('assets', 'dusd')}
        className={cn(glassCardClass('accent', 'p-4 w-full text-left ios-glass-pressable'))}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="ios-glass-inset w-10 h-10 flex items-center justify-center text-xs font-bold text-[#E0568F]">d$</div>
            <div>
              <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                {fmtNum(vm?.usd3.total ?? 0)} UD3
              </div>
              <div className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>{t ? '质押专用 · 可充值/转让' : 'For staking · Deposit/Transfer'}</div>
            </div>
          </div>
          <div className={`text-[10px] font-medium ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>{t ? '管理 →' : 'Manage →'}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
          <div className="ios-glass-inset p-2 text-center">
            <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{t ? '可用' : 'Free'}</div>
            <div className="font-semibold mt-0.5">{fmtNum(vm?.usd3.available ?? 0)}</div>
          </div>
          <div className="ios-glass-inset p-2 text-center">
            <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{t ? '质押中' : 'Staked'}</div>
            <div className="font-semibold mt-0.5">{fmtNum(vm?.usd3.staked ?? 0)}</div>
          </div>
          <div className="ios-glass-inset p-2 text-center">
            <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{t ? '可转让' : 'Transfer'}</div>
            <div className="font-semibold mt-0.5 text-emerald-500">{fmtNum(vm?.usd3.transferable ?? 0)}</div>
          </div>
        </div>
      </button>

      <div className="space-y-3">
        {[
          {
            token: 'D3',
            amount: fmtNum(vm?.d3.amount ?? 0),
            value: fmtUsd(vm?.d3.valueUsd ?? 0),
            change: '',
            locked: vm && vm.d3.veLocked > 0 ? `${fmtNum(vm.d3.veLocked)} veD3` : '',
            desc: '',
          },
          {
            token: 'DT',
            amount: fmtNum(vm?.dt.amount ?? 0),
            value: fmtUsd(vm?.dt.valueUsd ?? 0),
            change: '',
            locked: '',
            desc: t ? '权重分红' : 'Weight dividends',
          },
        ].map((item, i) => (
          <div key={i} className={glassCardClass('default', 'p-4 flex items-center justify-between')}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm" style={{ background: 'linear-gradient(135deg, rgba(138,43,87,0.3), rgba(224,86,143,0.1))', color: '#E0568F' }}>
                {item.token}
              </div>
              <div>
                <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#160510]'}`}>{item.amount} {item.token}</div>
                {item.locked && <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>{t ? '锁仓' : 'Locked'}: {item.locked}</div>}
                {item.desc && <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>{item.desc}</div>}
              </div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#160510]'}`}>{item.value}</div>
              {item.change && (
                <div className={`text-[10px] ${item.change.startsWith('+') ? 'text-emerald-500' : 'text-red-400'}`}>{item.change}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>{t ? '活跃仓位' : 'Active Positions'}</div>
        <div className="space-y-3">
          {positions.length === 0 ? (
            <div className={`text-xs py-6 text-center ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
              {isLoading ? (t ? '加载中…' : 'Loading…') : (t ? '暂无活跃仓位' : 'No active positions')}
            </div>
          ) : (
            positions.map((pos, i) => (
              <div key={i} className="ios-glass-inset p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-medium ${isDark ? 'text-white' : 'text-[#160510]'}`}>{pos.type}</span>
                  {pos.apy !== '—' && <span className="text-[10px] text-[#E0568F] font-medium">APY {pos.apy}</span>}
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-[#160510]'}`}>{pos.amount}</span>
                  <span className={`text-[10px] ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>{t ? '剩余' : 'Remaining'}: {pos.remaining}</span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-[#8A2B57]/[0.06]'}`}>
                  <div className="h-full rounded-full" style={{ width: `${pos.progress}%`, background: 'linear-gradient(90deg, #8A2B57, #E0568F)' }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ===== ENTER TAB =====
function LpPeriodTable({
  lang,
  isDark,
  selected,
  onSelect,
}: {
  lang: Lang;
  isDark: boolean;
  selected: number;
  onSelect: (days: number) => void;
}) {
  const t = lang === 'zh';
  const headers = t
    ? ['期限', 'LP 系数', 'veD3 权重', '出局倍数', 'DT 挖矿', '日化参考']
    : ['Term', 'LP Coef.', 'veD3 Weight', 'Exit Mult.', 'DT Mining', 'Daily Ref.'];

  return (
    <div className={glassCardClass('default', 'p-4 sm:p-5')}>
      <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
        {t ? '锁仓期限参数' : 'Lock Period Parameters'}
      </div>

      {/* Mobile: selectable cards */}
      <div className="space-y-2 md:hidden">
        {lpPeriodTiers.map((tier) => {
          const isActive = selected === tier.days;
          return (
            <button
              key={tier.days}
              type="button"
              onClick={() => onSelect(tier.days)}
              className={cn(
                'w-full text-left ios-glass-inset p-3 ios-glass-pressable transition-colors',
                isActive && 'ring-1 ring-[#E0568F]/30',
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-bold font-stat ${isActive ? 'text-[#E0568F]' : isDark ? 'text-white' : 'text-[#160510]'}`}>
                  {tier.days}{t ? '天' : 'd'}
                </span>
                <span className={`text-[10px] font-medium ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
                  {t ? '日化' : 'Daily'} {tier.daily}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-[10px]">
                <div>
                  <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>LP</div>
                  <div className={`font-semibold ${isDark ? 'text-white/70' : 'text-[#160510]/70'}`}>{tier.lpCoef}</div>
                </div>
                <div>
                  <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>veD3</div>
                  <div className={`font-semibold ${isDark ? 'text-white/70' : 'text-[#160510]/70'}`}>{t ? tier.veD3Zh : tier.veD3En}</div>
                </div>
                <div>
                  <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{t ? '出局' : 'Exit'}</div>
                  <div className={`font-semibold ${isDark ? 'text-white/70' : 'text-[#160510]/70'}`}>{tier.exit}</div>
                </div>
                <div>
                  <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>DT</div>
                  <div className="font-semibold text-emerald-500">✓</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop: full table */}
      <div className="hidden md:block overflow-x-auto -mx-1">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className={`text-left text-[10px] font-semibold uppercase tracking-wide pb-2 px-2 first:pl-0 ${
                    isDark ? 'text-white/35' : 'text-[#160510]/35'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lpPeriodTiers.map((tier) => {
              const isActive = selected === tier.days;
              return (
                <tr
                  key={tier.days}
                  onClick={() => onSelect(tier.days)}
                  className={cn(
                    'cursor-pointer transition-colors border-t',
                    isDark ? 'border-white/[0.04] hover:bg-white/[0.02]' : 'border-[#8A2B57]/[0.04] hover:bg-[#8A2B57]/[0.02]',
                    isActive && (isDark ? 'bg-[#E0568F]/[0.06]' : 'bg-[#8A2B57]/[0.04]'),
                  )}
                >
                  <td className={`py-2.5 px-2 first:pl-0 text-xs font-semibold ${isActive ? 'text-[#E0568F]' : isDark ? 'text-white' : 'text-[#160510]'}`}>
                    {tier.days}{t ? '天' : 'd'}
                  </td>
                  <td className={`py-2.5 px-2 text-xs ${isDark ? 'text-white/70' : 'text-[#160510]/70'}`}>{tier.lpCoef}</td>
                  <td className={`py-2.5 px-2 text-xs ${isDark ? 'text-white/70' : 'text-[#160510]/70'}`}>{t ? tier.veD3Zh : tier.veD3En}</td>
                  <td className={`py-2.5 px-2 text-xs ${isDark ? 'text-white/70' : 'text-[#160510]/70'}`}>{tier.exit}</td>
                  <td className="py-2.5 px-2 text-xs text-emerald-500">✓</td>
                  <td className={`py-2.5 px-2 text-xs ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>{tier.daily}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EnterTab({ lang, isDark, vm }: { lang: Lang; isDark: boolean; vm: D3FiViewModel | null }) {
  const t = lang === 'zh';
  const [method, setMethod] = useState<'swap' | 'lp' | 'burn'>('swap');
  const [lockDays, setLockDays] = useState(180);
  const selectedTier = lpPeriodTiers.find((tier) => tier.days === lockDays) ?? lpPeriodTiers[1];
  return (
    <div className="space-y-5">
      <div className="ios-glass-tab-bar flex gap-1">
        {[
          { id: 'swap' as const, label: t ? '现货 Swap' : 'Spot Swap' },
          { id: 'lp' as const, label: t ? 'LP 债券' : 'LP Bond' },
          { id: 'burn' as const, label: t ? '销毁债券' : 'Burn Bond' },
        ].map(m => (
          <button
            key={m.id}
            onClick={() => setMethod(m.id)}
            className={`relative flex-1 py-2.5 rounded-xl text-xs font-semibold ios-glass-pressable transition-all ${
              method === m.id
                ? isDark ? 'text-white' : 'text-[#8A2B57]'
                : isDark ? 'text-white/40' : 'text-[#160510]/40'
            }`}
          >
            {method === m.id && <span className="ios-glass-tab-active absolute inset-0" />}
            <span className="relative z-10">{m.label}</span>
          </button>
        ))}
      </div>

      {method === 'lp' && (
        <LpPeriodTable lang={lang} isDark={isDark} selected={lockDays} onSelect={setLockDays} />
      )}

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs mb-2 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{t ? '输入金额' : 'Input Amount'}</div>
        <p className={`text-[10px] mb-3 ${isDark ? 'text-[#E0568F]/70' : 'text-[#8A2B57]/70'}`}>
          {method === 'swap'
            ? (t ? '现货 Swap 使用 USDT 直接购买 D3' : 'Spot swap uses USDT to buy D3 directly')
            : (t ? '使用 UD3 质押入场，请确保 UD3 余额充足' : 'Entry uses UD3 staking — ensure sufficient UD3 balance')}
        </p>
        <div className="flex items-center gap-3 mb-4">
          <input type="text" placeholder="0.00" className={`flex-1 bg-transparent text-2xl font-bold font-stat outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/20'}`} />
          <span className={`text-sm font-medium ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{method === 'swap' ? 'USDT' : 'UD3'}</span>
        </div>
        <div className={`flex items-center justify-between text-[10px] mb-5 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
          <span>{t ? '余额' : 'Balance'}: {method === 'swap' ? (t ? '链上 USDT' : 'On-chain USDT') : `${fmtNum(vm?.usd3.available ?? 0)} UD3`}</span>
          <button className="text-[#E0568F] font-medium">{t ? '最大' : 'MAX'}</button>
        </div>

        <div className="ios-glass-inset rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{t ? '预计获得' : 'Estimated'}</span>
            <span className="text-sm font-bold" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>~2,100 D3</span>
          </div>
          {method !== 'swap' && (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{t ? '折扣率' : 'Discount'}</span>
                <span className="text-xs text-emerald-500 font-medium">-8.5%</span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{t ? '释放周期' : 'Vesting'}</span>
                <span className={`text-xs ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>
                  {method === 'lp' ? lockDays : 180} {t ? '天' : 'days'}
                </span>
              </div>
              {method === 'lp' && (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{t ? 'LP 系数' : 'LP Coef.'}</span>
                    <span className={`text-xs font-medium ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>{selectedTier.lpCoef}</span>
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{t ? '出局倍数' : 'Exit Mult.'}</span>
                    <span className={`text-xs ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>{selectedTier.exit}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{t ? '日化参考' : 'Daily Ref.'}</span>
                    <span className="text-xs text-emerald-500 font-medium">{selectedTier.daily}</span>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <GlassButton variant="primary" className="w-full !py-4 !text-sm">
          {t ? '确认入场' : 'Confirm Entry'}
        </GlassButton>
      </div>

      <div className="ios-glass-inset rounded-2xl p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-[#E0568F] mt-0.5 shrink-0" />
          <p className={`text-[11px] leading-relaxed text-pretty-wrap ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>
            {t ? 'LP 债券和销毁债券有线性释放期，到期前不可提前解锁。请根据自身情况，选择合适的入场方式。' : 'LP and Burn bonds have linear vesting periods. Tokens cannot be unlocked early. Please choose the entry method that suits your situation.'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ===== NETWORK TAB =====
function NetworkTab({
  lang,
  isDark,
  wallet,
  vm,
  onNavigate,
}: {
  lang: Lang;
  isDark: boolean;
  wallet: string | null;
  vm: D3FiViewModel | null;
  onNavigate: (section: Section, sub?: string) => void;
}) {
  const t = lang === 'zh';
  const referralLink = buildReferralLink(wallet);
  const dynamicPending = vm?.teamDynamicPending ?? { usdt: 0, d3: 0, epoch: '—' };
  const dynamicTotal = dynamicPending.usdt + dynamicPending.d3 * 2;

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}
      >
        <motion.div
          className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="site-stat-label mb-2">{t ? '推荐网络' : 'Referral Network'}</div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          {[
            { value: vm?.directCount ?? 0, label: t ? '直推' : 'Direct', accent: true },
            { value: vm?.teamCount ?? 0, label: t ? '团队' : 'Team', accent: false },
            {
              value: dynamicTotal > 0 ? fmtUsd(dynamicTotal) : '—',
              label: t ? '动态待释放' : 'Dynamic pending',
              accent: true,
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08 * i, duration: 0.35 }}
            >
              <div className={cn('site-stat-value-md', stat.accent && 'site-stat-value-accent')}>{stat.value}</div>
              <div className="site-stat-label">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35 }}
        className={glassCardClass('default', 'p-5')}
      >
        <div className="site-section-title mb-3">{t ? '我的推荐链接' : 'My Referral Link'}</div>
        <AddressBlock value={referralLink} isDark={isDark} />
        <p className="site-stat-label mt-3 text-pretty leading-relaxed">
          {t
            ? '成员 / 合伙人推荐入口，与股东联盟 UD3 入金奖励无关；团队动态奖励见下方。'
            : 'Member/partner referral link — separate from Shareholder Alliance UD3 entry rewards; team dynamic rewards below.'}
        </p>
      </motion.div>

      <div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-2 mb-3 px-0.5"
        >
          <motion.div
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <TrendingUp size={16} className="text-[#E0568F]" />
          </motion.div>
          <span className="site-content-title">{t ? '团队动态奖励' : 'Team dynamic rewards'}</span>
        </motion.div>
        <TeamDynamicRewardsPanel
          lang={lang}
          isDark={isDark}
          vm={vm}
          onGoEarn={() => onNavigate('earn')}
          onGoScore={() => onNavigate('me', 'score')}
        />
      </div>
    </div>
  );
}

// ===== SAFETY TAB =====
function SafetyTab({ lang, isDark }: { lang: Lang; isDark: boolean }) {
  const t = lang === 'zh';
  return (
    <div className="space-y-5">
      <IllustrationCard isDark={isDark} caption={t ? 'D³ 安全防护体系' : 'D³ Security System'} className="min-h-[260px] md:min-h-[220px]">
        <SecurityShieldDiagram isDark={isDark} />
      </IllustrationCard>

      <div className={glassCardClass('green', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
        <div className="flex items-center gap-2 mb-3">
          <Shield size={18} className="text-emerald-500" />
          <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? '协议安全状态' : 'Protocol Security Status'}</span>
        </div>
        <div className="text-[10px] text-emerald-500/80 font-medium">{t ? '✓ 所有安全机制正常运行' : '✓ All security mechanisms operational'}</div>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>{t ? '六重价值守护' : 'Six Value Guardians'}</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: 'GATE', status: t ? '入场门控' : 'Entry Control', active: true, icon: Shield },
            { name: 'SEAL', status: t ? '锁仓封印' : 'Lock Seal', active: true, icon: Lock },
            { name: 'BURN', status: t ? '通缩燃烧' : 'Deflation', active: true, icon: Flame },
            { name: 'BAND', status: t ? '价格带护盘' : 'Price Band', active: true, icon: TrendingUp },
            { name: 'SHIELD', status: t ? '国库盾牌' : 'Treasury', active: true, icon: Eye },
            { name: 'HALT', status: t ? '熔断机制' : 'Circuit Breaker', active: false, icon: AlertTriangle },
          ].map((g, i) => (
            <div key={i} className="rounded-xl p-3" style={isDark
              ? { background: 'rgba(255,255,255,0.02)', border: `1px solid ${g.active ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)'}` }
              : { background: 'rgba(138,43,87,0.015)', border: `1px solid ${g.active ? 'rgba(34,197,94,0.1)' : 'rgba(138,43,87,0.05)'}` }
            }>
              <div className="flex items-center gap-2 mb-1">
                <g.icon size={12} className={g.active ? 'text-emerald-500' : (isDark ? 'text-white/30' : 'text-[#160510]/30')} />
                <span className="text-xs font-bold" style={{ color: g.active ? (isDark ? '#E0568F' : '#8A2B57') : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(26,26,26,0.4)') }}>{g.name}</span>
              </div>
              <div className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{g.status}</div>
              <div className={`text-[9px] mt-1 font-medium ${g.active ? 'text-emerald-500/70' : (isDark ? 'text-white/20' : 'text-[#160510]/20')}`}>
                {g.active ? (t ? '● 运行中' : '● Active') : (t ? '○ 待触发' : '○ Standby')}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>{t ? '合约审计' : 'Contract Audit'}</div>
        <div className="space-y-3">
          {[
            { label: t ? '审计机构' : 'Auditor', value: 'CertiK' },
            { label: t ? '审计状态' : 'Status', value: t ? '已通过' : 'Passed', green: true },
            { label: t ? 'Owner 权限' : 'Owner Rights', value: t ? '多签 3/5' : 'Multisig 3/5' },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <span className={`text-xs ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>{item.label}</span>
              <span className={`text-xs font-medium ${(item as any).green ? 'text-emerald-500' : (isDark ? 'text-white' : 'text-[#160510]')}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== HELP TAB =====
function HelpTab({ lang, isDark }: { lang: Lang; isDark: boolean }) {
  const t = lang === 'zh';
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const faqs = t ? [
    { q: '如何入场？', a: '连接钱包后，在"入场"页面选择三种方式之一（现货 Swap、LP 债券、销毁债券），选择锁仓期限后确认即可。' },
    { q: '质押率如何影响日化收益？', a: '增长期（池>6.3M）：质押率越高日化越高；可持续期（池≤6.3M）：质押率越高日化越低，以保护池寿命。详见"收益"页机制说明。' },
    { q: '权重分红怎么算？', a: 'DT 分红按持有占比分配贿赂池 D3；veD3 投票收益按 (个人票数÷Gauge总票)×(贿赂+排放+LP费) 分配。' },
    { q: 'PoC 分数是什么？', a: 'PoC = 0.15H + 0.15C + 0.30A + 0.30R + 0.10E，五维加权得分决定级差收益比例。详见"我的→分数"页。' },
    { q: '大区小区业绩是什么？', a: 'V5 及以上需考核大区与小区业绩，小区=大区×30%。团队推荐树和业绩进度见"我的→团队"页。' },
    { q: '分红多久发放一次？', a: '每个 Epoch（30天）结算一次，治理分红以 USDT 在「收益」页直接领取到钱包。推荐奖励为 UD3，在「资产 → UD3」入账用于质押。' },
  ] : [
    { q: 'How to enter?', a: 'Connect wallet, choose Spot Swap / LP Bond / Burn Bond on Enter page, select lock period and confirm.' },
    { q: 'How does staking rate affect yield?', a: 'Growth phase: higher rate = higher daily yield. Sustain phase: higher rate = lower yield. See Earn tab.' },
    { q: 'How are weight dividends calculated?', a: 'DT dividends by DT share of pool; veD3 rewards by vote weight × (bribe + emission + LP fees).' },
    { q: 'What is PoC score?', a: 'PoC = 0.15H + 0.15C + 0.30A + 0.30R + 0.10E. Weighted score determines level-diff rate. See Me → Score.' },
    { q: 'Large/small area performance?', a: 'V5+ requires both areas; small = large × 30%. See Me → Team for tree and progress.' },
    { q: 'How often are dividends?', a: 'Every Epoch (30 days). Governance dividends are claimed as USDT to your wallet on Earn. Referral rewards are UD3 on Assets → UD3 for staking.' },
  ];

  return (
    <div className="space-y-5">
      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>{t ? '常见问题' : 'FAQ'}</div>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div key={i} className={cn('ios-glass-inset overflow-hidden', openFaq === i && 'ring-1 ring-[#E0568F]/15')}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between p-4 text-left ios-glass-pressable">
                <span className={`text-xs font-medium pr-3 text-pretty-wrap ${isDark ? 'text-white' : 'text-[#160510]'}`}>{faq.q}</span>
                <ChevronDown size={14} className={`shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''} ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`} />
              </button>
              {openFaq === i && (
                <div className="px-4 pb-4">
                  <p className={`text-[11px] leading-relaxed text-pretty-wrap ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>{t ? '文档与支持' : 'Docs & Support'}</div>
        <div className="space-y-2">
          {[
            { label: t ? '白皮书' : 'Whitepaper', icon: ExternalLink },
            { label: t ? '操作文档' : 'Documentation', icon: ExternalLink },
            { label: t ? '审计报告' : 'Audit Report', icon: ExternalLink },
            { label: t ? '联系客服' : 'Contact Support', icon: ExternalLink },
          ].map((link, i) => (
            <button key={i} className="w-full flex items-center justify-between p-3 rounded-xl ios-glass-inset ios-glass-pressable">
              <span className={`text-xs font-medium ${isDark ? 'text-white' : 'text-[#160510]'}`}>{link.label}</span>
              <link.icon size={14} className={isDark ? 'text-white/30' : 'text-[#160510]/30'} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
