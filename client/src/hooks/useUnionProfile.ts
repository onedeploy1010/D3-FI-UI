import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UnionProfileBundle } from '@/lib/d3fiTypes';
import { buildUnionViewModel, buildEmptyUnionViewModel, type UnionViewModel } from '@/lib/unionViewModel';
import { ensureUnionProfile, fetchUnionProfile } from '@/lib/unionApi';
import { isSupabaseClientConfigured } from '@/lib/supabase';
import { useWallet } from '@/contexts/WalletContext';

type Lang = 'zh' | 'en';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isAuthError(message: string) {
  const m = message.toLowerCase();
  return m.includes('privy') || m.includes('401') || m.includes('token');
}

function isNotFoundError(message: string) {
  const m = message.toLowerCase();
  return m.includes('not found') || m.includes('404');
}

export function useUnionProfile(wallet: string | null, lang: Lang = 'zh') {
  const { isReady, isConnected } = useWallet();
  const [bundle, setBundle] = useState<UnionProfileBundle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!wallet || !isReady || !isConnected) {
      setBundle(null);
      setError(null);
      return;
    }

    if (!isSupabaseClientConfigured) {
      setBundle(null);
      setError('后端服务未配置，请联系管理员或稍后重试');
      return;
    }

    setIsLoading(true);
    setError(null);

    const loadProfile = async () => fetchUnionProfile(wallet);

    const ensureThenLoad = async () => {
      await ensureUnionProfile(wallet, { lang });
      return loadProfile();
    };

    try {
      let lastError: string | null = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt > 0) await sleep(350 * attempt);
        try {
          const data = await loadProfile();
          setBundle(data);
          setError(null);
          return;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          lastError = msg;
          if (isAuthError(msg) && attempt < 3) continue;
          if (isNotFoundError(msg)) {
            setBundle(await ensureThenLoad());
            setError(null);
            return;
          }
          throw e;
        }
      }
      throw new Error(lastError ?? 'Failed to load profile');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isNotFoundError(msg)) {
        try {
          setBundle(await ensureThenLoad());
          setError(null);
          return;
        } catch (inner) {
          setError(inner instanceof Error ? inner.message : String(inner));
        }
      } else {
        setError(msg);
      }
      setBundle(null);
    } finally {
      setIsLoading(false);
    }
  }, [wallet, isReady, isConnected, lang]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const vm = useMemo(
    () => (bundle && wallet ? buildUnionViewModel(bundle, wallet) : null),
    [bundle, wallet],
  );

  const fallbackVm = useMemo(
    (): UnionViewModel | null => (wallet && isConnected ? buildEmptyUnionViewModel(wallet) : null),
    [wallet, isConnected],
  );

  return { bundle, vm, fallbackVm, isLoading, error, refetch };
}

export type { UnionViewModel };
