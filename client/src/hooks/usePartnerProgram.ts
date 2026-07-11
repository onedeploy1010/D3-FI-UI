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
  mapSubsidyTicketsToApplications,
  migratePartnerState,
  MIN_CROWDFUND_STAKE_USDT,
  PARTNER_JOIN_USDT,
  type PartnerProgramSettings,
  type PartnerState,
  type SubsidyApplicationType,
  storageKey,
} from '@/components/partner/partnerData';
import {
  buildPartnerTeamNodes,
  emptyPartnerTeamNodes,
  findPartnerTeamNodeLabel,
  isPartnerDownlineMember,
  type PartnerTeamNode,
} from '@/components/partner/partnerTeamData';
import { getTeamAlias, loadTeamAliases } from '@/components/partner/partnerTeamAliases';
import { createPartnerSubsidyTicket, fetchPartnerProgramSettings, fetchPartnerSubsidyTickets, fetchUnionProfile } from '@/lib/unionApi';
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
  const [subsidySettings, setSubsidySettings] = useState<PartnerProgramSettings>({
    partnerSubsidyRatePct: 10,
    marketSubsidyRatePct: 5,
  });

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
      if (wallet && !isDemoWallet(wallet)) {
        try {
          const { settings } = await fetchPartnerProgramSettings(wallet);
          setSubsidySettings(settings);
        } catch {
          /* keep defaults */
        }
      }
      const bundle = await fetchUnionProfile(wallet);
      let subsidyPatch: Partial<PartnerState> = {};
      if (!isDemoWallet(wallet)) {
        try {
          const { tickets } = await fetchPartnerSubsidyTickets(wallet);
          const mapped = mapSubsidyTicketsToApplications(tickets ?? []);
          subsidyPatch = {
            ...mapped,
            marketLeaderStatus:
              (bundle.partnerAccount as { market_leader_status?: string } | null | undefined)
                ?.market_leader_status as PartnerState['marketLeaderStatus'] | undefined,
          };
        } catch {
          /* keep local subsidy state */
        }
      }
      setTeamNodes(buildPartnerTeamNodes(wallet, bundle));
      setTeamStats(bundle.partnerTeamStats ?? EMPTY_TEAM_STATS);
      setDownlineWallets(bundle.partnerDownlineWallets ?? []);
      setState((prev) => {
        const merged = { ...hydratePartnerStateFromApi(prev, bundle), ...subsidyPatch };
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
        const aliases = loadTeamAliases(wallet);
        const label =
          getTeamAlias(aliases, normalized) || findPartnerTeamNodeLabel(teamNodes, normalized);
        persist(
          applySd3Transfer(
            state,
            normalized,
            amount,
            label,
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
    async (input: {
      amountUsd: number;
      purpose: string;
      applicationType: SubsidyApplicationType;
      receiptPaths: string[];
    }) => {
      const { amountUsd, purpose, applicationType, receiptPaths } = input;
      if (!state.isPartner || !purpose.trim() || !wallet || isDemoWallet(wallet)) {
        if (!wallet || isDemoWallet(wallet)) {
          const next = applyPartnerSubsidy(state, amountUsd, purpose, applicationType, receiptPaths);
          if (next === state) return false;
          persist(next);
          return true;
        }
        return false;
      }
      try {
        await createPartnerSubsidyTicket(wallet, {
          kind: 'partner_subsidy',
          amountUsd,
          purpose: purpose.trim(),
          applicationType,
          receiptPaths,
        });
        await refreshTeamProfile();
        return true;
      } catch {
        return false;
      }
    },
    [state, wallet, persist, refreshTeamProfile],
  );

  const submitMarketSubsidy = useCallback(
    async (input: {
      amountUsd: number;
      purpose: string;
      applicationType: SubsidyApplicationType;
      receiptPaths: string[];
    }) => {
      const { amountUsd, purpose, applicationType, receiptPaths } = input;
      if (!state.isPartner || !purpose.trim() || !wallet || isDemoWallet(wallet)) {
        if (!wallet || isDemoWallet(wallet)) {
          const next = applyMarketSubsidy(state, amountUsd, purpose, applicationType, receiptPaths);
          if (next === state) return false;
          persist(next);
          return true;
        }
        return false;
      }
      try {
        await createPartnerSubsidyTicket(wallet, {
          kind: 'market_subsidy',
          amountUsd,
          purpose: purpose.trim(),
          applicationType,
          receiptPaths,
        });
        await refreshTeamProfile();
        return true;
      } catch {
        return false;
      }
    },
    [state, wallet, persist, refreshTeamProfile],
  );

  const requestMarketLeader = useCallback(async () => {
    if (!state.isPartner) return false;
    if (!wallet || isDemoWallet(wallet)) {
      let next = applyMarketLeader(state);
      if (next === state) return false;
      next = { ...next, marketLeaderStatus: 'approved' };
      persist(next);
      return true;
    }
    try {
      await createPartnerSubsidyTicket(wallet, { kind: 'market_leader', purpose: '申请开通市场领袖补贴' });
      await refreshTeamProfile();
      return true;
    } catch {
      return false;
    }
  }, [state, wallet, persist, refreshTeamProfile]);

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
    subsidySettings,
    joinFeeUsdt: PARTNER_JOIN_USDT,
    minCrowdfundUsdt: MIN_CROWDFUND_STAKE_USDT,
    hasStake,
  };
}
