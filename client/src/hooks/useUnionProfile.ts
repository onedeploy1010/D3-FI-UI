import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UnionProfileBundle } from '@/lib/d3fiTypes';
import { buildUnionViewModel, type UnionViewModel } from '@/lib/unionViewModel';
import { ensureUnionProfile, fetchUnionProfile } from '@/lib/unionApi';

type Lang = 'zh' | 'en';

export function useUnionProfile(wallet: string | null, lang: Lang = 'zh') {
  const [bundle, setBundle] = useState<UnionProfileBundle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!wallet) {
      setBundle(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchUnionProfile(wallet);
      setBundle(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('not found') || msg.includes('404')) {
        try {
          await ensureUnionProfile(wallet, { lang });
          setBundle(await fetchUnionProfile(wallet));
          return;
        } catch (inner) {
          setError(inner instanceof Error ? inner.message : String(inner));
        }
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [wallet, lang]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const vm = useMemo(
    () => (bundle && wallet ? buildUnionViewModel(bundle, wallet) : null),
    [bundle, wallet],
  );

  return { bundle, vm, isLoading, error, refetch };
}

export type { UnionViewModel };
