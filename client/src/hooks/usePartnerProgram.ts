import { useCallback, useEffect, useMemo, useState } from 'react';
import { isDemoWallet } from '@/lib/demoWallet';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import {
  aggregateStakeOrders,
  applyCrowdfundStake,
  applyMarketLeader,
  applyMarketSubsidy,
  applyPartnerJoin,
  applyPartnerSubsidy,
  applyUd3Stake,
  isValidUd3StakeAmount,
  resolveFlashYieldBalances,
  MIN_YIELD_WITHDRAW_USDT,
  GUEST_PARTNER_STATE,
  DEMO_PARTNER_BASELINE,
  hydratePartnerStateFromApi,
  mapSubsidyTicketsToApplications,
  migratePartnerState,
  MIN_CROWDFUND_STAKE_USDT,
  PARTNER_ENTRY_USDT,
  type PartnerProgramSettings,
  type PartnerState,
  type SubsidyApplicationType,
  storageKey,
} from '@/components/partner/partnerData';
import { getUd3Available } from '@/components/partner/partnerUd3View';
import {
  buildPartnerTeamNodes,
  emptyPartnerTeamNodes,
  findPartnerTeamNodeLabel,
  isPartnerDownlineMember,
  type PartnerTeamNode,
} from '@/components/partner/partnerTeamData';
import { buildDemoPartnerTeamFallback } from '@/components/partner/ud3DemoDailyTick';
import { loadTeamAliases, resolveTeamNodeDisplayName } from '@/components/partner/partnerTeamAliases';
import {
  addDemoMockStakeOrder,
  addDemoMockTransfer,
  applyDemoSessionOverlay,
  createDemoMockStakeOrder,
  createDemoMockTransfer,
  loadDemoPartnerSession,
} from '@/lib/demoPartnerSession';
import {
  createPartnerSubsidyTicket,
  fetchPartnerProgramSettings,
  fetchPartnerSubsidyTickets,
  fetchUnionProfile,
} from '@/lib/unionApi';
import { stakePartnerUd3, transferPartnerUd3, withdrawPartnerYield } from '@/lib/depositApi';

const EMPTY_TEAM_STATS: PartnerTeamStats = {
  personalPerformanceUsd: 0,
  teamPerformanceUsd: 0,
  dailyNewPerformanceUsd: 0,
  smallAreaPerformanceUsd: 0,
  smallAreaNewPerformanceUsd: 0,
  largeAreaPerformanceUsd: 0,
  largeAreaNewPerformanceUsd: 0,
};

