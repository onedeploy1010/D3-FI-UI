import { useMemo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  Home,
  Users,
  Wallet,
  Crown,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronDown,
  Search,
  Send,
  ExternalLink,
  Lock,
  Coins,
  TrendingUp,
  Layers,
  Clock,
  Shield,
  PenLine,
  CircleCheck,
  Circle,
} from 'lucide-react';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SitePageHeader, SiteStat } from '@/components/layout/SitePageHeader';
import { glassCardClass, GlassButton, GlassIconButton, GlassChip } from '@/components/ui/GlassSurface';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { WalletGate } from '@/components/wallet/WalletGate';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/wallet-context';
import { SiteTopBar } from '@/components/layout/SiteTopBar';
import { buildReferralLink } from '@/lib/referral';
import { cn } from '@/lib/utils';
import { UnionRevenueStreams } from '@/components/union/UnionRevenueStreams';
import { UnionRulesCarousel } from '@/components/union/UnionRulesCarousel';
import {
  UNION_JOIN_FEE_USDT,
  UNION_SELF_SHARE,
  UNION_TRANSFERABLE_SHARE,
  splitPerformanceUsd3,
  unionEquityStructure,
  unionRevenueStreams,
  usd3DividendFormula,
  d3DividendFormula,
  type UnionMember,
  type UnionTeamNode,
  type MultisigProposal,
  type Usd3AccountView,
} from '@/components/union/unionData';
import { UnionProfileContext, useUnionVm } from '@/contexts/UnionProfileContext';
import { useUnionProfile } from '@/hooks/useUnionProfile';
import { isSupabaseClientConfigured } from '@/lib/supabase';
import type { AppLang } from '@/i18n/types';
import { claimUsd3, joinShareholder, createMultisigProposal, signMultisigProposal, addCommitteeMember, updateCommitteeMember, removeCommitteeMember } from '@/lib/unionApi';

type Lang = 'zh' | 'en';

function teamDepthFromMe(teamNodes: Record<string, UnionTeamNode>, nodeId: string): number {
  let depth = 0;
  let id = nodeId;
  while (id !== 'me') {
    const node = teamNodes[id];
    if (!node?.parentId) return depth;
    depth += 1;
    id = node.parentId;
  }
  return depth;
}
type UnionTab = 'home' | 'governance' | 'assets' | 'team';

const tabs: { id: UnionTab; icon: typeof Home; zh: string; en: string; needsShareholder?: boolean }[] = [
  { id: 'home', icon: Home, zh: '首页', en: 'Home' },
  { id: 'governance', icon: Shield, zh: '多签', en: 'Multisig', needsShareholder: true },
  { id: 'assets', icon: Wallet, zh: '资产', en: 'Assets', needsShareholder: true },
  { id: 'team', icon: Users, zh: '团队', en: 'Team', needsShareholder: true },
];

