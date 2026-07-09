import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { APP_LANG_STORAGE, normalizeAppLang, type AppLang } from './types';

type LanguageContextValue = {
  lang: AppLang;
  setLang: (lang: AppLang) => void;
};

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLang>(() => {
    if (typeof localStorage === 'undefined') return 'zh-CN';
    return normalizeAppLang(localStorage.getItem(APP_LANG_STORAGE));
  });

  const setLang = useCallback((next: AppLang) => {
    setLangState(next);
    localStorage.setItem(APP_LANG_STORAGE, next);
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useAppLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useAppLang must be used within LanguageProvider');
  return ctx;
}
