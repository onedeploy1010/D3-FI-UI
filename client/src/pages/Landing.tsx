import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { Menu, X, ChevronDown, Shield, Zap, Users, Lock, TrendingUp, Globe, ArrowRight, ExternalLink, Flame, Eye, Ban, Activity } from 'lucide-react';
import { D3Logo } from '@/components/D3Logo';
import { BribeMechanismDiagram } from '@/components/illustrations/BribeMechanismDiagram';
import { BrandMotif } from '@/components/illustrations/BrandMotif';
import { SecurityShieldDiagram } from '@/components/illustrations/SecurityShieldDiagram';
import { IllustrationCard } from '@/components/layout/IllustrationCard';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { useTheme } from '@/contexts/ThemeContext';
import { useProtocolEpoch } from '@/hooks/useProtocolEpoch';

type Lang = 'zh' | 'en';

const content = {
  zh: {
    nav: { protocol: '协议', token: '代币', roadmap: '路线图', docs: '文档', connect: '连接钱包' },
    hero: {
      badge: 'BSC 2026 · 去中心化贿赂金融协议',
      title: '真实收益',
      titleAccent: '链上可查',
      subtitle: '将 DeFi 治理中的灰色激励阳光化\n每一分收益都有来源，每一笔分红都可追溯',
      cta1: '连接钱包',
      cta2: '阅读白皮书',
    },
    stats: [
      { value: '$2.4M', label: '贿赂池 TVL', change: '+12.3%' },
      { value: '420K', label: 'D3 流通量', change: '' },
      { value: '12,450', label: 'DT 持有者', change: '+340' },
      { value: '$1.2M', label: '累计分红', change: '+$48K' },
    ],
    why: {
      title: '为什么是贿赂金融？',
      subtitle: '将 DeFi 治理中的灰色地带阳光化，让项目方、投票者、协议三方共赢',
      imageCaption: 'D³ 贿赂金融机制',
      items: [
        { icon: 'zap', title: '项目方付费', desc: '项目方向 Gauge 投放贿赂，争取 D3 排放分配，获得流动性支持' },
        { icon: 'users', title: '投票者分享', desc: '锁仓 veD3 参与投票，按权重分享贿赂池收益，年化可观' },
        { icon: 'lock', title: '智能合约执行', desc: '链上自动结算，无需信任第三方，所有流程透明可验证' },
      ],
    },
    entry: {
      title: '三种入场方式',
      subtitle: '选择最适合你的策略，灵活入场',
      methods: [
        { name: '现货 Swap', desc: '直接购买 D3 代币', tag: '即时', features: ['零滑点 AMM', '即时到账', '无锁仓限制'], color: '#E0568F' },
        { name: 'LP 债券', desc: '提供流动性获得折扣 D3', tag: '折扣', features: ['5-15% 折扣', '线性释放', '双重收益'], color: '#B23A6E' },
        { name: '销毁债券', desc: '销毁 DT 获得 D3', tag: '高级', features: ['最大折扣', '通缩机制', '长期价值'], color: '#8A2B57' },
      ],
    },
    guardians: {
      title: '六重价值守护',
      subtitle: '从代码到治理，全方位保护协议价值与用户资产',
      imageCaption: 'D³ 安全防护体系',
      items: [
        { icon: 'shield', name: '入场门控', desc: '智能准入', detail: 'KYC + 白名单' },
        { icon: 'lock', name: '锁仓封印', desc: '时间锁定', detail: 'veD3 机制' },
        { icon: 'flame', name: '通缩燃烧', desc: '持续销毁', detail: '每笔交易' },
        { icon: 'activity', name: '频率限制', desc: '防闪电贷', detail: '冷却期' },
        { icon: 'eye', name: '链上透明', desc: '全程可查', detail: '实时审计' },
        { icon: 'ban', name: '紧急熔断', desc: '极端保护', detail: '多签触发' },
      ],
    },
    roadmap: {
      title: '发展路线图',
      phases: [
        { phase: 'Phase 1', name: '协议启动', desc: '核心合约部署 · 代币发行 · 初始流动性', status: 'done' },
        { phase: 'Phase 2', name: '生态扩展', desc: '贿赂市场上线 · 投票治理 · 合作伙伴接入', status: 'active' },
        { phase: 'Phase 3', name: '全球化', desc: '多链部署 · RWA 集成 · 机构合作', status: 'upcoming' },
        { phase: 'Phase 4', name: '去中心化治理', desc: '完全社区治理 · DAO 转型 · 协议自治', status: 'upcoming' },
      ],
    },
    faq: {
      title: '常见问题',
      items: [
        { q: '什么是贿赂金融？', a: '贿赂金融是将 DeFi 治理中的灰色激励机制阳光化、合规化的创新模式。项目方通过公开透明的方式向投票者提供激励，换取流动性支持。' },
        { q: 'D3 代币有什么用途？', a: 'D3 是协议的核心治理代币，持有者可以锁仓获得 veD3 参与投票、获取贿赂收益分成、享受协议分红，同时具有通缩属性。' },
        { q: '如何参与分红？', a: '持有 DT（分红代币）即可自动参与每期分红。分红来源包括协议手续费、贿赂池溢出、合作收入等多个渠道。' },
        { q: '安全性如何保障？', a: '协议采用六重安全机制：入场门控、锁仓封印、通缩燃烧、频率限制、链上透明、紧急熔断，全方位保护用户资产。' },
      ],
    },
    footer: {
      resources: '资源',
      community: '社区',
      legal: '法律',
      links: { whitepaper: '白皮书', docs: '开发文档', audit: '审计报告', github: 'GitHub' },
      social: { twitter: 'Twitter', telegram: 'Telegram', discord: 'Discord', medium: 'Medium' },
      legalLinks: { terms: '服务条款', privacy: '隐私政策', disclaimer: '免责声明' },
    },
  },
  en: {
    nav: { protocol: 'Protocol', token: 'Token', roadmap: 'Roadmap', docs: 'Docs', connect: 'Connect Wallet' },
    hero: {
      badge: 'BSC 2026 · Decentralized Bribe Finance Protocol',
      title: 'Real Yield',
      titleAccent: 'On-Chain Verified',
      subtitle: 'Bringing transparency to DeFi governance incentives\nEvery yield has a source, every dividend is traceable',
      cta1: 'Connect Wallet',
      cta2: 'Read Whitepaper',
    },
    stats: [
      { value: '$2.4M', label: 'Bribe Pool TVL', change: '+12.3%' },
      { value: '420K', label: 'D3 Circulating', change: '' },
      { value: '12,450', label: 'DT Holders', change: '+340' },
      { value: '$1.2M', label: 'Total Dividends', change: '+$48K' },
    ],
    why: {
      title: 'Why Bribe Finance?',
      subtitle: 'Bringing transparency to the grey areas of DeFi governance — a win-win for projects, voters, and protocols',
      imageCaption: 'D³ Bribe Finance Mechanism',
      items: [
        { icon: 'zap', title: 'Projects Pay', desc: 'Projects deposit bribes to Gauge pools, competing for D3 emission allocation and liquidity support' },
        { icon: 'users', title: 'Voters Earn', desc: 'Lock veD3 to vote, share bribe pool rewards proportionally with attractive APY' },
        { icon: 'lock', title: 'Smart Contract Execution', desc: 'Automated on-chain settlement, trustless and fully transparent verification' },
      ],
    },
    entry: {
      title: 'Three Entry Methods',
      subtitle: 'Choose the strategy that suits you best',
      methods: [
        { name: 'Spot Swap', desc: 'Buy D3 tokens directly', tag: 'Instant', features: ['Zero-slippage AMM', 'Instant settlement', 'No lock-up'], color: '#E0568F' },
        { name: 'LP Bond', desc: 'Provide liquidity for discounted D3', tag: 'Discount', features: ['5-15% discount', 'Linear vesting', 'Dual rewards'], color: '#B23A6E' },
        { name: 'Burn Bond', desc: 'Burn DT to acquire D3', tag: 'Advanced', features: ['Maximum discount', 'Deflationary', 'Long-term value'], color: '#8A2B57' },
      ],
    },
    guardians: {
      title: 'Six Value Guardians',
      subtitle: 'From code to governance, comprehensive protection for protocol value and user assets',
      imageCaption: 'D³ Security System',
      items: [
        { icon: 'shield', name: 'Entry Gate', desc: 'Smart Access', detail: 'KYC + Whitelist' },
        { icon: 'lock', name: 'Lock Seal', desc: 'Time Lock', detail: 'veD3 Mechanism' },
        { icon: 'flame', name: 'Burn Engine', desc: 'Continuous Burn', detail: 'Per Transaction' },
        { icon: 'activity', name: 'Rate Limit', desc: 'Anti-Flash', detail: 'Cooldown Period' },
        { icon: 'eye', name: 'On-Chain Audit', desc: 'Full Transparency', detail: 'Real-time Audit' },
        { icon: 'ban', name: 'Circuit Breaker', desc: 'Emergency Stop', detail: 'Multi-sig Trigger' },
      ],
    },
    roadmap: {
      title: 'Roadmap',
      phases: [
        { phase: 'Phase 1', name: 'Protocol Launch', desc: 'Core contracts · Token issuance · Initial liquidity', status: 'done' },
        { phase: 'Phase 2', name: 'Ecosystem Growth', desc: 'Bribe market · Governance voting · Partner integration', status: 'active' },
        { phase: 'Phase 3', name: 'Global Expansion', desc: 'Multi-chain · RWA integration · Institutional partnerships', status: 'upcoming' },
        { phase: 'Phase 4', name: 'Full Decentralization', desc: 'Community governance · DAO transition · Protocol autonomy', status: 'upcoming' },
      ],
    },
    faq: {
      title: 'FAQ',
      items: [
        { q: 'What is Bribe Finance?', a: 'Bribe Finance is an innovative model that brings transparency and compliance to the grey incentive mechanisms in DeFi governance. Projects openly incentivize voters in exchange for liquidity support.' },
        { q: 'What is D3 token used for?', a: 'D3 is the core governance token. Holders can lock for veD3 to vote, earn bribe rewards, receive protocol dividends, and benefit from deflationary mechanics.' },
        { q: 'How to earn dividends?', a: 'Hold DT (Dividend Token) to automatically participate in each epoch\'s dividend distribution from protocol fees, bribe pool overflow, and partnership revenue.' },
        { q: 'How is security ensured?', a: 'The protocol employs six security mechanisms: Entry Gate, Lock Seal, Burn Engine, Rate Limit, On-Chain Audit, and Circuit Breaker for comprehensive asset protection.' },
      ],
    },
    footer: {
      resources: 'Resources',
      community: 'Community',
      legal: 'Legal',
      links: { whitepaper: 'Whitepaper', docs: 'Documentation', audit: 'Audit Report', github: 'GitHub' },
      social: { twitter: 'Twitter', telegram: 'Telegram', discord: 'Discord', medium: 'Medium' },
      legalLinks: { terms: 'Terms of Service', privacy: 'Privacy Policy', disclaimer: 'Disclaimer' },
    },
  },
};

