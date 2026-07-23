import { useCallback } from 'react';
import type { AppLang } from './types';
import { portalT } from './messages';

export function usePortalTranslation(lang: AppLang) {
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => portalT(lang, key, vars),
    [lang],
  );
}
