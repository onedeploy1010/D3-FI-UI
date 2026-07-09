import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  ArrowRight,
  BookOpen,
  FileText,
  Github,
  MessageCircle,
  Send,
  Shield,
  Twitter,
} from 'lucide-react';
import { D3Logo } from '@/components/D3Logo';
import { BrandMotif } from '@/components/illustrations/BrandMotif';
import { useTheme } from '@/contexts/ThemeContext';

type Lang = 'zh' | 'en';

const copy = {
  zh: {
    ctaTitle: '开启链上真实收益之旅',
    ctaSub: '连接钱包，参与贿赂金融协议治理与分红',
    ctaBtn: '进入协议门户',
    tagline: '去中心化 · 数据驱动 · 可验证价值',
    resources: '资源',
    community: '社区',
    legal: '法律',
    links: {
      whitepaper: '白皮书',
      docs: '开发文档',
      audit: '审计报告',
      github: 'GitHub',
    },
    social: { twitter: 'Twitter', telegram: 'Telegram', discord: 'Discord', medium: 'Medium' },
    legalLinks: { terms: '服务条款', privacy: '隐私政策', disclaimer: '免责声明' },
    network: 'BSC Mainnet',
    rights: '© 2026 D³ Finance. All rights reserved.',
  },
  en: {
    ctaTitle: 'Begin Your On-Chain Yield Journey',
    ctaSub: 'Connect wallet to participate in bribe finance governance & dividends',
    ctaBtn: 'Enter Protocol Portal',
    tagline: 'Decentralized · Data-Driven · Verifiable Value',
    resources: 'Resources',
    community: 'Community',
    legal: 'Legal',
    links: {
      whitepaper: 'Whitepaper',
      docs: 'Documentation',
      audit: 'Audit Report',
      github: 'GitHub',
    },
    social: { twitter: 'Twitter', telegram: 'Telegram', discord: 'Discord', medium: 'Medium' },
    legalLinks: { terms: 'Terms of Service', privacy: 'Privacy Policy', disclaimer: 'Disclaimer' },
    network: 'BSC Mainnet',
    rights: '© 2026 D³ Finance. All rights reserved.',
  },
};

type SiteFooterProps = {
  lang?: Lang;
  variant?: 'full' | 'compact';
  showCta?: boolean;
};

type LinkItem = { label: string; icon: typeof BookOpen; href?: string };

