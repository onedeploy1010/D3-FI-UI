import { useCallback, useMemo } from 'react';
import { buildUnionViewModel, buildEmptyUnionViewModel, type UnionViewModel } from '@/lib/unionViewModel';
import { isSupabaseClientConfigured } from '@/lib/supabase';
import { useWallet } from '@/contexts/wallet-context';
import { useUnionProfileQuery } from '@/hooks/useUnionProfileQuery';

type Lang = 'zh' | 'en';

export function useUnionProfile(wallet: string | null, lang: Lang = 'zh') {
  const { isReady, isConnected } = useWallet();

  const enabled = Boolean(wallet) && isReady && isConnected && isSupabaseClientConfigured;
  const query = useUnionProfileQuery(wallet, { lang, enabled });

  const bundle = enabled ? (query.data ?? null) : null;
  const isLoading = enabled && query.isLoading;

  const error = useMemo(() => {
    if (wallet && (isReady && isConnected) && !isSupabaseClientConfigured) {
      return '后端服务未配置，请联系管理员或稍后重试';
    }
    if (query.isError && !query.data) {
      return query.error instanceof Error ? query.error.message : String(query.error);
    }
    return null;
  }, [wallet, isReady, isConnected, query.isError, query.data, query.error]);

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

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
