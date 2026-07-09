import { useCallback } from 'react';
import type { AppLang } from './types';
import { partnerT } from './messages';

export function usePartnerTranslation(lang: AppLang) {
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => partnerT(lang, key, vars),
    [lang],
  );
}
