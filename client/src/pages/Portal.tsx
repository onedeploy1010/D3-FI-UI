import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { Globe, Copy, Check, X, ArrowRight, Sparkles, Handshake } from 'lucide-react';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { PortalOrbitalDiagram } from '@/components/illustrations/PortalOrbitalDiagram';
import { IllustrationCard } from '@/components/layout/IllustrationCard';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SitePageHeader } from '@/components/layout/SitePageHeader';
import { SiteTopBar } from '@/components/layout/SiteTopBar';
import { GlassButton, GlassCard, GlassChip, GlassIconButton } from '@/components/ui/GlassSurface';
import { WalletGate } from '@/components/wallet/WalletGate';
import { useWallet } from '@/contexts/WalletContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  captureReferralFromUrl,
  clearPendingReferral,
  getPendingReferral,
  isReferralBoundForWallet,
  markReferralSkipped,
  shouldOfferReferralBind,
} from '@/lib/referral';
import { bindReferral, fetchUnionProfile } from '@/lib/unionApi';
import { useProtocolEpoch } from '@/hooks/useProtocolEpoch';

type Lang = 'zh' | 'en';

export default function Portal() {
  const [lang, setLang] = useState<Lang>('zh');
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [sponsorWallet, setSponsorWallet] = useState<string | null>(null);
  const [hasActiveReferral, setHasActiveReferral] = useState(false);
  const [binding, setBinding] = useState(false);
  const [bindError, setBindError] = useState<string | null>(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { wallet } = useWallet();
  const { epoch: protocolEpoch, isLoading: protocolLoading } = useProtocolEpoch(lang);

  useEffect(() => {
    captureReferralFromUrl();
    setSponsorWallet(getPendingReferral());
  }, []);

  useEffect(() => {
    if (!wallet) {
      setHasActiveReferral(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await fetchUnionProfile(wallet);
        if (cancelled) return;
        setHasActiveReferral(isReferralBoundForWallet(wallet, data.referrals));
      } catch {
        if (!cancelled) setHasActiveReferral(isReferralBoundForWallet(wallet, undefined));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet]);

  useEffect(() => {
    const sponsor = sponsorWallet ?? getPendingReferral();
    setShowReferral(shouldOfferReferralBind(wallet, sponsor, hasActiveReferral));
  }, [wallet, sponsorWallet, hasActiveReferral]);

  const handleCopy = () => {
    if (!wallet) return;
    void navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeReferralModal = useCallback(() => {
    setShowReferral(false);
    setBindError(null);
  }, []);

  const handleSkipReferral = useCallback(() => {
    const sponsor = sponsorWallet ?? getPendingReferral();
    if (wallet && sponsor) markReferralSkipped(wallet, sponsor);
    clearPendingReferral();
    closeReferralModal();
  }, [wallet, sponsorWallet, closeReferralModal]);

  const handleConfirmReferral = useCallback(async () => {
    const sponsor = sponsorWallet ?? getPendingReferral();
    if (!wallet || !sponsor) return;

    setBinding(true);
    setBindError(null);
    try {
      await bindReferral(wallet, sponsor, 'partner');
      setHasActiveReferral(true);
      clearPendingReferral();
      closeReferralModal();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('already bound') || msg.includes('409')) {
        setHasActiveReferral(true);
        clearPendingReferral();
        closeReferralModal();
        return;
      }
      setBindError(msg);
    } finally {
      setBinding(false);
    }
  }, [wallet, sponsorWallet, closeReferralModal]);

  const referrerAddress = sponsorWallet ?? getPendingReferral() ?? '';

  const t = lang === 'zh' ? {
    welcome: '协议门户',
    subtitle: '选择你要进入的应用',
    wallet: '钱包地址',
    level: '身份等级',
    status: '已连接',
    ai: { title: 'D³-AI 分析站', desc: 'AI 驱动的链上数据分析与智能决策辅助', badge: '已上线', cta: '进入分析站' },
    fi: { title: 'D³-Fi 贿赂金融', desc: '资产管理 · 投票治理 · 贿赂市场 · 分红收益', badge: '核心应用', cta: '进入应用' },
    union: { title: '股东联盟', desc: '5,000 USDT 入股 · 三路收益 · USD3 / D3', badge: '节点站点', cta: '进入联盟' },
    partner: { title: '合伙人计划', desc: '推荐绑定 · 众筹质押 · 反贿 sD3', badge: '新', cta: '进入' },
    announcements: '协议公告',
    epoch: '当前 Epoch',
    bribePool: '贿赂池新增',
    emission: '预计月排放',
    countdown: '结算倒计时',
    referral: { title: '推荐关系绑定', desc: '检测到推荐链接。确认后，推荐关系将写入数据库并与您的钱包绑定。', from: '推荐人地址', confirm: '确认绑定', skip: '暂时跳过', warning: '绑定后不可更改，请仔细核对下方推荐人地址是否正确。' },
    diagramCaption: 'D³ 协议应用枢纽',
  } : {
    welcome: 'Protocol Portal',
    subtitle: 'Choose your application',
    wallet: 'Wallet',
    level: 'Level',
    status: 'Connected',
    ai: { title: 'D³-AI Analytics', desc: 'AI-powered on-chain data analysis and smart decision support', badge: 'Live', cta: 'Enter Analytics' },
    fi: { title: 'D³-Fi Protocol', desc: 'Assets · Governance · Bribe Market · Dividends', badge: 'Core App', cta: 'Enter App' },
    union: { title: 'Shareholder Alliance', desc: '5,000 USDT join · performance dividends · USD3 referral', badge: 'Node App', cta: 'Enter Alliance' },
    partner: { title: 'Partner Program', desc: 'Referral · Crowdfund · sD3', badge: 'New', cta: 'Enter' },
    announcements: 'Protocol Updates',
    epoch: 'Current Epoch',
    bribePool: 'Bribe Pool Added',
    emission: 'Monthly Emission',
    countdown: 'Settlement In',
    referral: { title: 'Referral Binding', desc: 'A referral link was detected. Confirm to save the relationship to the database and bind it to your wallet.', from: 'Referrer Address', confirm: 'Confirm Binding', skip: 'Skip for Now', warning: 'Binding is irreversible. Please verify the referrer address below.' },
    diagramCaption: 'D³ Protocol App Hub',
  };

  return (
    <WalletGate lang={lang}>
    <div className={`min-h-screen flex flex-col antialiased transition-colors duration-300 ${isDark ? 'bg-dark-gradient text-[#F5F0EB]' : 'bg-light-gradient text-foreground'}`}>
      <SiteTopBar
        lang={lang}
        onLangToggle={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        logoTo="/"
        logoSize={48}
        isDark={isDark}
        onDisconnect={() => navigate('/')}
      />

      <div className="page-px py-5 sm:py-8 max-w-md mx-auto md:max-w-2xl flex-1 w-full space-y-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <SitePageHeader variant="content" title={t.welcome} subtitle={t.subtitle} className="mb-1" />
        </motion.div>

        {/* Wallet — above diagram */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <GlassCard variant="accent" className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`text-[10px] font-medium ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{t.wallet}</div>
              <GlassChip className="!py-1 !px-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-medium">{t.status}</span>
              </GlassChip>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <div className={`font-mono text-[11px] sm:text-xs address-full min-w-0 flex-1 ${isDark ? 'text-white' : 'text-[#160510]'}`}>{wallet ?? '—'}</div>
              <GlassIconButton onClick={handleCopy} aria-label="Copy address">
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className={isDark ? 'text-white/40' : 'text-[#160510]/40'} />}
              </GlassIconButton>
            </div>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10">
              <div className={`text-[10px] font-medium ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>{t.level}</div>
              <div className="text-[10px] font-bold text-[#E0568F]">Diamond · Lv.5</div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Orbital diagram */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
        >
          <IllustrationCard isDark={isDark} caption={t.diagramCaption} className="min-h-[240px] sm:min-h-[280px] md:aspect-[4/3]">
            <PortalOrbitalDiagram lang={lang} isDark={isDark} />
          </IllustrationCard>
        </motion.div>

        {/* App Entry Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <GlassCard variant="default" onClick={() => navigate('/ai/market')} className="p-5 h-full group cursor-pointer">
              <div className="absolute inset-0 premium-shimmer opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-3">
                  <div className="ios-glass-inset w-10 h-10 flex items-center justify-center">
                    <Sparkles size={18} className="text-[#E0568F]" />
                  </div>
                  <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-emerald-400 !bg-emerald-500/10 !border-emerald-500/15">
                    {t.ai.badge}
                  </GlassChip>
                </div>
                <h3 className="site-card-title mb-1">{t.ai.title}</h3>
                <p className={`text-xs mb-4 text-pretty-wrap leading-relaxed ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{t.ai.desc}</p>
                <span className={`text-xs font-semibold inline-flex items-center gap-1 ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>
                  {t.ai.cta} <ArrowRight size={12} />
                </span>
              </div>
            </GlassCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
            <GlassCard variant="default" onClick={() => navigate('/partner')} className="p-5 h-full group cursor-pointer">
              <div className="absolute inset-0 premium-shimmer opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-3">
                  <div className="ios-glass-inset w-10 h-10 flex items-center justify-center">
                    <Handshake size={18} className="text-[#E0568F]" />
                  </div>
                  <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-violet-400 !bg-violet-500/10 !border-violet-500/15">
                    {t.partner.badge}
                  </GlassChip>
                </div>
                <h3 className="site-card-title mb-1">{t.partner.title}</h3>
                <p className={`text-xs mb-4 text-pretty-wrap leading-relaxed ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{t.partner.desc}</p>
                <span className={`text-xs font-semibold inline-flex items-center gap-1 ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>
                  {t.partner.cta} <ArrowRight size={12} />
                </span>
              </div>
            </GlassCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
            <GlassCard variant="highlight" onClick={() => navigate('/d3fi')} className="p-5 h-full group">
              <div className="absolute inset-0 premium-shimmer opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-3">
                  <div className="ios-glass-inset w-10 h-10 flex items-center justify-center">
                    <Globe size={18} className={isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'} />
                  </div>
                  <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold" style={{ color: '#B23A6E' }}>
                    {t.fi.badge}
                  </GlassChip>
                </div>
                <h3 className="site-card-title mb-1">{t.fi.title}</h3>
                <p className={`text-xs mb-4 text-pretty-wrap leading-relaxed ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{t.fi.desc}</p>
                <span className={`text-xs font-semibold inline-flex items-center gap-1 ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>
                  {t.fi.cta} <ArrowRight size={12} />
                </span>
              </div>
            </GlassCard>
          </motion.div>
        </div>

        {/* Announcements */}
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.4 }}>
          <GlassCard className="p-5">
            <h3 className="site-section-title mb-4">{t.announcements}</h3>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {[
                { label: t.epoch, value: protocolLoading ? '…' : (protocolEpoch?.label ?? '—') },
                { label: t.bribePool, value: protocolLoading ? '…' : (protocolEpoch?.bribePoolAdded ?? '—') },
                { label: t.emission, value: protocolLoading ? '…' : (protocolEpoch?.monthlyEmission ?? '—') },
                { label: t.countdown, value: protocolLoading ? '…' : (protocolEpoch?.countdown ?? '—') },
              ].map((item, i) => (
                <GlassChip key={i} className="!p-2.5 sm:!p-3">
                  <div className="site-stat-label mb-1">{item.label}</div>
                  <div className="site-stat-value-sm site-stat-value-accent">{item.value}</div>
                </GlassChip>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      </div>

      <SiteFooter lang={lang} variant="compact" showCta={false} />

      {/* Referral Binding Modal — only when ?ref= present and not yet bound */}
      <AnimatePresence>
        {showReferral && referrerAddress && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
            onClick={handleSkipReferral}
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="ios-glass-card w-full max-w-md rounded-3xl p-6 relative pb-[max(1.5rem,env(safe-area-inset-bottom))]"
              onClick={e => e.stopPropagation()}
            >
              <span className="ios-glass-sheen pointer-events-none" aria-hidden />
              <GlassIconButton onClick={handleSkipReferral} className="absolute top-4 right-4 z-10">
                <X size={16} className={isDark ? 'text-white/40' : 'text-[#160510]/40'} />
              </GlassIconButton>

              <h3 className="site-content-title mb-2 text-balance-wrap">{t.referral.title}</h3>
              <p className={`text-xs mb-5 text-pretty-wrap ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{t.referral.desc}</p>

              <div className="mb-4">
                <AddressBlock label={t.referral.from} value={referrerAddress} isDark={isDark} />
              </div>

              <div className={`ios-glass-inset text-[11px] mb-5 px-3 py-2.5 text-pretty-wrap ${isDark ? 'text-[#E0568F]/75' : 'text-[#8A2B57]/75'}`}>
                ⚠️ {t.referral.warning}
              </div>

              {bindError && <p className="text-xs text-red-500 mb-3">{bindError}</p>}

              <div className="flex gap-3 relative z-10">
                <GlassButton variant="secondary" onClick={handleSkipReferral} className="flex-1 !py-3 !text-xs" disabled={binding}>
                  {t.referral.skip}
                </GlassButton>
                <GlassButton variant="primary" onClick={() => void handleConfirmReferral()} className="flex-1 !py-3 !text-xs" disabled={binding}>
                  {binding ? (lang === 'zh' ? '绑定中…' : 'Binding…') : t.referral.confirm}
                </GlassButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </WalletGate>
  );
}
