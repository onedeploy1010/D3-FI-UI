import { useCallback, useEffect, useMemo, useState } from 'react';
import { isDemoWallet } from '@/lib/demoWallet';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import { transferPartnerSd3 } from '@/lib/depositApi';
import {
  aggregateStakeOrders,
  applyCrowdfundStake,
  applyMarketLeader,
  applyMarketSubsidy,
  applyPartnerJoin,
  applyPartnerSubsidy,
  applySd3Stake,
  applySd3Transfer,
  resolveFlashYieldBalances,
  MIN_YIELD_WITHDRAW_USDT,
  DEMO_PARTNER_STATE,
  GUEST_PARTNER_STATE,
  hydratePartnerStateFromApi,
  migratePartnerState,
  MIN_CROWDFUND_STAKE_USDT,
  PARTNER_JOIN_USDT,
  type PartnerState,
  storageKey,
} from '@/components/partner/partnerData';
import {
  buildPartnerTeamNodes,
  emptyPartnerTeamNodes,
  findPartnerTeamNodeLabel,
  isPartnerDownlineMember,
  type PartnerTeamNode,
} from '@/components/partner/partnerTeamData';
import { fetchUnionProfile } from '@/lib/unionApi';
import { withdrawPartnerYield } from '@/lib/depositApi';

const EMPTY_TEAM_STATS: PartnerTeamStats = {
  personalPerformanceUsd: 0,
  teamPerformanceUsd: 0,
  dailyNewPerformanceUsd: 0,
};