function FooterLinkSection({
  title,
  items,
  isDark,
  compact,
}: {
  title: string;
  items: LinkItem[];
  isDark: boolean;
  compact?: boolean;
}) {
  return (
    <div>
      <h4
        className={`font-medium tracking-wide uppercase mb-2 ${
          compact ? 'text-[9px]' : 'text-[10px]'
        } ${isDark ? 'text-[#E0568F]/45' : 'text-[#8A2B57]/40'}`}
      >
        {title}
      </h4>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.label}>
              <a
                href={item.href ?? '#'}
                className={`group inline-flex items-center gap-1.5 py-1 transition-colors ${
                  compact ? 'text-[10px]' : 'text-[11px]'
                } ${
                  isDark
                    ? 'text-white/35 hover:text-[#E0568F]/80'
                    : 'text-[#160510]/40 hover:text-[#8A2B57]/75'
                }`}
              >
                <Icon size={compact ? 10 : 11} className="shrink-0 opacity-50 group-hover:opacity-80" />
                <span>{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SiteFooter({ lang = 'zh', variant = 'full', showCta = true }: SiteFooterProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [, navigate] = useLocation();
  const t = copy[lang];
  const isCompact = variant === 'compact';

  const linkSections: { title: string; items: LinkItem[] }[] = [
    {
      title: t.resources,
      items: [
        { label: t.links.whitepaper, icon: BookOpen },
        { label: t.links.docs, icon: FileText },
        { label: t.links.audit, icon: Shield },
        { label: t.links.github, icon: Github },
      ],
    },
    {
      title: t.community,
      items: [
        { label: t.social.twitter, icon: Twitter },
        { label: t.social.telegram, icon: Send },
        { label: t.social.discord, icon: MessageCircle },
        { label: t.social.medium, icon: FileText },
      ],
    },
    {
      title: t.legal,
      items: [
        { label: t.legalLinks.terms, icon: FileText },
        { label: t.legalLinks.privacy, icon: Shield },
        { label: t.legalLinks.disclaimer, icon: BookOpen },
      ],
    },
  ];

  return (
    <footer className="relative mt-auto overflow-hidden">
      {showCta && !isCompact && (
        <div className="page-px py-8 sm:py-10 md:py-14">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl mx-auto rounded-3xl relative overflow-hidden px-6 py-10 md:px-12 md:py-12"
            style={{
              background: isDark
                ? 'linear-gradient(135deg, rgba(138,43,87,0.45) 0%, rgba(20,13,24,0.9) 50%, rgba(138,43,87,0.25) 100%)'
                : 'linear-gradient(135deg, rgba(138,43,87,0.08) 0%, rgba(250,247,244,0.95) 50%, rgba(224,86,143,0.12) 100%)',
              border: isDark ? '1px solid rgba(224,86,143,0.18)' : '1px solid rgba(178,58,110,0.12)',
              boxShadow: isDark ? '0 32px 64px rgba(0,0,0,0.35)' : '0 24px 48px rgba(178,58,110,0.08)',
            }}
          >
            <div className="absolute -right-16 -top-16 w-56 h-56 opacity-20 pointer-events-none">
              <BrandMotif className="w-full h-full animate-[spin_50s_linear_infinite]" />
            </div>
            <div className="absolute -left-8 -bottom-8 w-40 h-40 opacity-10 pointer-events-none">
              <BrandMotif className="w-full h-full animate-[spin_70s_linear_infinite_reverse]" />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="max-w-md">
                <h3 className={`text-xl md:text-2xl font-bold font-heading mb-2 ${isDark ? 'text-white' : 'text-[#8A2B57]'}`}>
                  {t.ctaTitle}
                </h3>
                <p className={`text-sm leading-relaxed text-pretty-wrap ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>{t.ctaSub}</p>
              </div>
              <button
                onClick={() => navigate('/portal')}
                className="group shrink-0 px-7 py-4 rounded-2xl font-semibold text-white text-sm shadow-xl active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #8A2B57, #5E1A3C)' }}
              >
                {t.ctaBtn}
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <div
        className={`relative border-t ${isDark ? 'border-[#E0568F]/[0.05]' : 'border-[#8A2B57]/[0.05]'}`}
        style={{
          background: isDark ? 'rgba(13,8,16,0.35)' : 'rgba(250,247,244,0.6)',
        }}
      >
        {!isCompact && (
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent 5%, #E0568F 50%, transparent 95%)' }}
          />
        )}

        {!isCompact && (
          <div className={`absolute bottom-0 right-0 w-72 h-72 pointer-events-none ${isDark ? 'opacity-[0.05]' : 'opacity-[0.03]'}`}>
            <BrandMotif className="w-full h-full" />
          </div>
        )}

        <div className={`max-w-5xl mx-auto page-px ${isCompact ? 'py-5 sm:py-6' : 'py-10 sm:py-12 md:py-14'}`}>
          <div className={`grid grid-cols-1 ${isCompact ? 'gap-5' : 'gap-8 md:grid-cols-12 md:items-start md:gap-10'}`}>
            <div className={isCompact ? '' : 'md:col-span-4'}>
              <D3Logo
                size={isCompact ? 28 : 38}
                showText
                to="/"
                textClassName={`${isCompact ? 'text-sm' : 'text-lg'} ${isDark ? 'text-white/90' : 'text-[#8A2B57]/90'}`}
              />
              {!isCompact && (
                <>
                  <p className={`mt-3 text-xs leading-relaxed max-w-xs ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
                    {t.tagline}
                  </p>
                  <div
                    className={`inline-flex items-center gap-1.5 mt-3 px-2 py-1 rounded-full text-[9px] font-medium tracking-wide uppercase ${
                      isDark ? 'text-[#E0568F]/50' : 'text-[#8A2B57]/45'
                    }`}
                  >
                    <span className="w-1 h-1 rounded-full bg-emerald-400/80" />
                    {t.network}
                  </div>
                </>
              )}
            </div>

            <div className={`grid grid-cols-3 gap-4 sm:gap-6 ${isCompact ? '' : 'md:col-span-8'}`}>
              {linkSections.map((section) => (
                <FooterLinkSection
                  key={section.title}
                  title={section.title}
                  items={section.items}
                  isDark={isDark}
                  compact={isCompact}
                />
              ))}
            </div>
          </div>

          <div
            className={`${isCompact ? 'mt-5 pt-4' : 'mt-8 sm:mt-10 pt-5'} flex flex-col sm:flex-row items-center justify-between gap-3 border-t ${
              isDark ? 'border-[#E0568F]/[0.05]' : 'border-[#8A2B57]/[0.05]'
            }`}
          >
            <p className={`text-[10px] ${isDark ? 'text-white/20' : 'text-[#160510]/25'}`}>{t.rights}</p>
            <div className="flex items-center gap-1.5">
              {[
                { Icon: Twitter, label: 'Twitter' },
                { Icon: Send, label: 'Telegram' },
                { Icon: MessageCircle, label: 'Discord' },
                { Icon: Github, label: 'GitHub' },
              ].map(({ Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    isDark
                      ? 'text-white/25 hover:text-[#E0568F]/70'
                      : 'text-[#160510]/30 hover:text-[#8A2B57]/70'
                  }`}
                >
                  <Icon size={13} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
