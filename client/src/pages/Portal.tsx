import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { Globe, Copy, Check, ArrowRight, Sparkles, Handshake } from 'lucide-react';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { PortalOrbitalDiagram } from '@/components/illustrations/PortalOrbitalDiagram';
import { IllustrationCard } from '@/components/layout/IllustrationCard';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SitePageHeader } from '@/components/layout/SitePageHeader';
import { SiteTopBar } from '@/components/layout/SiteTopBar';
import { GlassCard, GlassChip, GlassIconButton } from '@/components/ui/GlassSurface';
import { WalletGate } from '@/components/wallet/WalletGate';
import { useWallet } from '@/contexts/wallet-context';
import { useTheme } from '@/contexts/ThemeContext';
import { captureReferralFromUrl } from '@/lib/referral';
import { buildReferralLink } from '@/lib/referral';
import { useProtocolEpoch } from '@/hooks/useProtocolEpoch';

type Lang = 'zh' | 'en';

export default function Portal() {
  const [lang, setLang] = useState<Lang>('zh');
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { wallet } = useWallet();
  const { epoch: protocolEpoch, isLoading: protocolLoading } = useProtocolEpoch(lang);
  const referralLink = buildReferralLink(wallet);

  useEffect(() => {
    captureReferralFromUrl();
  }, []);

  const handleCopy = () => {
    if (!wallet) return;
    void navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const t = lang === 'zh' ? {
    welcome: '协议门户',
    subtitle: '选择你要进入的应用',
    wallet: '钱包地址',
    referralLink: '我的推荐链接',
    referralHint: '分享此链接，对方连接钱包并绑定后将成为您的直推下线。',
    level: '身份等级',
    status: '已连接',
    ai: { title: 'D³-AI 分析站', desc: 'AI 驱动的链上数据分析与智能决策辅助', badge: '已上线', cta: '进入分析站' },
    fi: {
      title: 'D³-Fi 贿赂金融',
      desc: '资产管理 · 投票治理 · 贿赂市场 · 分红收益',
      bribeMarket: '贿赂市场',
      badgeLive: '已上线',
      badgeOffline: '未上线',
      badgeDemo: 'Demo数据',
      cta: '进入应用',
    },
    union: { title: '股东联盟', desc: '5,000 USDT 入股 · 三路收益 · USD3 / D3', badge: '节点站点', cta: '进入联盟' },
    partner: { title: '合伙人计划', desc: '推荐绑定 · 众筹质押 · UD3', badge: '已上线', cta: '进入' },
    announcements: '协议公告',
    protocolPublic: '协议公共',
    epoch: '当前 Epoch',
    bribePool: '贿赂池新增',
    emission: '预计月排放',
    countdown: '结算倒计时',
    diagramCaption: 'D³ 协议应用枢纽',
  } : {
    welcome: 'Protocol Portal',
    subtitle: 'Choose your application',
    wallet: 'Wallet',
    referralLink: 'My Referral Link',
    referralHint: 'Share this link. After they connect and bind, they join as your direct downline.',
    level: 'Level',
    status: 'Connected',
    ai: { title: 'D³-AI Analytics', desc: 'AI-powered on-chain data analysis and smart decision support', badge: 'Live', cta: 'Enter Analytics' },
    fi: {
      title: 'D³-Fi Protocol',
      desc: 'Assets · Governance · Bribe Market · Dividends',
      bribeMarket: 'Bribe Market',
      badgeLive: 'Live',
      badgeOffline: 'Not live',
      badgeDemo: 'Demo data',
      cta: 'Enter App',
    },
    union: { title: 'Shareholder Alliance', desc: '5,000 USDT join · performance dividends · USD3 referral', badge: 'Node App', cta: 'Enter Alliance' },
    partner: { title: 'Partner Program', desc: 'Referral · Crowdfund · UD3', badge: 'Live', cta: 'Enter' },
    announcements: 'Protocol Updates',
    protocolPublic: 'Protocol Public',
    epoch: 'Current Epoch',
    bribePool: 'Bribe Pool Added',
    emission: 'Monthly Emission',
    countdown: 'Settlement In',
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
              <div
                className={`font-mono text-[9px] sm:text-[10px] leading-none tracking-tight min-w-0 flex-1 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch] ${
                  isDark ? 'text-white' : 'text-[#160510]'
                }`}
                title={wallet ?? undefined}
              >
                {wallet ?? '—'}
              </div>
              <GlassIconButton onClick={handleCopy} aria-label="Copy address" className="shrink-0">
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className={isDark ? 'text-white/40' : 'text-[#160510]/40'} />}
              </GlassIconButton>
            </div>

            <div className="mt-4 pt-4 border-t border-white/10">
              <div className={`text-[10px] font-medium mb-2 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
                {t.referralLink}
              </div>
              <AddressBlock value={referralLink} isDark={isDark} compact />
              <p className={`text-[10px] mt-2 leading-relaxed ${isDark ? 'text-white/35' : 'text-[#160510]/45'}`}>
                {t.referralHint}
              </p>
            </div>

            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10">
              <div className={`text-[10px] font-medium ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>{t.level}</div>
              <div className="text-[10px] font-bold text-[#E0568F]">Diamond · Lv.5</div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
        >
          <IllustrationCard isDark={isDark} caption={t.diagramCaption} className="min-h-[240px] sm:min-h-[280px] md:aspect-[4/3]">
            <PortalOrbitalDiagram lang={lang} isDark={isDark} />
          </IllustrationCard>
        </motion.div>

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
                  <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-emerald-400 !bg-emerald-500/10 !border-emerald-500/15">
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
                  <div className="flex flex-col items-end gap-1">
                    <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-amber-500/90 !bg-amber-500/10 !border-amber-500/15">
                      {t.fi.badgeOffline}
                    </GlassChip>
                    <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-sky-400 !bg-sky-500/10 !border-sky-500/15">
                      {t.fi.badgeDemo}
                    </GlassChip>
                  </div>
                </div>
                <h3 className="site-card-title mb-1">{t.fi.title}</h3>
                <p className={`text-xs mb-1 text-pretty-wrap leading-relaxed ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{t.fi.desc}</p>
                <p className={`text-[10px] mb-4 font-medium ${isDark ? 'text-white/30' : 'text-[#160510]/40'}`}>
                  {t.fi.bribeMarket} · {t.fi.badgeOffline} · {t.fi.badgeDemo}
                </p>
                <span className={`text-xs font-semibold inline-flex items-center gap-1 ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>
                  {t.fi.cta} <ArrowRight size={12} />
                </span>
              </div>
            </GlassCard>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.4 }}>
          <GlassCard className="p-5">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <h3 className="site-section-title">{t.announcements}</h3>
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-white/35' : 'text-[#160510]/45'}`}>{t.protocolPublic}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-amber-500/90 !bg-amber-500/10 !border-amber-500/15">
                  {t.fi.badgeOffline}
                </GlassChip>
                <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-sky-400 !bg-sky-500/10 !border-sky-500/15">
                  {t.fi.badgeDemo}
                </GlassChip>
              </div>
            </div>
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
    </div>
    </WalletGate>
  );
}