export default function BribeeUnion() {
  const [lang, setLang] = useState<Lang>('zh');
  const [tab, setTab] = useState<UnionTab>('home');
  const [, navigate] = useLocation();
  const { theme } = useTheme();
  const { wallet } = useWallet();
  const { vm, fallbackVm, isLoading, error, refetch } = useUnionProfile(wallet, lang);
  // This page keeps its own local zh/en toggle; map it to the app-wide 6-lang
  // type for shared components (WalletGate/SiteFooter).
  const appLang: AppLang = lang === 'zh' ? 'zh-CN' : 'en';
  const displayVm = vm ?? fallbackVm;
  const isDark = theme === 'dark';
  const t = lang === 'zh';

  const member = vm?.member ?? {
    isShareholder: false,
    joinedAt: null,
    genesisDt: 0,
    wallet: wallet ?? '',
  };
  const usd3State = vm?.usd3State ?? {
    pending: 0,
    claimedLifetime: 0,
    total: 0,
    available: 0,
    selfPoolRemaining: 0,
    downlinePoolRemaining: 0,
    movedToFi: 0,
    transferredToDownline: 0,
    extractableToFi: 0,
    transferableLeft: 0,
    selfQuota: 0,
    downlineQuota: 0,
  };

  const goTab = (id: UnionTab) => {
    const meta = tabs.find((x) => x.id === id);
    if (meta?.needsShareholder && !member.isShareholder) {
      setTab('home');
      return;
    }
    setTab(id);
  };

  return (
    <WalletGate lang={appLang}>
    <div className={`min-h-screen flex flex-col antialiased transition-colors duration-300 ${isDark ? 'bg-dark-gradient text-[#F5F0EB]' : 'bg-light-gradient text-foreground'}`}>
      <SiteTopBar
        lang={lang}
        onLangToggle={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        logoTo="/"
        logoSize={48}
        isDark={isDark}
        onDisconnect={() => navigate('/portal')}
        leftSlot={
          <GlassIconButton onClick={() => navigate('/portal')} aria-label="Back to portal" className="!h-8 !w-8">
            <ArrowLeft size={16} />
          </GlassIconButton>
        }
      />

      <div className="page-px pt-2 pb-1 max-w-md mx-auto md:max-w-xl w-full">
        <div className="flex items-center gap-2">
          <GlassChip className="!py-1 !px-2.5 text-xs font-bold" style={{ color: '#E0568F' }}>
            {t ? '股东联盟' : 'Shareholder Alliance'}
          </GlassChip>
          {member.isShareholder ? (
            <GlassChip className="!py-1 !px-2.5 text-xs font-bold text-emerald-400 !bg-emerald-500/10 !border-emerald-500/15">
              {t ? '已入股东' : 'Shareholder'}
            </GlassChip>
          ) : (
            <GlassChip className="!py-1 !px-2.5 text-xs font-bold text-amber-400/90 !bg-amber-500/10 !border-amber-500/15">
              {t ? '未开通资格' : 'Locked'}
            </GlassChip>
          )}
        </div>
      </div>

      <main className="page-px py-4 pb-28 max-w-md mx-auto md:max-w-xl flex-1 w-full">
        {!isSupabaseClientConfigured ? (
          <div className={`text-center py-12 px-4 text-sm leading-relaxed ${isDark ? 'text-amber-400/90' : 'text-amber-700'}`}>
            {t
              ? '后端服务未配置，请联系管理员或稍后重试。'
              : 'Backend service is not configured. Please contact support or try again later.'}
          </div>
        ) : isLoading && !vm ? (
          <div className={`text-center py-16 text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
            {t ? '加载个人数据…' : 'Loading your data…'}
          </div>
        ) : displayVm && wallet ? (
        <>
        {error && (
          <div className={cn(glassCardClass('default', 'p-4 mb-4'), 'border border-amber-500/25')}>
            <p className={`text-xs font-semibold text-amber-500 mb-2`}>{t ? '数据加载失败' : 'Failed to load data'}</p>
            <p className={`text-xs leading-relaxed mb-3 ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>{error}</p>
            <GlassButton variant="secondary" className="w-full !py-2.5 !text-xs" onClick={() => void refetch()}>
              {t ? '重试' : 'Retry'}
            </GlassButton>
          </div>
        )}
        <UnionProfileContext.Provider value={displayVm}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            {tab === 'home' && (
              <HomeTab
                lang={lang}
                isDark={isDark}
                member={member}
                usd3Pending={usd3State.pending}
                onJoined={async () => {
                  if (!wallet) return;
                  await joinShareholder(wallet);
                  await refetch();
                  setTab('assets');
                }}
                onAssets={() => goTab('assets')}
                onTeam={() => goTab('team')}
                onGovernance={() => goTab('governance')}
              />
            )}
            {tab === 'governance' && (
              <GovernanceTab lang={lang} isDark={isDark} wallet={wallet} onRefetch={refetch} onGoAssets={() => goTab('assets')} />
            )}
            {tab === 'assets' && (
              <AssetsTab
                lang={lang}
                isDark={isDark}
                usd3State={usd3State}
                onClaimUsd3={async () => {
                  if (!wallet) return;
                  await claimUsd3(wallet);
                  await refetch();
                }}
                onGoFi={() => navigate('/d3fi')}
              />
            )}
            {tab === 'team' && <TeamTab lang={lang} isDark={isDark} wallet={wallet} />}
          </motion.div>
        </AnimatePresence>
        </UnionProfileContext.Provider>
        </>
        ) : (
          <div className={`text-center py-16 text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
            {t ? '连接钱包以加载数据' : 'Connect wallet to load data'}
          </div>
        )}
      </main>

      <SiteFooter lang={appLang} variant="compact" showCta={false} />

      <div className="fixed bottom-0 inset-x-0 z-50 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md md:max-w-xl page-px">
          <div className="ios-glass-card ios-glass-highlight rounded-2xl px-2 py-2 flex items-stretch gap-1">
            {tabs.map((item) => {
              const active = tab === item.id;
              const locked = Boolean(item.needsShareholder && !member.isShareholder);
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goTab(item.id)}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] sm:text-xs font-bold leading-tight transition relative',
                    active
                      ? isDark
                        ? 'bg-white/[0.08] text-[#E0568F]'
                        : 'bg-[#8A2B57]/[0.08] text-[#8A2B57]'
                      : isDark
                        ? 'text-white/55'
                        : 'text-[#160510]/55',
                    locked && 'opacity-60',
                  )}
                >
                  <Icon size={18} />
                  <span>{lang === 'zh' ? item.zh : item.en}</span>
                  {locked && <Lock size={9} className="absolute top-1.5 right-2 opacity-70" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
    </WalletGate>
  );
}

const equityBarColors: Record<string, string> = {
  team: '#6366f1',
  contrib: '#a855f7',
  refer: '#f59e0b',
  perf: '#E0568F',
  dao: '#22c55e',
};

function HomeTab({
  lang,
  isDark,
  member,
  usd3Pending,
  onJoined,
  onAssets,
  onTeam,
  onGovernance,
}: {
  lang: Lang;
  isDark: boolean;
  member: UnionMember;
  usd3Pending: number;
  onJoined: () => void | Promise<void>;
  onAssets: () => void;
  onTeam: () => void;
  onGovernance: () => void;
}) {
  const t = lang === 'zh';
  const ud = useUnionVm();
  const [showRules, setShowRules] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const joinRef = useRef<HTMLDivElement>(null);
  const accent = isDark ? '#E0568F' : '#8A2B57';
  const muted = isDark ? 'text-white/55' : 'text-[#160510]/55';
  const sectionTitle = 'site-section-title';
  const perfRow = unionEquityStructure.find((x) => x.key === 'perf') ?? unionEquityStructure[0];
  const otherEquity = unionEquityStructure.filter((x) => x.key !== 'perf');
  const pendingMultisig = ud.multisigProposals.filter((p) => p.status === 'pending' && p.walletType === 'line').length;
  const scrollToJoin = () => joinRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const listParent = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
  } as const;
  const listItem = {
    hidden: { opacity: 0, y: 10, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  } as const;

  return (
    <div className="space-y-5">
      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/45 to-transparent" />
        <div
          className="absolute -right-6 -top-6 w-28 h-28 rounded-full pointer-events-none opacity-25"
          style={{ background: `radial-gradient(circle, ${accent}55 0%, transparent 70%)` }}
        />
        <div className="relative flex items-center gap-4">
          <div className="ios-glass-inset w-14 h-14 flex items-center justify-center shrink-0 rounded-2xl">
            <Crown size={26} style={{ color: accent }} />
          </div>
          <div className="min-w-0 flex-1">
            <SitePageHeader
              variant="content"
              title={t ? '股东联盟' : 'Shareholder Alliance'}
              subtitle={t ? '认购创世 DT，共享协议收益' : 'Subscribe Genesis DT · share protocol growth'}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          member.isShareholder
            ? { label: t ? '创世 DT' : 'Genesis DT', value: String(member.genesisDt), unit: t ? '凭证' : 'cert', action: onGovernance }
            : { label: t ? '入股门槛' : 'Join fee', value: `${(UNION_JOIN_FEE_USDT / 1000).toFixed(0)}K`, unit: 'USDT', action: scrollToJoin },
          { label: t ? '待领 UD3' : 'UD3 pending', value: usd3Pending.toFixed(0), unit: 'UD3', action: onAssets, locked: !member.isShareholder },
          { label: t ? '待领 D3' : 'D3 pending', value: String(ud.d3PerformanceDividend.pending), unit: 'D3', action: onAssets, locked: !member.isShareholder },
          { label: t ? '待签提案' : 'Pending sig.', value: String(pendingMultisig), unit: '', action: onGovernance, locked: !member.isShareholder },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.locked ? scrollToJoin : item.action}
            className={cn(glassCardClass('default', 'p-4 text-left ios-glass-pressable relative'), item.locked && 'opacity-55')}
          >
            <SiteStat label={item.label} value={item.value} unit={item.unit || undefined} accent />
            {item.locked && <Lock size={9} className="absolute top-2 right-2 opacity-70" />}
          </button>
        ))}
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={sectionTitle + ' mb-4'}>{t ? '权益分配' : 'Equity allocation'}</div>

        <motion.div
          variants={listItem}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-20px' }}
          className={cn(
            'ios-glass-inset rounded-3xl p-4 mb-3 relative overflow-hidden',
            isDark ? 'ring-1 ring-[#E0568F]/25 bg-[#E0568F]/[0.05]' : 'ring-1 ring-[#8A2B57]/15 bg-[#8A2B57]/[0.04]',
          )}
        >
          <div
            className="absolute -right-10 -top-10 w-36 h-36 rounded-full pointer-events-none opacity-30"
            style={{ background: `radial-gradient(circle, ${accent}55 0%, transparent 70%)` }}
          />
          <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <div className={`text-sm sm:text-base font-bold leading-snug ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? perfRow.zh : perfRow.en}</div>
              <div className={`text-xs font-medium mt-1 leading-relaxed text-pretty ${muted}`}>{t ? perfRow.ruleZh : perfRow.ruleEn}</div>
            </div>
            <div className="text-left sm:text-right shrink-0">
              <div className="text-2xl sm:text-3xl font-bold font-stat leading-none" style={{ color: accent }}>
                {perfRow.pct}%
              </div>
              <div className={`text-xs font-semibold mt-1 ${muted}`}>{t ? '核心池' : 'Core pool'}</div>
            </div>
          </div>
          <div className={`h-2.5 rounded-full overflow-hidden mt-4 ${isDark ? 'bg-white/[0.06]' : 'bg-[#8A2B57]/[0.06]'}`}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: equityBarColors[perfRow.key] }}
              initial={{ width: 0 }}
              whileInView={{ width: `${perfRow.pct}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </motion.div>

        <motion.div
          className="grid grid-cols-2 gap-2"
          variants={listParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-20px' }}
        >
          {otherEquity.map((row) => (
            <motion.div key={row.key} variants={listItem} className="ios-glass-inset rounded-2xl px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ background: equityBarColors[row.key] }} />
                  <span className={`text-[11px] sm:text-sm font-semibold leading-snug text-pretty ${isDark ? 'text-white/85' : 'text-[#160510]/85'}`}>{t ? row.zh : row.en}</span>
                </div>
                <span className={`text-sm font-bold font-stat shrink-0 ${isDark ? 'text-white/70' : 'text-[#160510]/70'}`}>{row.pct}%</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <UnionRevenueStreams lang={lang} isDark={isDark} />
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-sm font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
          {t ? '快捷入口' : 'Quick access'}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Shield, label: t ? '多签' : 'Multisig', color: '#6366f1', action: onGovernance, locked: !member.isShareholder },
            { icon: Wallet, label: t ? '资产' : 'Assets', color: '#22c55e', action: onAssets, locked: !member.isShareholder },
            { icon: Users, label: t ? '团队' : 'Team', color: '#f59e0b', action: onTeam, locked: !member.isShareholder },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.locked ? scrollToJoin : item.action}
                className={cn('flex flex-col items-center gap-2 py-3 rounded-xl ios-glass-pressable relative', item.locked && 'opacity-55')}
              >
                <div className="ios-glass-inset w-10 h-10 flex items-center justify-center">
                  <Icon size={18} style={{ color: item.color }} />
                </div>
                <span className={`text-sm font-semibold ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>{item.label}</span>
                {item.locked && <Lock size={9} className="absolute top-2 right-3 opacity-70" />}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowRules((v) => !v)}
        className={cn(
          'w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition',
          isDark ? 'text-white/50 hover:text-white/55' : 'text-[#160510]/50 hover:text-[#160510]/55',
        )}
      >
        {t ? (showRules ? '收起规则详情' : '查看规则详情') : showRules ? 'Hide rules' : 'View rules'}
        <ChevronDown size={14} className={cn('transition-transform', showRules && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {showRules && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden -mt-2"
          >
            <div className={glassCardClass('default', 'p-4 sm:p-5')}>
              <UnionRulesCarousel lang={lang} isDark={isDark} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!member.isShareholder ? (
        <div ref={joinRef} className={glassCardClass('highlight', 'p-5 relative overflow-hidden scroll-mt-4')}>
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/45 to-transparent" />
          <div className={`text-xs font-semibold tracking-wider uppercase mb-3 ${muted}`}>
            {t ? '创世股东认购' : 'Genesis subscription'}
          </div>
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="flex-1 ios-glass-inset p-3 text-center rounded-2xl">
              <div className={`text-xs font-semibold mb-1 ${muted}`}>{t ? '支付' : 'Pay'}</div>
              <div className="text-xl font-bold font-stat text-emerald-500 leading-none">{(UNION_JOIN_FEE_USDT / 1000).toFixed(0)}K</div>
              <div className={`text-xs font-semibold mt-1 ${muted}`}>USDT</div>
            </div>
            <ArrowRight size={18} style={{ color: accent }} />
            <div className="flex-1 ios-glass-inset p-3 text-center rounded-2xl">
              <div className={`text-xs font-semibold mb-1 ${muted}`}>{t ? '获得' : 'Receive'}</div>
              <div className="text-xl font-bold font-stat leading-none" style={{ color: accent }}>1</div>
              <div className="text-xs font-semibold mt-1" style={{ color: accent }}>{t ? '创世 DT' : 'Genesis DT'}</div>
            </div>
          </div>
          <div className={`text-xs font-medium mb-4 leading-relaxed text-pretty ${muted}`}>
            {t ? '支付后解锁资产、团队与多签治理权限' : 'Unlocks Assets, Team & Multisig governance after payment'}
          </div>
          <GlassButton
            variant="primary"
            className="w-full !py-3.5 !text-sm flex items-center justify-center gap-2"
            onClick={() => {
              setConfirming(true);
              void (async () => {
                try {
                  await onJoined();
                } finally {
                  setConfirming(false);
                }
              })();
            }}
          >
            {confirming ? (
              t ? '确认中…' : 'Confirming…'
            ) : (
              <>
                <Crown size={15} />
                {t ? `确认支付 ${UNION_JOIN_FEE_USDT.toLocaleString()} USDT` : `Pay ${UNION_JOIN_FEE_USDT.toLocaleString()} USDT`}
              </>
            )}
          </GlassButton>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <GlassButton variant="primary" className="!py-3 !text-xs" onClick={onAssets}>
            {t ? '领取分红' : 'Claim dividends'}
          </GlassButton>
          <GlassButton variant="secondary" className="!py-3 !text-xs" onClick={onGovernance}>
            {t ? '多签治理' : 'Multisig'}
          </GlassButton>
        </div>
      )}
    </div>
  );
}

function GovernanceTab({
  lang,
  isDark,
  wallet,
  onRefetch,
  onGoAssets,
}: {
  lang: Lang;
  isDark: boolean;
  wallet: string | null;
  onRefetch: () => Promise<void>;
  onGoAssets: () => void;
}) {
  const t = lang === 'zh';
  const ud = useUnionVm();
  const lineMultisigWallet = ud.lineMultisigWallet;
  const daoMultisigWallet = ud.daoMultisigWallet;
  const proposals = ud.multisigProposals;
  const { currentMultisigRole, performanceDividend, usd3PerformanceDividend, d3PerformanceDividend, teamNodes: unionTeamNodes } = ud;
  const accent = isDark ? '#E0568F' : '#8A2B57';
  const muted = isDark ? 'text-white/55' : 'text-[#160510]/55';
  const [view, setView] = useState<'pending' | 'history' | 'create' | 'committee'>('pending');
  const [busy, setBusy] = useState(false);
  const [newSigner, setNewSigner] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newWeight, setNewWeight] = useState('');

  const linePending = proposals.filter((p) => p.walletType === 'line' && p.status === 'pending');
  const lineHistory = proposals.filter((p) => p.walletType === 'line' && p.status !== 'pending');
  const myPending = linePending.filter((p) => {
    const mySig = p.signatures.find((s) => s.signerId === currentMultisigRole.signerId);
    return mySig && !mySig.signedAt;
  });

  const signProposal = async (id: string) => {
    if (!wallet || busy) return;
    setBusy(true);
    try {
      await signMultisigProposal(wallet, id);
      await onRefetch();
    } finally {
      setBusy(false);
    }
  };

  const createProposal = async () => {
    if (!wallet || busy) return;
    setBusy(true);
    try {
      await createMultisigProposal(wallet, {
        periodZh: performanceDividend.currentMonthZh,
        periodEn: performanceDividend.currentMonthEn,
        beneficiaryCount: unionTeamNodes.me?.teamCount ?? 0,
      });
      await onRefetch();
      setView('pending');
    } finally {
      setBusy(false);
    }
  };

  const addSigner = async () => {
    if (!wallet || !newSigner.trim() || busy) return;
    setBusy(true);
    try {
      await addCommitteeMember(wallet, {
        signerWallet: newSigner.trim(),
        roleZh: newRole.trim() || '委员',
        roleEn: newRole.trim() || 'Committee',
        dividendWeightPct: newWeight ? Number(newWeight) : undefined,
      });
      setNewSigner('');
      setNewRole('');
      setNewWeight('');
      await onRefetch();
    } finally {
      setBusy(false);
    }
  };

  const saveSignerWeight = async (memberId: string, weight: number) => {
    if (!wallet || busy) return;
    setBusy(true);
    try {
      await updateCommitteeMember(wallet, memberId, { dividendWeightPct: weight });
      await onRefetch();
    } finally {
      setBusy(false);
    }
  };

  const removeSigner = async (memberId: string) => {
    if (!wallet || busy) return;
    setBusy(true);
    try {
      await removeCommitteeMember(wallet, memberId);
      await onRefetch();
    } finally {
      setBusy(false);
    }
  };

  const renderProposal = (p: MultisigProposal) => {
    const msWallet = p.walletType === 'line' ? lineMultisigWallet : daoMultisigWallet;
    if (!msWallet) return null;
    const signed = p.signatures.filter((s) => s.signedAt).length;
    const mySig = p.signatures.find((s) => s.signerId === currentMultisigRole.signerId);
    const canSign = p.status === 'pending' && mySig && !mySig.signedAt && currentMultisigRole.isCommitteeMember;
    const isLine = p.walletType === 'line';

    return (
      <div key={p.id} className={glassCardClass(isLine ? 'highlight' : 'default', 'p-4')}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className={`text-sm font-bold leading-snug ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? p.titleZh : p.titleEn}</div>
            <div className={`text-xs font-medium mt-1 text-pretty ${muted}`}>{t ? p.descZh : p.descEn}</div>
          </div>
          <GlassChip className={cn('!py-0.5 !px-2 text-[10px] font-bold shrink-0', p.status === 'executed' ? 'text-emerald-400 !bg-emerald-500/10' : 'text-amber-400 !bg-amber-500/10')}>
            {p.status === 'executed' ? (t ? '已执行' : 'Executed') : (t ? '待签' : 'Pending')}
          </GlassChip>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs font-semibold mb-3">
          <div className="ios-glass-inset p-2 rounded-xl">
            <div className={muted}>UD3</div>
            <div className="font-bold font-stat text-emerald-500 mt-0.5">{p.usd3Amount.toLocaleString()}</div>
          </div>
          <div className="ios-glass-inset p-2 rounded-xl">
            <div className={muted}>D3</div>
            <div className="font-bold font-stat mt-0.5" style={{ color: accent }}>{p.d3Amount}</div>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
            <span className={muted}>{t ? '签名进度' : 'Signatures'}</span>
            <span style={{ color: accent }}>{signed}/{msWallet.threshold}</span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-[#8A2B57]/[0.06]'}`}>
            <div className="h-full rounded-full transition-all" style={{ width: `${(signed / msWallet.threshold) * 100}%`, background: isLine ? '#6366f1' : '#22c55e' }} />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {p.signatures.map((sig) => {
              const signer = msWallet.signers.find((s) => s.id === sig.signerId);
              return (
                <span
                  key={sig.signerId}
                  className={cn(
                    'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg',
                    sig.signedAt ? 'text-emerald-500 bg-emerald-500/10' : isDark ? 'text-white/40 bg-white/[0.04]' : 'text-[#160510]/40 bg-[#8A2B57]/[0.04]',
                  )}
                >
                  {sig.signedAt ? <CircleCheck size={10} /> : <Circle size={10} />}
                  {signer ? (t ? signer.roleZh : signer.roleEn) : sig.signerId}
                </span>
              );
            })}
          </div>
        </div>

        {canSign && (
          <GlassButton variant="primary" className="w-full !py-2.5 !text-xs flex items-center justify-center gap-1.5" disabled={busy} onClick={() => void signProposal(p.id)}>
            <PenLine size={14} />
            {t ? '确认签名' : 'Sign proposal'}
          </GlassButton>
        )}
        {p.status === 'executed' && p.txHash && (
          <div className={`text-[10px] font-mono truncate ${muted}`}>
            {p.onchainStatus && p.onchainStatus !== 'off' && (
              <span className="text-emerald-500 mr-1">
                {p.onchainStatus === 'submitted' ? (t ? '链上已广播' : 'On-chain') : p.onchainStatus}
              </span>
            )}
            tx: {p.txHash.slice(0, 18)}…
          </div>
        )}
      </div>
    );
  };

  if (!lineMultisigWallet) {
    return (
      <div className={`text-center py-12 px-4 ${muted}`}>
        <Shield size={32} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium text-pretty">
          {t
            ? '当前钱包未关联本线多签。请使用线长或委员钱包连接。'
            : 'No line multisig for this wallet. Connect as line leader or committee member.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/45 to-transparent" />
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-sm font-bold uppercase tracking-wider text-indigo-500">
              {t ? lineMultisigWallet.labelZh : lineMultisigWallet.labelEn}
            </div>
            <div className={`text-xs font-semibold mt-1 ${muted}`}>
              Privy Key Quorum · {lineMultisigWallet.threshold}/{lineMultisigWallet.totalSigners}
            </div>
          </div>
          <GlassChip className="!py-1 !px-2 text-[10px] font-bold text-indigo-400 !bg-indigo-500/10">
            {currentMultisigRole.isLineLeader ? (t ? '线长' : 'Leader') : currentMultisigRole.isCommitteeMember ? (t ? '委员' : 'Committee') : (t ? '只读' : 'Read-only')}
          </GlassChip>
        </div>

        <AddressBlock label={t ? '金库地址' : 'Treasury'} value={lineMultisigWallet.address} isDark={isDark} />

        <div className="grid grid-cols-2 gap-2 mt-3 text-xs font-semibold">
          <div className="ios-glass-inset p-3 rounded-xl">
            <div className={muted}>{t ? '金库 UD3' : 'UD3 balance'}</div>
            <div className="font-bold font-stat text-emerald-500 mt-0.5 text-base">{lineMultisigWallet.balanceUsd3.toLocaleString()}</div>
          </div>
          <div className="ios-glass-inset p-3 rounded-xl">
            <div className={muted}>{t ? '金库 D3' : 'D3 balance'}</div>
            <div className="font-bold font-stat mt-0.5 text-base" style={{ color: accent }}>{lineMultisigWallet.balanceD3}</div>
          </div>
        </div>
      </div>

      {(usd3PerformanceDividend.multisigPending > 0 || d3PerformanceDividend.multisigPending > 0) && (
        <div className={glassCardClass('accent', 'p-4')}>
          <div className="text-xs font-bold text-amber-500 mb-1">{t ? '关联分红 · 多签待签名' : 'Linked dividends · awaiting multisig'}</div>
          <p className={`text-xs leading-relaxed mb-3 ${muted}`}>
            {t
              ? '市值/分线月度分红已锁定，待本线委员签名通过后入账资产页。'
              : 'Monthly treasury/line dividends are locked until this line multisig approves.'}
          </p>
          <div className="flex flex-wrap gap-3 text-xs font-semibold mb-3">
            {usd3PerformanceDividend.multisigPending > 0 && (
              <span className="text-emerald-500">{usd3PerformanceDividend.multisigPending} UD3</span>
            )}
            {d3PerformanceDividend.multisigPending > 0 && (
              <span style={{ color: accent }}>{d3PerformanceDividend.multisigPending} D3</span>
            )}
          </div>
          <button type="button" onClick={onGoAssets} className="text-xs font-semibold text-indigo-500 ios-glass-pressable">
            {t ? '查看资产页分红 →' : 'View dividends on Assets →'}
          </button>
        </div>
      )}

      <div className="ios-glass-tab-bar flex gap-1 flex-wrap">
        {([
          { id: 'pending' as const, zh: `待签${myPending.length ? ` (${myPending.length})` : ''}`, en: `Pending${myPending.length ? ` (${myPending.length})` : ''}` },
          { id: 'history' as const, zh: '历史', en: 'History' },
          { id: 'create' as const, zh: '发起', en: 'Propose' },
          { id: 'committee' as const, zh: '委员会', en: 'Committee' },
        ]).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={cn(
              'flex-1 min-w-[4.5rem] py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition',
              view === item.id ? 'ios-glass-tab-active text-indigo-500' : isDark ? 'text-white/55' : 'text-[#160510]/45',
              item.id === 'create' && !currentMultisigRole.isLineLeader && 'opacity-40 pointer-events-none',
              item.id === 'committee' && !currentMultisigRole.isLineLeader && 'opacity-40 pointer-events-none',
            )}
          >
            {t ? item.zh : item.en}
          </button>
        ))}
      </div>

      {view === 'pending' && (
        <div className="space-y-3">
          {linePending.length === 0 ? (
            <div className={`text-sm font-medium text-center py-8 ${muted}`}>{t ? '暂无待签提案' : 'No pending proposals'}</div>
          ) : (
            linePending.map(renderProposal)
          )}
          {daoMultisigWallet && proposals.filter((p) => p.walletType === 'dao' && p.status === 'pending').map(renderProposal)}
        </div>
      )}

      {view === 'history' && (
        <div className="space-y-3">
          {lineHistory.length === 0 ? (
            <div className={`text-sm font-medium text-center py-8 ${muted}`}>{t ? '暂无历史记录' : 'No history yet'}</div>
          ) : (
            lineHistory.map(renderProposal)
          )}
        </div>
      )}

      {view === 'create' && currentMultisigRole.isLineLeader && (
        <div className={glassCardClass('default', 'p-5 space-y-4')}>
          <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-[#160510]'}`}>
            {t ? '发起月度分红提案' : 'Create monthly dividend proposal'}
          </div>
          <div className={`text-xs font-medium leading-relaxed text-pretty ${muted}`}>
            {t
              ? `线长发起后，需 ${lineMultisigWallet.threshold}/${lineMultisigWallet.totalSigners} 委员签名确认，达标后自动执行发放。`
              : `Line leader proposes; ${lineMultisigWallet.threshold}/${lineMultisigWallet.totalSigners} committee signatures required to execute.`}
          </div>
          <div className="ios-glass-inset p-3 space-y-2 text-xs font-semibold">
            <div className="flex justify-between"><span className={muted}>{t ? '结算周期' : 'Period'}</span><span>{t ? performanceDividend.currentMonthZh : performanceDividend.currentMonthEn}</span></div>
            <div className="flex justify-between"><span className={muted}>{t ? '本线业绩' : 'Line perf.'}</span><span>${performanceDividend.linePerformanceUsd.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className={muted}>{t ? '月度待多签 UD3' : 'Monthly UD3 (multisig)'}</span><span className="text-amber-500">{usd3PerformanceDividend.multisigPending || '—'}</span></div>
            <div className="flex justify-between"><span className={muted}>{t ? '月度待多签 D3' : 'Monthly D3 (multisig)'}</span><span className="text-amber-500">{d3PerformanceDividend.multisigPending || '—'}</span></div>
          </div>
          <GlassButton variant="primary" className="w-full !py-3 !text-sm" disabled={busy} onClick={() => void createProposal()}>
            {busy ? (t ? '提交中…' : 'Submitting…') : (t ? '发起多签提案' : 'Submit proposal')}
          </GlassButton>
        </div>
      )}

      {view === 'committee' && currentMultisigRole.isLineLeader && (
        <div className="space-y-3">
          {lineMultisigWallet.signers.map((s) => (
            <div key={s.id} className={glassCardClass('default', 'p-4')}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? s.roleZh : s.roleEn}</div>
                  <div className={`text-[10px] font-mono mt-0.5 ${muted}`}>{s.short}</div>
                </div>
                {s.isSelf && (
                  <GlassChip className="!py-0.5 !px-2 text-[10px] font-bold text-indigo-400 !bg-indigo-500/10">
                    {t ? '你' : 'You'}
                  </GlassChip>
                )}
              </div>
              {!s.isSelf && s.id !== 'me' && (
                <div className="flex items-center gap-2 mt-2">
                  <label className={`text-[10px] font-semibold shrink-0 ${muted}`}>{t ? '分红权重 %' : 'Weight %'}</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={s.dividendWeightPct ?? ''}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v) && s.id) void saveSignerWeight(s.id, v);
                    }}
                    className={`flex-1 ios-glass-inset px-2 py-1 text-xs outline-none ${isDark ? 'text-white' : 'text-[#160510]'}`}
                  />
                  <button type="button" onClick={() => void removeSigner(s.id)} className="text-[10px] font-semibold text-red-400 ios-glass-pressable px-2">
                    {t ? '移除' : 'Remove'}
                  </button>
                </div>
              )}
            </div>
          ))}
          <div className={glassCardClass('default', 'p-4 space-y-3')}>
            <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? '任命委员' : 'Appoint committee member'}</div>
            <input value={newSigner} onChange={(e) => setNewSigner(e.target.value)} placeholder="0x…" className={`w-full ios-glass-inset px-3 py-2 text-xs font-mono outline-none ${isDark ? 'text-white' : 'text-[#160510]'}`} />
            <input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder={t ? '角色名称' : 'Role label'} className={`w-full ios-glass-inset px-3 py-2 text-xs outline-none ${isDark ? 'text-white' : 'text-[#160510]'}`} />
            <input value={newWeight} onChange={(e) => setNewWeight(e.target.value)} placeholder={t ? '分红权重 %（可选）' : 'Dividend weight % (optional)'} className={`w-full ios-glass-inset px-3 py-2 text-xs outline-none ${isDark ? 'text-white' : 'text-[#160510]'}`} />
            <GlassButton variant="secondary" className="w-full !py-2.5 !text-xs" disabled={busy || !newSigner.trim()} onClick={() => void addSigner()}>
              {t ? '添加委员' : 'Add member'}
            </GlassButton>
          </div>
        </div>
      )}

      {daoMultisigWallet && (
        <div className={glassCardClass('default', 'p-4')}>
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} className="text-emerald-500" />
            <span className={`text-xs font-bold uppercase tracking-wider ${muted}`}>{t ? daoMultisigWallet.labelZh : daoMultisigWallet.labelEn}</span>
          </div>
          <div className={`text-xs font-medium mb-2 ${muted}`}>
            {daoMultisigWallet.threshold}/{daoMultisigWallet.totalSigners} · {t ? '协议层多签，只读查看' : 'Protocol-level multisig · read-only'}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
            <div className="ios-glass-inset p-2 rounded-xl">
              <div className={muted}>UD3</div>
              <div className="font-bold font-stat text-emerald-500/80 mt-0.5">{(daoMultisigWallet.balanceUsd3 / 1000).toFixed(0)}K</div>
            </div>
            <div className="ios-glass-inset p-2 rounded-xl">
              <div className={muted}>D3</div>
              <div className="font-bold font-stat mt-0.5" style={{ color: accent }}>{(daoMultisigWallet.balanceD3 / 1000).toFixed(1)}K</div>
            </div>
          </div>
        </div>
      )}

      <p className={`text-[11px] sm:text-xs font-semibold text-center leading-relaxed px-2 text-pretty ${muted}`}>
        {t ? '分线收益由线长发起、委员多签复核后发放。协议 DAO 储备由独立多签管理。' : 'Line dividends: leader proposes, committee multisig confirms. DAO reserve managed separately.'}
      </p>
    </div>
  );
}