// D3 Brand Motif - imported from @/components/illustrations/BrandMotif

function GuardianIcon({ type }: { type: string }) {
  const cls = "w-5 h-5";
  switch (type) {
    case 'shield': return <Shield className={cls} />;
    case 'lock': return <Lock className={cls} />;
    case 'flame': return <Flame className={cls} />;
    case 'activity': return <Activity className={cls} />;
    case 'eye': return <Eye className={cls} />;
    case 'ban': return <Ban className={cls} />;
    default: return <Shield className={cls} />;
  }
}

export default function Landing() {
  const [lang, setLang] = useState<Lang>('zh');
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [, navigate] = useLocation();
  const { theme } = useTheme();
  const { epoch: protocolEpoch, isLoading: protocolLoading } = useProtocolEpoch(lang);
  const t = content[lang];
  const isDark = theme === 'dark';
  const stats = useMemo(
    () =>
      t.stats.map((stat, i) =>
        i === 0
          ? {
              ...stat,
              value: protocolLoading ? '…' : (protocolEpoch?.bribePoolTvl ?? '—'),
            }
          : stat,
      ),
    [t.stats, protocolEpoch?.bribePoolTvl, protocolLoading],
  );

  return (
    <div className={`min-h-screen overflow-x-hidden transition-colors duration-300 ${
      isDark ? 'bg-dark-gradient text-[#F5F0EB]' : 'bg-light-gradient text-[#160510]'
    }`}>
      {/* ===== NAVBAR ===== */}
      <nav className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-2xl border-b transition-colors duration-300 ${
        isDark ? 'bg-dark-surface border-[#E0568F]/[0.06]' : 'bg-light-surface border-[#B23A6E]/[0.08]'
      }`}>
        <div className="flex items-center justify-between page-px py-3 sm:py-3.5 max-w-6xl mx-auto gap-2">
          <D3Logo size={38} showText to="/" className="min-w-0 shrink" textClassName={`text-base sm:text-lg ${isDark ? 'text-white' : 'text-[#8A2B57]'}`} />
          
          {/* Desktop nav */}
          <div className={`hidden md:flex items-center gap-8 text-sm font-medium ${
            isDark ? 'text-white/50' : 'text-[#160510]/50'
          }`}>
            <a href="#protocol" className={`transition-colors ${isDark ? 'hover:text-[#E0568F]' : 'hover:text-[#8A2B57]'}`}>{t.nav.protocol}</a>
            <a href="#token" className={`transition-colors ${isDark ? 'hover:text-[#E0568F]' : 'hover:text-[#8A2B57]'}`}>{t.nav.token}</a>
            <a href="#roadmap" className={`transition-colors ${isDark ? 'hover:text-[#E0568F]' : 'hover:text-[#8A2B57]'}`}>{t.nav.roadmap}</a>
            <a href="#docs" className={`transition-colors ${isDark ? 'hover:text-[#E0568F]' : 'hover:text-[#8A2B57]'}`}>{t.nav.docs}</a>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition ${
                isDark ? 'bg-[#E0568F]/[0.06] text-[#F5F0EB]/60 hover:bg-[#E0568F]/[0.10]' : 'bg-[#B23A6E]/[0.05] text-[#8A2B57]/60 hover:bg-[#B23A6E]/[0.08]'
              }`}
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            <button
              onClick={() => navigate('/portal')}
              className="hidden md:block text-sm px-5 py-2.5 rounded-xl font-semibold text-white transition-all hover:shadow-lg hover:shadow-[#8A2B57]/20 active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #8A2B57, #5E1A3C)' }}
            >
              {t.nav.connect}
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} className={`md:hidden p-1.5 rounded-lg ${isDark ? 'hover:bg-[#E0568F]/[0.06]' : 'hover:bg-[#B23A6E]/[0.06]'}`}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`md:hidden overflow-hidden border-t ${isDark ? 'border-[#E0568F]/[0.06]' : 'border-[#B23A6E]/[0.08]'}`}
            >
              <div className="flex flex-col gap-1 page-px py-4">
                <a href="#protocol" onClick={() => setMenuOpen(false)} className={`py-2.5 text-sm font-medium ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>{t.nav.protocol}</a>
                <a href="#token" onClick={() => setMenuOpen(false)} className={`py-2.5 text-sm font-medium ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>{t.nav.token}</a>
                <a href="#roadmap" onClick={() => setMenuOpen(false)} className={`py-2.5 text-sm font-medium ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>{t.nav.roadmap}</a>
                <a href="#docs" onClick={() => setMenuOpen(false)} className={`py-2.5 text-sm font-medium ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>{t.nav.docs}</a>
                <button
                  onClick={() => navigate('/portal')}
                  className="w-full py-3.5 rounded-xl font-semibold text-white text-center mt-2 active:scale-[0.97] transition-transform"
                  style={{ background: 'linear-gradient(135deg, #8A2B57, #5E1A3C)' }}
                >
                  {t.nav.connect}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ===== HERO ===== */}
      <section className="relative min-h-[100dvh] flex items-center justify-center pt-16">
        {/* Background layers */}
        <div className="absolute inset-0">
          {isDark ? (
            <>
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 25%, rgba(138,43,87,0.28) 0%, transparent 55%)' }} />
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 80% 65%, rgba(178,58,110,0.12) 0%, transparent 50%)' }} />
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 20% 80%, rgba(224,86,143,0.06) 0%, transparent 45%)' }} />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#140D18]" />
              <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(224,86,143,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(224,86,143,0.3) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
            </>
          ) : (
            <>
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 25%, rgba(178,58,110,0.06) 0%, transparent 55%)' }} />
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 80% 70%, rgba(224,86,143,0.08) 0%, transparent 50%)' }} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(237,224,216,0.35) 100%)' }} />
              <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'linear-gradient(rgba(178,58,110,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(178,58,110,0.15) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
            </>
          )}
          {/* Brand motif overlay */}
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] md:w-[500px] h-[320px] md:h-[500px] pointer-events-none ${isDark ? 'opacity-30' : 'opacity-20'}`}>
            <BrandMotif className="w-full h-full animate-[spin_60s_linear_infinite]" />
          </div>
        </div>
        
        {/* Content */}
        <div className="relative z-10 text-center px-6 max-w-lg mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full backdrop-blur-md border text-[11px] sm:text-xs font-medium mb-6 sm:mb-8 max-w-[calc(100vw-3rem)] ${
              isDark ? 'border-[#E0568F]/20 bg-[#E0568F]/[0.08]' : 'border-[#B23A6E]/12 bg-[#B23A6E]/[0.04]'
            }`}>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className={`text-center leading-snug ${isDark ? 'text-[#E0568F]/80' : 'text-[#8A2B57]/70'}`}>{t.hero.badge}</span>
            </div>
            
            <h1 className="text-[2rem] sm:text-[2.5rem] md:text-7xl font-bold leading-[1.1] mb-5 font-heading">
              <span className={isDark ? 'text-white' : 'text-[#8A2B57]'}>{t.hero.title}</span>
              <br />
              <span className="bg-gradient-to-r from-[#E0568F] via-[#E8D5A3] to-[#E0568F] bg-clip-text text-transparent">{t.hero.titleAccent}</span>
            </h1>
            
            <p className={`text-sm md:text-base mb-10 leading-relaxed whitespace-pre-line text-pretty-wrap max-w-sm mx-auto ${
              isDark ? 'text-white/50' : 'text-[#160510]/50'
            }`}>
              {t.hero.subtitle}
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate('/portal')}
                className="px-7 py-4 rounded-2xl font-semibold text-white text-sm shadow-xl shadow-[#8A2B57]/30 active:scale-[0.97] transition-all hover:shadow-2xl hover:shadow-[#8A2B57]/40"
                style={{ background: 'linear-gradient(135deg, #8A2B57, #5E1A3C)' }}
              >
                {t.hero.cta1}
              </button>
              <button className={`px-7 py-4 rounded-2xl font-semibold text-sm border active:scale-[0.97] transition-all ${
                isDark ? 'text-white/70 border-white/10 hover:bg-white/[0.04] hover:border-white/20' : 'text-[#8A2B57]/70 border-[#8A2B57]/15 hover:bg-[#8A2B57]/[0.04] hover:border-[#8A2B57]/25'
              }`}>
                {t.hero.cta2}
              </button>
            </div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}>
            <ChevronDown size={18} className={isDark ? 'text-[#E0568F]/40' : 'text-[#8A2B57]/30'} />
          </motion.div>
        </div>
      </section>

      {/* ===== STATS ===== */}
      <section className="py-14 sm:py-16 page-px">
        <div className="max-w-md mx-auto md:max-w-4xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className={`rounded-2xl p-5 relative overflow-hidden group ${
                  isDark ? '' : 'shadow-sm'
                }`}
                style={isDark
                  ? { background: 'linear-gradient(160deg, rgba(138,43,87,0.12), rgba(20,13,24,0.8))', border: '1px solid rgba(224,86,143,0.1)' }
                  : { background: 'linear-gradient(155deg, rgba(178,58,110,0.04), rgba(250,247,244,0.82))', border: '1px solid rgba(178,58,110,0.08)' }
                }
              >
                <div className="absolute -top-4 -right-4 w-16 h-16 opacity-20">
                  <BrandMotif className="w-full h-full" />
                </div>
                <div className="text-2xl md:text-3xl font-bold tracking-tight font-stat" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>{stat.value}</div>
                <div className={`text-[11px] mt-1.5 font-medium ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{stat.label}</div>
                {stat.change && <div className="text-[10px] text-emerald-500 mt-1 font-medium">{stat.change}</div>}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHY BRIBERY ===== */}
      <section id="protocol" className="py-14 sm:py-20 page-px">
        <div className="max-w-md mx-auto md:max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-12">
            <h2 className={`text-2xl md:text-5xl font-bold mb-4 font-stat ${isDark ? 'text-white' : 'text-[#8A2B57]'}`}>{t.why.title}</h2>
            <p className={`text-sm max-w-md text-pretty-wrap ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{t.why.subtitle}</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Bribery mechanism visual - SVG diagram */}
            <IllustrationCard isDark={isDark} caption={t.why.imageCaption}>
              <BribeMechanismDiagram lang={lang} isDark={isDark} />
            </IllustrationCard>

            {/* Items */}
            <div className="flex flex-col gap-4">
              {t.why.items.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15, duration: 0.5 }}
                  className={`rounded-2xl p-5 flex gap-4 items-start group transition-colors ${
                    isDark ? 'hover:border-[#E0568F]/20' : 'hover:border-[#8A2B57]/20'
                  }`}
                  style={isDark
                    ? { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }
                    : { background: 'rgba(138,43,87,0.02)', border: '1px solid rgba(138,43,87,0.06)' }
                  }
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, rgba(138,43,87,0.6), rgba(178,58,110,0.4))' }}>
                    {item.icon === 'zap' && <Zap size={18} className="text-[#E0568F]" />}
                    {item.icon === 'users' && <Users size={18} className="text-[#E0568F]" />}
                    {item.icon === 'lock' && <Lock size={18} className="text-[#E0568F]" />}
                  </div>
                  <div>
                    <h3 className={`font-bold text-sm mb-1.5 ${isDark ? 'text-white' : 'text-[#160510]'}`}>{item.title}</h3>
                    <p className={`text-xs leading-relaxed text-pretty-wrap ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== ENTRY METHODS ===== */}
      <section id="token" className="py-14 sm:py-20 page-px relative">
        <div className={`absolute inset-0 pointer-events-none ${isDark ? 'bg-gradient-to-b from-transparent via-[#8A2B57]/[0.04] to-transparent' : 'bg-gradient-to-b from-transparent via-[#8A2B57]/[0.02] to-transparent'}`} />
        <div className="max-w-md mx-auto md:max-w-5xl relative">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className={`text-2xl md:text-5xl font-bold mb-4 font-stat ${isDark ? 'text-white' : 'text-[#8A2B57]'}`}>{t.entry.title}</h2>
            <p className={`text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{t.entry.subtitle}</p>
          </motion.div>

          <div className="flex flex-col md:grid md:grid-cols-3 gap-4">
            {t.entry.methods.map((method, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                className={`rounded-2xl p-6 relative overflow-hidden group ${isDark ? '' : 'shadow-sm'}`}
                style={isDark
                  ? { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }
                  : { background: 'rgba(138,43,87,0.02)', border: '1px solid rgba(138,43,87,0.08)' }
                }
              >
                <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${method.color}, transparent)` }} />
                <div className="flex items-start justify-between mb-4">
                  <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-[#160510]'}`}>{method.name}</h3>
                  <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold" style={{ background: `${method.color}20`, color: method.color }}>
                    {method.tag}
                  </span>
                </div>
                <p className={`text-xs mb-5 ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{method.desc}</p>
                <div className="flex flex-col gap-2.5 mb-5">
                  {method.features.map((f, j) => (
                    <div key={j} className={`flex items-center gap-2.5 text-xs ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: method.color }} />
                      {f}
                    </div>
                  ))}
                </div>
                <button className={`w-full py-3 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
                  isDark ? 'border-white/8 hover:bg-white/[0.04] group-hover:border-white/15' : 'border-[#8A2B57]/10 hover:bg-[#8A2B57]/[0.04] group-hover:border-[#8A2B57]/20'
                }`}>
                  {lang === 'zh' ? '了解更多' : 'Learn More'} <ArrowRight size={12} />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SIX GUARDIANS ===== */}
      <section className="py-14 sm:py-20 page-px">
        <div className="max-w-md mx-auto md:max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-12">
            <h2 className={`text-2xl md:text-5xl font-bold mb-4 font-stat ${isDark ? 'text-white' : 'text-[#8A2B57]'}`}>{t.guardians.title}</h2>
            <p className={`text-sm max-w-md ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{t.guardians.subtitle}</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 sm:gap-8 items-start">
            <IllustrationCard isDark={isDark} caption={t.guardians.imageCaption} className="min-h-[280px] order-1 md:order-2">
              <SecurityShieldDiagram isDark={isDark} />
            </IllustrationCard>

            <div className="grid grid-cols-2 gap-3 order-2 md:order-1">
              {t.guardians.items.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className={`rounded-2xl p-4 text-center relative overflow-hidden group transition-colors ${
                    isDark ? 'hover:border-[#E0568F]/20' : 'hover:border-[#8A2B57]/20'
                  }`}
                  style={isDark
                    ? { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }
                    : { background: 'rgba(138,43,87,0.02)', border: '1px solid rgba(138,43,87,0.06)' }
                  }
                >
                  <div className="w-9 h-9 rounded-xl mx-auto mb-2.5 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(224,86,143,0.15), rgba(138,43,87,0.2))' }}>
                    <GuardianIcon type={item.icon} />
                  </div>
                  <div className="text-xs font-bold mb-0.5" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>{item.name}</div>
                  <div className={`text-[11px] font-medium ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>{item.desc}</div>
                  <div className={`text-[10px] mt-1 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>{item.detail}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== ROADMAP ===== */}
      <section id="roadmap" className="py-14 sm:py-20 page-px relative">
        <div className={`absolute inset-0 pointer-events-none ${isDark ? 'bg-gradient-to-b from-transparent via-[#E0568F]/[0.02] to-transparent' : 'bg-gradient-to-b from-transparent via-[#8A2B57]/[0.01] to-transparent'}`} />
        <div className="max-w-md mx-auto md:max-w-4xl relative">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className={`text-2xl md:text-5xl font-bold font-stat ${isDark ? 'text-white' : 'text-[#8A2B57]'}`}>{t.roadmap.title}</h2>
          </motion.div>

          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-px" style={{ background: isDark ? 'linear-gradient(180deg, rgba(224,86,143,0.3), rgba(138,43,87,0.3), rgba(255,255,255,0.05))' : 'linear-gradient(180deg, rgba(138,43,87,0.3), rgba(224,86,143,0.3), rgba(138,43,87,0.05))' }} />
            
            <div className="flex flex-col gap-8">
              {t.roadmap.phases.map((phase, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className="relative pl-14"
                >
                  <div className="absolute left-3.5 top-1.5 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                    style={{
                      borderColor: phase.status === 'done' ? '#E0568F' : phase.status === 'active' ? '#B23A6E' : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(138,43,87,0.15)'),
                      background: phase.status === 'done' ? '#E0568F' : phase.status === 'active' ? '#B23A6E' : 'transparent',
                      boxShadow: phase.status === 'active' ? '0 0 12px rgba(178,58,110,0.5)' : 'none',
                    }}
                  >
                    {phase.status === 'done' && <span className={`w-1.5 h-1.5 rounded-full ${isDark ? 'bg-[#140D18]' : 'bg-[#FAF7F4]'}`} />}
                  </div>
                  
                  <div className={`text-[10px] uppercase tracking-widest font-medium mb-1 ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>{phase.phase}</div>
                  <div className="font-bold text-sm mb-0.5" style={{ color: phase.status === 'active' ? '#E0568F' : phase.status === 'done' ? (isDark ? 'white' : '#1A1A1A') : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(26,26,26,0.4)') }}>{phase.name}</div>
                  <div className={`text-[11px] ${isDark ? 'text-white/30' : 'text-[#160510]/40'}`}>{phase.desc}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="docs" className="py-14 sm:py-20 page-px">
        <div className="max-w-md mx-auto md:max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className={`text-2xl md:text-5xl font-bold font-stat ${isDark ? 'text-white' : 'text-[#8A2B57]'}`}>{t.faq.title}</h2>
          </motion.div>

          <div className="flex flex-col gap-3">
            {t.faq.items.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="rounded-2xl overflow-hidden transition-colors"
                style={isDark
                  ? { background: faqOpen === i ? 'rgba(138,43,87,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${faqOpen === i ? 'rgba(224,86,143,0.15)' : 'rgba(255,255,255,0.05)'}` }
                  : { background: faqOpen === i ? 'rgba(138,43,87,0.04)' : 'rgba(138,43,87,0.01)', border: `1px solid ${faqOpen === i ? 'rgba(138,43,87,0.15)' : 'rgba(138,43,87,0.06)'}` }
                }
              >
                <button
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left"
                >
                  <span className={`text-sm font-semibold pr-4 text-pretty-wrap ${isDark ? 'text-white' : 'text-[#160510]'}`}>{item.q}</span>
                  <ChevronDown size={16} className={`shrink-0 transition-transform duration-300 ${faqOpen === i ? 'rotate-180' : ''} ${isDark ? 'text-[#E0568F]/60' : 'text-[#8A2B57]/40'}`} />
                </button>
                <AnimatePresence>
                  {faqOpen === i && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <p className={`px-5 pb-5 text-xs leading-relaxed text-pretty-wrap ${isDark ? 'text-white/45' : 'text-[#160510]/55'}`}>{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter lang={lang} />
    </div>
  );
}