function loadState(wallet: string | null): PartnerState | null {
  if (!wallet || typeof localStorage === 'undefined' || isDemoWallet(wallet)) return null;
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    if (!raw) return null;
    return migratePartnerState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveState(wallet: string, state: PartnerState) {
  if (isDemoWallet(wallet)) return;
  localStorage.setItem(storageKey(wallet), JSON.stringify(state));
}

function hydrateFromBundle(prev: PartnerState, bundle: Awaited<ReturnType<typeof fetchUnionProfile>>) {
  return hydratePartnerStateFromApi(prev, {
    partnerAccount: bundle.partnerAccount,
    partnerStakePositions: bundle.partnerStakePositions,
    partnerUd3Settlements: bundle.partnerUd3Settlements,
    partnerUd3Allocations: bundle.partnerUd3Allocations,
    partnerUd3Transfers: bundle.partnerUd3Transfers,
    partnerYieldSettlements: bundle.partnerYieldSettlements,
    pendingUd3Earned: bundle.pendingUd3Earned,
  });
}

function finalizeDemoPartnerState(
  merged: PartnerState,
  session = loadDemoPartnerSession(),
): PartnerState {
  const hasApiHistory = (merged.ud3SettlementHistory?.length ?? 0) > 0;
  const baseline = {
    ...merged,
    ud3SettlementHistory: hasApiHistory
      ? merged.ud3SettlementHistory
      : DEMO_PARTNER_BASELINE.ud3SettlementHistory,
    lifetimeUd3Earned:
      merged.lifetimeUd3Earned > 0
        ? merged.lifetimeUd3Earned
        : DEMO_PARTNER_BASELINE.lifetimeUd3Earned,
    isPartner: false,
    joinedAt: null,
    stakeOrders: [],
    transfers: [],
    yieldWithdrawals: [],
    dtPreorderEligible: false,
  };
  return applyDemoSessionOverlay(baseline, session);
}

export function usePartnerProgram(wallet: string | null, demoSessionKey = 0) {
  const [state, setState] = useState<PartnerState>(() => {
    if (!wallet) return GUEST_PARTNER_STATE;
    if (isDemoWallet(wallet)) return DEMO_PARTNER_BASELINE;
    return loadState(wallet) ?? GUEST_PARTNER_STATE;
  });

  useEffect(() => {
    if (!wallet) {
      setState(GUEST_PARTNER_STATE);
      return;
    }
    if (isDemoWallet(wallet)) {
      setState(finalizeDemoPartnerState(DEMO_PARTNER_BASELINE));
      return;
    }
    const saved = loadState(wallet);
    if (saved) setState(saved);
    else setState(GUEST_PARTNER_STATE);
  }, [wallet, demoSessionKey]);

  const [teamNodes, setTeamNodes] = useState<Record<string, PartnerTeamNode>>({});
  const [teamStats, setTeamStats] = useState<PartnerTeamStats>(EMPTY_TEAM_STATS);
  const [pendingUd3Earned, setPendingUd3Earned] = useState(0);
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
      setPendingUd3Earned(0);
      setDownlineWallets([]);
      setTeamLoading(false);
      return;
    }
    setTeamLoading(true);
    try {
      try {
        const { settings } = await fetchPartnerProgramSettings(wallet);
        setSubsidySettings(settings);
      } catch {
        /* keep defaults */
      }
      const bundle = await fetchUnionProfile(wallet);
      let subsidyPatch: Partial<PartnerState> = {};
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
      let nodes = buildPartnerTeamNodes(wallet, bundle);
      let stats = bundle.partnerTeamStats ?? EMPTY_TEAM_STATS;
      let downlines = bundle.partnerDownlineWallets ?? [];
      let pending = bundle.pendingUd3Earned ?? 0;
      /** Demo: daily tick catch-up (settle prior pending + new downline/perf). */
      if (isDemoWallet(wallet)) {
        const demo = buildDemoPartnerTeamFallback(wallet);
        nodes = demo.nodes;
        stats = demo.stats;
        downlines = demo.downlineWallets;
        pending = demo.pendingUd3;
        setTeamNodes(nodes);
        setTeamStats(stats);
        setPendingUd3Earned(pending);
        setDownlineWallets(downlines);
        setState((prev) => {
          const hydrateBase = {
            ...DEMO_PARTNER_BASELINE,
            ud3SettlementHistory: demo.settledHistory,
            lifetimeUd3Earned: demo.lifetimeUd3,
            ud3Balance: demo.lifetimeUd3,
            teamPerformanceUsd: demo.stats.teamPerformanceUsd,
            dailyNewPerformanceUsd: demo.stats.dailyNewPerformanceUsd,
            lastSettlementDate: demo.simToday,
          };
          const merged = { ...hydrateFromBundle(hydrateBase, bundle), ...subsidyPatch };
          const next = finalizeDemoPartnerState(merged);
          saveState(wallet, next);
          return {
            ...next,
            ud3SettlementHistory: demo.settledHistory,
            lifetimeUd3Earned: demo.lifetimeUd3,
            ud3Balance: Math.max(next.ud3Balance, demo.lifetimeUd3),
            teamPerformanceUsd: demo.stats.teamPerformanceUsd,
            dailyNewPerformanceUsd: demo.stats.dailyNewPerformanceUsd,
            lastSettlementDate: demo.simToday,
          };
        });
        return;
      }
      setTeamNodes(nodes);
      setTeamStats(stats);
      setPendingUd3Earned(pending);
      setDownlineWallets(downlines);
      setState((prev) => {
        const merged = { ...hydrateFromBundle(prev, bundle), ...subsidyPatch };
        saveState(wallet, merged);
        return merged;
      });
    } catch {
      if (isDemoWallet(wallet)) {
        const demo = buildDemoPartnerTeamFallback(wallet);
        setTeamNodes(demo.nodes);
        setTeamStats(demo.stats);
        setDownlineWallets(demo.downlineWallets);
        setPendingUd3Earned(demo.pendingUd3);
        setState(
          finalizeDemoPartnerState({
            ...DEMO_PARTNER_BASELINE,
            ud3SettlementHistory: demo.settledHistory,
            lifetimeUd3Earned: demo.lifetimeUd3,
            ud3Balance: demo.lifetimeUd3,
            teamPerformanceUsd: demo.stats.teamPerformanceUsd,
            dailyNewPerformanceUsd: demo.stats.dailyNewPerformanceUsd,
            lastSettlementDate: demo.simToday,
          }),
        );
      } else {
        setTeamNodes(emptyPartnerTeamNodes(wallet));
        setTeamStats(EMPTY_TEAM_STATS);
        setPendingUd3Earned(0);
        setDownlineWallets([]);
      }
    } finally {
      setTeamLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void refreshTeamProfile();
  }, [refreshTeamProfile, demoSessionKey]);

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
      if (wallet && isDemoWallet(wallet)) {
        const order = createDemoMockStakeOrder(amountUsdt, 'crowdfund');
        const session = addDemoMockStakeOrder(order);
        setState((prev) => applyDemoSessionOverlay({ ...prev, transfers: [] }, session));
        return true;
      }
      persist(applyCrowdfundStake(state, amountUsdt));
      void refreshTeamProfile();
      return true;
    },
    [wallet, state, persist, refreshTeamProfile],
  );

  const joinPartner = useCallback(
    (hasReferralBound: boolean) => {
      if (!wallet || state.isPartner || !hasReferralBound) return false;
      if (isDemoWallet(wallet)) {
        const order = createDemoMockStakeOrder(PARTNER_ENTRY_USDT, 'partner_join');
        const session = addDemoMockStakeOrder(order, { partnerJoined: true });
        setState((prev) => applyDemoSessionOverlay({ ...prev, transfers: [] }, session));
        return true;
      }
      persist(applyPartnerJoin(state));
      void refreshTeamProfile();
      return true;
    },
    [wallet, state, persist, refreshTeamProfile],
  );

  const stakeUd3 = useCallback(
    async (amount: number) => {
      if (!wallet || !state.isPartner) return false;
      const available = getUd3Available(state);
      if (!isValidUd3StakeAmount(amount, available)) return false;

      if (isDemoWallet(wallet)) {
        const order = createDemoMockStakeOrder(amount, 'sd3');
        const session = addDemoMockStakeOrder(order, { partnerJoined: true });
        setState((prev) => applyDemoSessionOverlay({ ...prev, transfers: [] }, session));
        return true;
      }

      try {
        await stakePartnerUd3(wallet, amount);
        await refreshTeamProfile();
        return true;
      } catch {
        return false;
      }
    },
    [wallet, state, persist, refreshTeamProfile],
  );

  const transferUd3 = useCallback(
    async (toAddress: string, amount: number) => {
      if (!state.isPartner || amount <= 0 || amount > getUd3Available(state)) return false;
      const normalized = toAddress.trim();
      if (!isPartnerDownlineMember(normalized, downlineWallets, teamNodes)) return false;
      if (!wallet) return false;

      if (isDemoWallet(wallet)) {
        const aliases = loadTeamAliases(wallet);
        const fallback = findPartnerTeamNodeLabel(teamNodes, normalized);
        const toLabel = resolveTeamNodeDisplayName(aliases, normalized, fallback);
        const transfer = createDemoMockTransfer(normalized, amount, toLabel || undefined);
        const session = addDemoMockTransfer(transfer);
        setState((prev) => applyDemoSessionOverlay({ ...prev, transfers: [] }, session));
        return true;
      }

      try {
        await transferPartnerUd3(wallet, normalized, amount);
        await refreshTeamProfile();
        return true;
      } catch {
        return false;
      }
    },
    [state, teamNodes, downlineWallets, wallet, refreshTeamProfile],
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
      if (!state.isPartner || !purpose.trim() || !wallet) return false;
      if (isDemoWallet(wallet)) {
        const next = applyPartnerSubsidy(state, amountUsd, purpose, applicationType, receiptPaths);
        if (next === state) return false;
        persist(next);
        return true;
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
      if (!state.isPartner || !purpose.trim() || !wallet) return false;
      if (isDemoWallet(wallet)) {
        const next = applyMarketSubsidy(state, amountUsd, purpose, applicationType, receiptPaths);
        if (next === state) return false;
        persist(next);
        return true;
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

  return {
    state,
    stats,
    teamNodes,
    teamStats,
    pendingUd3Earned,
    downlineWallets,
    teamLoading,
    refreshTeamProfile,
    crowdfundStake,
    joinPartner,
    stakeUd3,
    transferUd3,
    withdrawYield,
    yieldWithdrawing,
    submitPartnerSubsidy,
    submitMarketSubsidy,
    requestMarketLeader,
    subsidySettings,
    joinFeeUsdt: PARTNER_ENTRY_USDT,
    minCrowdfundUsdt: MIN_CROWDFUND_STAKE_USDT,
    hasStake,
  };
}