function AssetsTab({
  lang,
  isDark,
  usd3State,
  onClaimUsd3,
  onGoFi,
}: {
  lang: Lang;
  isDark: boolean;
  usd3State: Usd3AccountView;
  onClaimUsd3: () => void;
  onGoFi: () => void;
}) {
  const t = lang === 'zh';
  const ud = useUnionVm();
  const { performanceDividend, usd3PerformanceDividend, d3PerformanceDividend, recentUsd3Dividends, recentD3Dividends } = ud;
  const [dividendAsset, setDividendAsset] = useState<'usd3' | 'd3'>('usd3');
  const [mode, setMode] = useState<'overview' | 'transfer' | 'extract'>('overview');
  const [amount, setAmount] = useState('');
  const [toAddr, setToAddr] = useState('');
  const [showFormula, setShowFormula] = useState(false);
  const left = usd3State.transferableLeft;
  const pendingSplit = splitPerformanceUsd3(usd3State.pending);
  const muted = isDark ? 'text-white/55' : 'text-[#160510]/55';

  if (mode === 'transfer') {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setMode('overview')} className={`text-xs font-medium ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>
          ← {t ? '返回资产' : 'Back'}
        </button>
        <div className={glassCardClass('accent', 'p-4')}>
          <div className={`text-sm font-medium leading-relaxed ${isDark ? 'text-[#E0568F]/85' : 'text-[#8A2B57]/80'}`}>
            {t
              ? '可转让额度来自 UD3 收益的 50%，转入伞下成员的 D3-Fi 账户用于投资质押。'
              : 'Transferable quota is 50% of UD3 revenue, credited to downline D3-Fi accounts for staking.'}
          </div>
        </div>
        <div className={glassCardClass('default', 'p-5')}>
          <div className="ios-glass-inset p-3 mb-4 flex justify-between text-xs">
            <span className={isDark ? 'text-white/55' : 'text-[#160510]/55'}>{t ? '剩余可转让' : 'Remaining quota'}</span>
            <span className="font-bold text-emerald-500">{left} UD3</span>
          </div>
          <div className={`text-xs font-semibold mb-2 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>{t ? '伞下 D3-Fi 地址' : 'Downline D3-Fi address'}</div>
          <input
            value={toAddr}
            onChange={(e) => setToAddr(e.target.value)}
            placeholder="0x..."
            className={`w-full ios-glass-inset px-3 py-2.5 text-xs font-mono mb-4 outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/25'}`}
          />
          <div className={`text-xs font-semibold mb-2 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>{t ? '转让数量' : 'Amount'}</div>
          <div className="flex items-center gap-3 mb-5">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`flex-1 bg-transparent text-xl font-bold font-stat outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/20'}`}
            />
            <span className={`text-sm ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>UD3</span>
          </div>
          <GlassButton variant="primary" className="w-full !py-3.5 !text-sm flex items-center justify-center gap-2">
            <Send size={14} /> {t ? '确认转入伞下 D3-Fi' : 'Transfer to Downline D3-Fi'}
          </GlassButton>
        </div>
      </div>
    );
  }

  if (mode === 'extract') {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setMode('overview')} className={`text-xs font-medium ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>
          ← {t ? '返回资产' : 'Back'}
        </button>
        <div className={glassCardClass('default', 'p-5')}>
          <div className={`text-sm font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
            {t ? '转入 D3-Fi 投资' : 'Move to D3-Fi'}
          </div>
          <p className={`text-sm font-medium mb-4 leading-relaxed ${isDark ? 'text-white/55' : 'text-[#160510]/45'}`}>
            {t ? '将 UD3 转入自己的 D3-Fi 账户，用于 LP / 销毁债券质押。' : 'Move UD3 into your D3-Fi account for LP / burn-bond staking.'}
          </p>
          <div className="ios-glass-inset p-3 mb-4 flex justify-between text-xs">
            <span className={isDark ? 'text-white/55' : 'text-[#160510]/55'}>{t ? '可转入' : 'Available'}</span>
            <span className="font-bold">{usd3State.extractableToFi} UD3</span>
          </div>
          <div className={`text-xs font-semibold mb-2 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>{t ? '转入数量' : 'Amount'}</div>
          <div className="flex items-center gap-3 mb-5">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`flex-1 bg-transparent text-xl font-bold font-stat outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/20'}`}
            />
            <button type="button" className="text-[#E0568F] text-xs font-semibold" onClick={() => setAmount(String(usd3State.extractableToFi))}>
              MAX
            </button>
          </div>
          <GlassButton variant="primary" className="w-full !py-3.5 !text-sm mb-2" onClick={onGoFi}>
            {t ? '确认转入并前往 D3-Fi' : 'Move & Open D3-Fi'}
          </GlassButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="ios-glass-tab-bar flex gap-1">
        {([
          { id: 'usd3' as const, zh: 'UD3 分红', en: 'UD3' },
          { id: 'd3' as const, zh: 'D3 分红', en: 'D3' },
        ]).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setDividendAsset(item.id)}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-semibold transition',
              dividendAsset === item.id
                ? item.id === 'usd3'
                  ? 'ios-glass-tab-active text-emerald-600'
                  : 'ios-glass-tab-active text-[#8A2B57]'
                : isDark ? 'text-white/55' : 'text-[#160510]/45',
            )}
          >
            {t ? item.zh : item.en}
          </button>
        ))}
      </div>

      {dividendAsset === 'usd3' ? (
        <>
          {(usd3PerformanceDividend.multisigPending > 0) && (
            <div className={glassCardClass('accent', 'p-4')}>
              <div className="flex items-center gap-2 mb-2">
                <Shield size={14} className="text-amber-500" />
                <span className="text-xs font-bold text-amber-500">{t ? '多签待签名 · 月度分红' : 'Multisig pending · monthly dividends'}</span>
              </div>
              <p className={`text-xs leading-relaxed mb-2 ${muted}`}>
                {t
                  ? `${usd3PerformanceDividend.multisigPending} UD3 已关联待签提案，委员签名通过后可在本页领取。`
                  : `${usd3PerformanceDividend.multisigPending} UD3 is locked until the line multisig proposal is signed.`}
              </p>
            </div>
          )}
          <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/45 to-transparent" />
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <div className="text-sm font-bold uppercase tracking-wider text-emerald-600">
                  {t ? 'UD3 待领取' : 'UD3 pending'}
                </div>
                <div className={`text-xs font-semibold mt-1 ${isDark ? 'text-white/55' : 'text-[#160510]/45'}`}>
                  {t ? usd3PerformanceDividend.settlementZh : usd3PerformanceDividend.settlementEn}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFormula((v) => !v)}
                className={`text-xs font-semibold px-2 py-1 rounded-lg ${isDark ? 'text-emerald-400/80 bg-white/[0.06]' : 'text-emerald-700/80 bg-emerald-500/[0.08]'}`}
              >
                {showFormula ? (t ? '收起' : 'Hide') : (t ? '规则' : 'Rules')}
              </button>
            </div>

            {showFormula && (
              <ul className={`text-xs font-semibold space-y-1.5 mb-3 leading-relaxed ios-glass-inset p-3 ${isDark ? 'text-white/45' : 'text-[#160510]/55'}`}>
                {(t ? usd3DividendFormula.zh : usd3DividendFormula.en).map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            )}

            <div className="ios-glass-inset p-4 mb-3">
              <div className={`text-xs font-semibold ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>{t ? '待领取（三路收益合计）' : 'Pending (3 streams)'}</div>
              <div className="text-3xl font-bold font-stat text-emerald-500 mt-1">{usd3State.pending.toFixed(1)} UD3</div>
              <div className={`text-sm font-medium mt-1.5 ${isDark ? 'text-white/25' : 'text-[#160510]/45'}`}>
                {t ? '累计已领' : 'Lifetime'} {usd3State.claimedLifetime.toLocaleString()} UD3
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3 text-xs font-semibold">
              <div className="ios-glass-inset p-2.5 text-center">
                <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '领取后自留' : 'Self after claim'}</div>
                <div className="font-bold mt-0.5">{pendingSplit.self} UD3</div>
                <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>{UNION_SELF_SHARE * 100}% → D3-Fi</div>
              </div>
              <div className="ios-glass-inset p-2.5 text-center">
                <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '领取后可转伞下' : 'Downline after claim'}</div>
                <div className="font-bold mt-0.5 text-emerald-500">{pendingSplit.transferable} UD3</div>
                <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>{UNION_TRANSFERABLE_SHARE * 100}% → D3-Fi</div>
              </div>
            </div>

            <GlassButton
              variant="primary"
              className="w-full !py-3.5 !text-sm mb-3 !bg-gradient-to-r !from-emerald-600 !to-emerald-700"
              onClick={onClaimUsd3}
              disabled={usd3State.pending <= 0}
            >
              {usd3State.pending > 0
                ? (t ? `领取 ${usd3State.pending.toFixed(1)} UD3 到资产账户` : `Claim ${usd3State.pending.toFixed(1)} UD3`)
                : (t ? '本期已领取' : 'Nothing to claim')}
            </GlassButton>

            <div className={`text-xs font-medium space-y-1 leading-relaxed ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
              <p>{t ? `手续费 Epoch：${usd3PerformanceDividend.nextEpochSettlementZh}` : `Fees Epoch: ${usd3PerformanceDividend.nextEpochSettlementEn}`}</p>
              <p>{t ? `市值/分线月度：${usd3PerformanceDividend.nextMonthlySettlementZh}` : `Treasury/line monthly: ${usd3PerformanceDividend.nextMonthlySettlementEn}`}</p>
            </div>
          </div>

          {usd3State.pending > 0 && (
            <div className="flex flex-col items-center -my-2 relative z-10">
              <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isDark ? 'bg-white/[0.06] text-white/50' : 'bg-[#8A2B57]/[0.06] text-[#160510]/50'}`}>
                {t ? '领取后入账' : 'Credits on claim'}
              </div>
              <ArrowDown size={16} className={isDark ? 'text-white/30' : 'text-[#160510]/30'} />
            </div>
          )}

          <div className={glassCardClass('default', 'p-5')}>
            <div className={`text-sm font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
              {t ? 'UD3 资产账户' : 'UD3 balance'}
            </div>
            <div className={`text-xs font-medium mb-3 ${muted}`}>
              {t ? '已领取余额（= 累计已领 − 已转出）' : 'Claimed balance (= lifetime − moved out)'}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3 text-xs font-semibold">
              <div className="ios-glass-inset p-3">
                <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '账户余额' : 'Balance'}</div>
                <div className="font-bold font-stat text-base mt-0.5">{usd3State.total.toLocaleString()} UD3</div>
              </div>
              <div className="ios-glass-inset p-3">
                <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '可操作' : 'Actionable'}</div>
                <div className="font-bold font-stat text-base mt-0.5 text-emerald-500">{usd3State.available.toLocaleString()} UD3</div>
              </div>
            </div>
            <div className={`text-xs font-medium mb-3 leading-relaxed ios-glass-inset p-2.5 ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
              {t
                ? `${usd3State.claimedLifetime} 累计已领 = ${usd3State.movedToFi} 已转 D3-Fi + ${usd3State.transferredToDownline} 已转伞下 + ${usd3State.total} 账户余额`
                : `${usd3State.claimedLifetime} claimed = ${usd3State.movedToFi} to D3-Fi + ${usd3State.transferredToDownline} downline + ${usd3State.total} balance`}
            </div>

            <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
              {t ? '已到账拆分（50/50）' : 'Claimed split (50/50)'}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3 text-xs font-semibold">
              <div className="ios-glass-inset p-2.5 text-center">
                <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '可转 D3-Fi' : 'To D3-Fi'}</div>
                <div className="font-bold mt-0.5">{usd3State.extractableToFi} UD3</div>
                <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
                  {t ? `自留池 ${usd3State.selfQuota}（余 ${usd3State.selfPoolRemaining}）` : `Self pool ${usd3State.selfQuota} (${usd3State.selfPoolRemaining} left)`}
                </div>
              </div>
              <div className="ios-glass-inset p-2.5 text-center ring-1 ring-emerald-500/20">
                <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '可转伞下' : 'To downline'}</div>
                <div className="font-bold mt-0.5 text-emerald-500">{left} UD3</div>
                <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
                  {t ? `已用 ${usd3State.transferredToDownline} / ${usd3State.downlineQuota}` : `Used ${usd3State.transferredToDownline} / ${usd3State.downlineQuota}`}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <GlassButton variant="secondary" className="!py-2.5 !text-[11px] sm:!text-xs leading-tight" onClick={() => setMode('extract')}>
                {t ? '转 D3-Fi' : 'To D3-Fi'}
              </GlassButton>
              <GlassButton variant="secondary" className="!py-2.5 !text-[11px] sm:!text-xs leading-tight" onClick={() => setMode('transfer')}>
                {t ? '转伞下' : 'Downline'}
              </GlassButton>
            </div>
          </div>

          <div className={glassCardClass('default', 'p-5')}>
            <div className={`text-sm font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
              {t ? 'UD3 构成' : 'UD3 breakdown'}
            </div>
            <UnionRevenueStreams lang={lang} isDark={isDark} compact />
            <div className="mt-3 space-y-2">
              {usd3PerformanceDividend.breakdown.map((row) => {
                const stream = unionRevenueStreams.find((s) => s.id === row.streamId)!;
                return (
                  <div key={row.streamId} className="ios-glass-inset px-3 py-2 rounded-xl space-y-1">
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-semibold ${isDark ? 'text-white/70' : 'text-[#160510]/70'}`}>{t ? stream.zh : stream.en}</span>
                      <span className="font-bold font-stat text-emerald-500">{row.amount} UD3</span>
                    </div>
                    {row.multisigPending > 0 && (
                      <div className="flex justify-between text-[10px] font-semibold text-amber-500">
                        <span>{t ? '多签待签' : 'Multisig pending'}</span>
                        <span>{row.multisigPending} UD3</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={glassCardClass('default', 'p-5')}>
            <div className={`text-sm font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
              {t ? 'UD3 分红记录' : 'UD3 history'}
            </div>
            <div className="space-y-2">
              {recentUsd3Dividends.map((r) => (
                <div key={r.id} className={`flex items-center justify-between py-2 border-b last:border-0 ${isDark ? 'border-white/[0.04]' : 'border-[#8A2B57]/[0.04]'}`}>
                  <div>
                    <div className={`text-xs ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? r.sourceZh : r.sourceEn}</div>
                    <div className={`text-xs font-semibold ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>{r.period} · {r.date}</div>
                  </div>
                  <div className="text-right text-xs font-semibold">
                    {r.amount > 0 ? (
                      <>
                        <div className="font-bold font-stat text-emerald-500">+{r.amount} UD3</div>
                        <div className={`text-sm font-medium mt-0.5 ${r.status === 'claimed' ? 'text-emerald-500/70' : r.status === 'multisig_pending' ? 'text-amber-500/80' : ''}`}>
                          {r.status === 'claimed'
                            ? (t ? '已领取' : 'Claimed')
                            : r.status === 'multisig_pending'
                              ? (t ? '多签待签' : 'Multisig pending')
                              : r.status === 'claimable'
                                ? (t ? '可领取' : 'Claimable')
                                : ''}
                        </div>
                      </>
                    ) : (
                      <span className={isDark ? 'text-white/50' : 'text-[#160510]/55'}>{t ? '无分红' : 'None'}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
            <>
              <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/45 to-transparent" />
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="text-sm font-bold uppercase tracking-wider" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>
                      {t ? 'D3 待领取' : 'D3 pending'}
                    </div>
                    <div className={`text-xs font-semibold mt-1 ${isDark ? 'text-white/55' : 'text-[#160510]/45'}`}>
                      {t ? d3PerformanceDividend.settlementZh : d3PerformanceDividend.settlementEn}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFormula((v) => !v)}
                    className={`text-xs font-semibold px-2 py-1 rounded-lg ${isDark ? 'text-[#E0568F]/80 bg-white/[0.06]' : 'text-[#8A2B57]/80 bg-[#8A2B57]/[0.06]'}`}
                  >
                    {showFormula ? (t ? '收起' : 'Hide') : (t ? '规则' : 'Rules')}
                  </button>
                </div>

                {showFormula && (
                  <ul className={`text-xs font-semibold space-y-1.5 mb-3 leading-relaxed ios-glass-inset p-3 ${isDark ? 'text-white/45' : 'text-[#160510]/55'}`}>
                    {(t ? d3DividendFormula.zh : d3DividendFormula.en).map((line) => (
                      <li key={line}>· {line}</li>
                    ))}
                  </ul>
                )}

                <div className="ios-glass-inset p-4 mb-4">
                  <div className={`text-xs font-semibold ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>{t ? '待领取（三路收益合计）' : 'Pending (3 streams)'}</div>
                  <div className="text-3xl font-bold font-stat mt-1" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>
                    {d3PerformanceDividend.pending} D3
                  </div>
                  <div className={`text-sm font-medium mt-1.5 ${isDark ? 'text-white/25' : 'text-[#160510]/45'}`}>
                    {t ? '累计已领' : 'Lifetime'} {d3PerformanceDividend.claimedLifetime} D3
                  </div>
                </div>

                <GlassButton variant="primary" className="w-full !py-3.5 !text-sm mb-3">
                  {t ? '领取 D3 到钱包' : 'Claim D3 to wallet'}
                </GlassButton>

                <div className={`text-xs font-medium space-y-1 leading-relaxed ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
                  <p>{t ? `手续费 Epoch：${d3PerformanceDividend.nextEpochSettlementZh}` : `Fees Epoch: ${d3PerformanceDividend.nextEpochSettlementEn}`}</p>
                  <p>{t ? `市值/分线月度：${d3PerformanceDividend.nextMonthlySettlementZh}` : `Treasury/line monthly: ${d3PerformanceDividend.nextMonthlySettlementEn}`}</p>
                </div>
              </div>

              <div className={glassCardClass('default', 'p-5')}>
                <div className={`text-sm font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
                  {t ? 'D3 构成' : 'D3 breakdown'}
                </div>
                <UnionRevenueStreams lang={lang} isDark={isDark} compact />
                <div className="mt-3 space-y-2">
                  {d3PerformanceDividend.breakdown.map((row) => {
                    const stream = unionRevenueStreams.find((s) => s.id === row.streamId)!;
                    return (
                      <div key={row.streamId} className="flex justify-between items-center ios-glass-inset px-3 py-2 rounded-xl">
                        <span className={`text-xs font-semibold ${isDark ? 'text-white/70' : 'text-[#160510]/70'}`}>{t ? stream.zh : stream.en}</span>
                        <span className="font-bold font-stat" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>{row.amount} D3</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={glassCardClass('default', 'p-5')}>
                <div className={`text-sm font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
                  {t ? 'D3 分红记录' : 'D3 history'}
                </div>
                <div className="space-y-2">
                  {recentD3Dividends.map((r) => (
                    <div key={r.id} className={`flex items-center justify-between py-2 border-b last:border-0 ${isDark ? 'border-white/[0.04]' : 'border-[#8A2B57]/[0.04]'}`}>
                      <div>
                        <div className={`text-xs ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? r.sourceZh : r.sourceEn}</div>
                        <div className={`text-xs font-semibold ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>{r.period} · {r.date}</div>
                      </div>
                      <div className="text-right text-xs font-semibold">
                        {r.amount > 0 ? (
                          <>
                            <div className="font-bold font-stat" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>+{r.amount} D3</div>
                            <div className={`text-sm font-medium mt-0.5 ${r.status === 'claimable' ? 'text-amber-500' : 'text-emerald-500/70'}`}>
                              {r.status === 'claimable' ? (t ? '待领取' : 'Claimable') : t ? '已领取' : 'Claimed'}
                            </div>
                          </>
                        ) : (
                          <span className={isDark ? 'text-white/50' : 'text-[#160510]/55'}>{t ? '无分红' : 'None'}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

      <div className="grid grid-cols-2 gap-2 text-xs font-semibold ios-glass-inset p-3">
        <div>
          <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '本线业绩' : 'Line perf.'}</div>
          <div className="font-bold font-stat mt-0.5 text-sm sm:text-base">${performanceDividend.linePerformanceUsd.toLocaleString()}</div>
        </div>
        <div>
          <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '权益占比' : 'Equity share'}</div>
          <div className="font-bold font-stat mt-0.5 text-sm sm:text-base">{performanceDividend.equitySharePct}%</div>
        </div>
      </div>

      <p className={`text-[11px] sm:text-xs font-semibold text-center leading-relaxed px-2 text-pretty ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
        {t
          ? '三路收益结算，无推荐通道。UD3 协议内使用，D3 链上领取。月度部分需多签通过后到账。'
          : 'Three revenue streams, no referral channel. UD3 in-app, D3 on-chain. Monthly portions require multisig approval.'}
      </p>
    </div>
  );
}

function TeamTab({ lang, isDark, wallet }: { lang: Lang; isDark: boolean; wallet: string | null }) {
  const t = lang === 'zh';
  const ud = useUnionVm();
  const teamNodes = ud.teamNodes;
  const [focusId, setFocusId] = useState('me');
  const [q, setQ] = useState('');
  const referralLink = buildReferralLink(wallet);

  const focus = teamNodes[focusId] ?? teamNodes.me;
  const parent = focus.parentId ? teamNodes[focus.parentId] : null;
  const children = focus.childrenIds.map((id) => teamNodes[id]).filter(Boolean);
  const currentDepth = useMemo(() => teamDepthFromMe(teamNodes, focusId), [teamNodes, focusId]);
  const layerLabel =
    focusId === 'me'
      ? t
        ? `第 ${currentDepth} 层 · 我`
        : `Layer ${currentDepth} · You`
      : t
        ? `第 ${currentDepth} 层`
        : `Layer ${currentDepth}`;
  const childLayerLabel = t ? `第 ${currentDepth + 1} 层 · 下级节点` : `Layer ${currentDepth + 1} · Downline`;

  const searchHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [] as UnionTeamNode[];
    return Object.values(teamNodes).filter(
      (n) => n.id !== 'me' && (n.address.toLowerCase().includes(needle) || n.short.toLowerCase().includes(needle) || n.level.toLowerCase().includes(needle)),
    );
  }, [q, teamNodes]);

  return (
    <div className="space-y-5">
      <div className={glassCardClass('default', 'p-5')}>
        <div className="site-section-title mb-2">{t ? '我的推荐链接' : 'My Referral Link'}</div>
        <p className={`text-xs mb-3 leading-relaxed ${isDark ? 'text-white/50' : 'text-muted-foreground'}`}>
          {t
            ? '与 D3-Fi 相同的 member 推荐链接。对方连接钱包并绑定后，将作为您的直推下线。'
            : 'Same member referral link as D3-Fi. After they connect and bind, they join as your direct downline.'}
        </p>
        <AddressBlock value={referralLink} isDark={isDark} />
      </div>

      <div className={glassCardClass('highlight', 'p-5')}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <div className={`text-xs font-semibold ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>
                {t ? '当前层' : 'Current layer'}
              </div>
              <GlassChip className="!py-1 !px-2 text-[10px] font-bold flex items-center gap-1" style={{ color: '#E0568F' }}>
                <Layers size={11} />
                {layerLabel}
              </GlassChip>
            </div>
            <AddressBlock
              label={t ? '节点地址' : 'Node address'}
              value={focus.address}
              isDark={isDark}
              compact
            />
          </div>
          <GlassChip className="!py-1 !px-2 text-xs font-bold shrink-0" style={{ color: '#E0568F' }}>
            {focus.level}
          </GlassChip>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
          <div className="ios-glass-inset p-2.5">
            <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '个人业绩' : 'Personal'}</div>
            <div className="font-bold mt-0.5">${focus.personalUsd.toLocaleString()}</div>
          </div>
          <div className="ios-glass-inset p-2.5">
            <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '团队业绩' : 'Team'}</div>
            <div className="font-bold mt-0.5">${focus.teamUsd.toLocaleString()}</div>
          </div>
          <div className="ios-glass-inset p-2.5">
            <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '直推' : 'Direct'}</div>
            <div className="font-bold mt-0.5">{focus.directCount}</div>
          </div>
          <div className="ios-glass-inset p-2.5">
            <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '伞下人数' : 'Umbrella'}</div>
            <div className="font-bold mt-0.5">{focus.teamCount}</div>
          </div>
        </div>
        <div className={`text-xs font-semibold mt-3 leading-relaxed ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
          {t ? '团队业绩影响收益权重。' : 'Team performance affects revenue weight.'}
        </div>
        <div className="flex gap-2 mt-4">
          <GlassButton
            variant="secondary"
            className="flex-1 !py-2.5 !text-xs flex items-center justify-center gap-1"
            disabled={!parent}
            onClick={() => parent && setFocusId(parent.id)}
          >
            <ArrowUp size={12} /> {t ? '上一层' : 'Up'}
          </GlassButton>
          <GlassButton variant="secondary" className="flex-1 !py-2.5 !text-xs" onClick={() => setFocusId('me')}>
            {t ? '回到我' : 'My root'}
          </GlassButton>
        </div>
      </div>

      <div className={glassCardClass('default', 'p-4')}>
        <div className="flex items-center gap-2 ios-glass-inset px-3 py-2.5">
          <Search size={14} className={isDark ? 'text-white/50' : 'text-[#160510]/50'} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t ? '搜索地址 / 等级' : 'Search address / level'}
            className={`flex-1 bg-transparent text-xs outline-none ${isDark ? 'text-white placeholder:text-white/25' : 'text-[#160510] placeholder:text-[#160510]/45'}`}
          />
        </div>
        {q.trim() && (
          <div className="mt-3 space-y-1">
            {searchHits.length === 0 && <div className={`text-sm font-medium py-3 text-center ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>{t ? '无匹配节点' : 'No matches'}</div>}
            {searchHits.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setFocusId(n.id);
                  setQ('');
                }}
                className={`w-full text-left ios-glass-pressable rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-[#8A2B57]/[0.04]'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className={`text-[10px] font-semibold mb-1.5 ${isDark ? 'text-white/45' : 'text-[#160510]/45'}`}>
                    {t ? `第 ${teamDepthFromMe(teamNodes, n.id)} 层` : `Layer ${teamDepthFromMe(teamNodes, n.id)}`}
                    {' · '}
                    {n.level}
                  </div>
                  <AddressBlock value={n.address} isDark={isDark} compact showCopy />
                </div>
                <ChevronRight size={14} className={`shrink-0 ${isDark ? 'text-white/45' : 'text-[#160510]/45'}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-sm font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
          {childLayerLabel}
        </div>
        <p className={`text-[10px] font-medium mb-3 ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
          {t ? `从当前第 ${currentDepth} 层向下查看` : `Drill down from layer ${currentDepth}`}
        </p>
        {children.length === 0 ? (
          <div className={`text-sm font-medium text-center py-6 ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>{t ? '没有更下层节点' : 'No deeper nodes'}</div>
        ) : (
          <div className="space-y-2">
            {children.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setFocusId(n.id)}
                className={`w-full text-left rounded-xl px-3 py-3 ios-glass-inset ios-glass-pressable flex items-start justify-between gap-2`}
              >
                <div className="min-w-0 flex-1">
                  <div className={`text-[10px] font-semibold mb-1.5 flex flex-wrap gap-2 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>
                    <span>{t ? `第 ${currentDepth + 1} 层` : `Layer ${currentDepth + 1}`}</span>
                    <span>{n.level}</span>
                    <span>${n.teamUsd.toLocaleString()}</span>
                    {n.isDirect && <span className="text-[#E0568F]">{t ? '直推' : 'Direct'}</span>}
                  </div>
                  <AddressBlock value={n.address} isDark={isDark} compact />
                </div>
                <span className={`shrink-0 text-xs font-semibold flex items-center gap-0.5 ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>
                  {t ? '进入' : 'Open'} <ArrowRight size={12} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
