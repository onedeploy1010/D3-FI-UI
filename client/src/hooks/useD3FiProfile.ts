import { useCallback, useMemo } from 'react';
import { buildD3FiViewModel, type D3FiViewModel } from '@/lib/d3fiViewModel';
import { useUnionProfileQuery } from '@/hooks/useUnionProfileQuery';

type Lang = 'zh' | 'en';

export function useD3FiProfile(wallet: string | null, lang: Lang = 'zh') {
  const query = useUnionProfileQuery(wallet, { lang });

  const bundle = query.data ?? null;
  const isLoading = Boolean(wallet) && query.isLoading;
  const error =
    query.isError && !query.data
      ? query.error instanceof Error
        ? query.error.message
        : String(query.error)
      : null;

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const vm = useMemo(() => (bundle ? buildD3FiViewModel(bundle, lang) : null), [bundle, lang]);

  return { bundle, vm, isLoading, error, refetch };
}

export type { D3FiViewModel };