function loadState(wallet: string | null): PartnerState | null {
  if (!wallet || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    if (!raw) return null;
    return migratePartnerState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveState(wallet: string, state: PartnerState) {
  localStorage.setItem(storageKey(wallet), JSON.stringify(state));
}

export function usePartnerProgram(wallet: string | null) {
  const [state, setState] = useState<PartnerState>(() => {
    if (!wallet) return GUEST_PARTNER_STATE;
    return loadState(wallet) ?? (isDemoWallet(wallet) ? DEMO_PARTNER_STATE : GUEST_PARTNER_STATE);
  });

  useEffect(() => {
    if (!wallet) {
      setState(GUEST_PARTNER_STATE);
      return;
    }
    const saved = loadState(wallet);
    if (saved) setState(saved);
    else setState(isDemoWallet(wallet) ? DEMO_PARTNER_STATE : GUEST_PARTNER_STATE);
  }, [wallet]);

  const [teamNodes, setTeamNodes] = useState<Record<string, PartnerTeamNode>>({});
  const [teamStats, setTeamStats] = useState<PartnerTeamStats>(EMPTY_TEAM_STATS);
  const [downlineWallets, setDownlineWallets] = useState<string[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  const refreshTeamProfile = useCallback(async () => {
    if (!wallet) {
      setTeamNodes({});
      setTeamStats(EMPTY_TEAM_STATS);
      setDownlineWallets([]);
      setTeamLoading(false);
      return;
    }
    setTeamLoading(true);
    try {
      const bundle = await fetchUnionProfile(wallet);
      setTeamNodes(buildPartnerTeamNodes(wallet, bundle));
      setTeamStats(bundle.partnerTeamStats ?? EMPTY_TEAM_STATS);
      setDownlineWallets(bundle.partnerDownlineWallets ?? []);
      setState((prev) => {
        const merged = hydratePartnerStateFromApi(prev, bundle);
        if (wallet) saveState(wallet, merged);
        return merged;
      });
    } catch {
      setTeamNodes(emptyPartnerTeamNodes(wallet));
      setTeamStats(EMPTY_TEAM_STATS);
      setDownlineWallets([]);
    } finally {
      setTeamLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void refreshTeamProfile();
  }, [refreshTeamProfile]);

  const persist = useCallback(
    (next: PartnerState) => {
      setState(next);
      if (wallet) saveState(wallet, next);
    },
    [wallet],
  );

  const stats = useMemo(() => aggregateStakeOrders(state.stakeOrders), [state.stakeOrders]);

  const crowdfundStake = useCallback(
    (amountUsdt: number, hasReferralBound: boolean) => {
      if (!hasReferralBound || amountUsdt < MIN_CROWDFUND_STAKE_USDT) return false;
      persist(applyCrowdfundStake(state, amountUsdt));
      void refreshTeamProfile();
      return true;
    },
    [state, persist, refreshTeamProfile],
  );

  const joinPartner = useCallback(
    (hasReferralBound: boolean) => {
      if (!wallet || state.isPartner || !hasReferralBound) return false;
      persist(applyPartnerJoin(state));
      void refreshTeamProfile();
      return true;
    },
    [wallet, state, persist, refreshTeamProfile],
  );

  const stakeSd3 = useCallback(
    (amount: number) => {
      if (!state.isPartner || amount <= 0 || amount > state.sd3Balance) return;
      persist(applySd3Stake(state, amount));
    },
    [state, persist],
  );

  const transferSd3 = useCallback(
    async (toAddress: string, amount: number) => {
      if (!state.isPartner || amount <= 0 || amount > state.sd3Balance) return false;
      const normalized = toAddress.trim();
      if (!isPartnerDownlineMember(normalized, downlineWallets, teamNodes)) return false;

      if (wallet && isDemoWallet(wallet)) {
        persist(
          applySd3Transfer(
            state,
            normalized,
            amount,
            findPartnerTeamNodeLabel(teamNodes, normalized),
          ),
        );
        return true;
      }

      if (!wallet) return false;
      try {
        await transferPartnerSd3(wallet, normalized, amount);
        await refreshTeamProfile();
        return true;
      } catch {
        return false;
      }
    },
    [state, persist, teamNodes, downlineWallets, wallet, refreshTeamProfile],
  );

  const [yieldWithdrawing, setYieldWithdrawing] = useState(false);

  const withdrawYield = useCallback(
    async (amount: number) => {
      if (!wallet || !state.isPartner || amount < MIN_YIELD_WITHDRAW_USDT) return false;
      const { claimable } = resolveFlashYieldBalances(state);
      if (amount > claimable + 0.0001) return false;

      setYieldWithdrawing(true);
      try {
        await withdrawPartnerYield(wallet, amount);
        await refreshTeamProfile();
        return true;
      } catch {
        return false;
      } finally {
        setYieldWithdrawing(false);
      }
    },
    [wallet, state, refreshTeamProfile],
  );

  const submitPartnerSubsidy = useCallback(
    (amountUsd: number, purpose: string) => {
      if (!state.isPartner || !purpose.trim()) return false;
      const next = applyPartnerSubsidy(state, amountUsd, purpose);
      if (next === state) return false;
      persist(next);
      return true;
    },
    [state, persist],
  );

  const submitMarketSubsidy = useCallback(
    (amountUsd: number, purpose: string) => {
      if (!state.isPartner || !purpose.trim()) return false;
      const next = applyMarketSubsidy(state, amountUsd, purpose);
      if (next === state) return false;
      persist(next);
      return true;
    },
    [state, persist],
  );

  const requestMarketLeader = useCallback(() => {
    if (!state.isPartner) return false;
    let next = applyMarketLeader(state);
    if (next === state) return false;
    if (wallet && isDemoWallet(wallet)) {
      next = { ...next, marketLeaderStatus: 'approved' };
    }
    persist(next);
    return true;
  }, [state, wallet, persist]);

  const hasStake = stats.orderCount > 0;

  const resolvedTeamStats = useMemo((): PartnerTeamStats => {
    if (isDemoWallet(wallet ?? '')) {
      return {
        personalPerformanceUsd: state.stakeOrders.reduce((s, o) => s + o.principalUsdt, 0),
        teamPerformanceUsd: state.teamPerformanceUsd,
        dailyNewPerformanceUsd: state.dailyNewPerformanceUsd,
      };
    }
    return teamStats;
  }, [wallet, state, teamStats]);

  return {
    state,
    stats,
    teamNodes,
    teamStats: resolvedTeamStats,
    downlineWallets,
    teamLoading,
    refreshTeamProfile,
    crowdfundStake,
    joinPartner,
    stakeSd3,
    transferSd3,
    withdrawYield,
    yieldWithdrawing,
    submitPartnerSubsidy,
    submitMarketSubsidy,
    requestMarketLeader,
    joinFeeUsdt: PARTNER_JOIN_USDT,
    minCrowdfundUsdt: MIN_CROWDFUND_STAKE_USDT,
    hasStake,
  };
}
