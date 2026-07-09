import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProtocolBundle, mapBribeProjects, mapEpochView } from '@/lib/protocolApi';
import { formatCountdown } from '@/lib/protocolFormat';
import type { BribeProjectView, ProtocolEpochView } from '@/lib/protocolTypes';

type Lang = 'zh' | 'en';

export function useProtocolEpoch(lang: Lang = 'zh') {
  const [epochView, setEpochView] = useState<ProtocolEpochView | null>(null);
  const [bribeProjects, setBribeProjects] = useState<BribeProjectView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchProtocolBundle();
      const label = data.epoch?.label ?? '—';
      const active = data.bribeProjects.filter((p) => p.status === 'active').length;
      setEpochView(mapEpochView(data.epoch, active, lang));
      setBribeProjects(mapBribeProjects(data.bribeProjects, label, lang));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEpochView(null);
      setBribeProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Refresh countdown every minute
  useEffect(() => {
    if (!epochView?.settlementAt) return;
    const id = window.setInterval(() => {
      setEpochView((prev) => {
        if (!prev) return prev;
        return { ...prev, countdown: formatCountdown(prev.settlementAt, lang) };
      });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [epochView?.settlementAt, lang]);

  const activeProjects = useMemo(
    () => bribeProjects.filter((p) => p.status === 'active'),
    [bribeProjects],
  );

  return { epoch: epochView, bribeProjects, activeProjects, isLoading, error, refetch };
}
