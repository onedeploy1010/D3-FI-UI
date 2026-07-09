export type AppLang = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko' | 'th';

export const APP_LANGS: { code: AppLang; label: string }[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'th', label: 'ไทย' },
];

export const APP_LANG_STORAGE = 'd3_app_lang';

/** APIs that only support zh/en (notifications, protocol epoch). */
export function toLegacyLang(lang: AppLang): 'zh' | 'en' {
  if (lang === 'en' || lang === 'ja' || lang === 'ko' || lang === 'th') return 'en';
  return 'zh';
}

export function normalizeAppLang(raw: string | null | undefined): AppLang {
  if (!raw) return 'zh-CN';
  if (raw === 'zh' || raw === 'zh-CN' || raw.startsWith('zh-Hans')) return 'zh-CN';
  if (raw === 'zh-TW' || raw.startsWith('zh-Hant')) return 'zh-TW';
  if (raw === 'ja' || raw.startsWith('ja')) return 'ja';
  if (raw === 'ko' || raw.startsWith('ko')) return 'ko';
  if (raw === 'th' || raw.startsWith('th')) return 'th';
  return 'en';
}
