import type { AppLang } from './types';
import landingZhCN from './locales/landing/zh-CN.json';
import landingZhTW from './locales/landing/zh-TW.json';
import landingEn from './locales/landing/en.json';
import landingJa from './locales/landing/ja.json';
import landingKo from './locales/landing/ko.json';
import landingTh from './locales/landing/th.json';
import partnerZhCN from './locales/partner/zh-CN.json';
import partnerZhTW from './locales/partner/zh-TW.json';
import partnerEn from './locales/partner/en.json';
import partnerJa from './locales/partner/ja.json';
import partnerKo from './locales/partner/ko.json';
import partnerTh from './locales/partner/th.json';

export type LandingContent = typeof landingEn;

const landingMap: Record<AppLang, LandingContent> = {
  'zh-CN': landingZhCN as LandingContent,
  'zh-TW': landingZhTW as LandingContent,
  en: landingEn as LandingContent,
  ja: landingJa as LandingContent,
  ko: landingKo as LandingContent,
  th: landingTh as LandingContent,
};

const partnerMap: Record<AppLang, Record<string, string>> = {
  'zh-CN': partnerZhCN,
  'zh-TW': partnerZhTW,
  en: partnerEn,
  ja: partnerJa,
  ko: partnerKo,
  th: partnerTh,
};

export function getLandingContent(lang: AppLang): LandingContent {
  return landingMap[lang] ?? landingMap.en;
}

export function partnerT(lang: AppLang, key: string, vars?: Record<string, string | number>): string {
  let text = partnerMap[lang]?.[key] ?? partnerMap.en[key] ?? partnerMap['zh-CN']?.[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v)).replaceAll(`\${${k}}`, String(v));
    }
  }
  return text;
}
