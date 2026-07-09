import { useCallback, useEffect, useMemo, useState } from 'react';
import { isDemoWallet } from '@/lib/demoWallet';
import {
  aggregateStakeOrders,
  applyCrowdfundStake,
  applyMarketLeader,
  applyMarketSubsidy,
  applyPartnerJoin,
  applyPartnerSubsidy,
  applySd3Stake,
  applySd3Transfer,
  DEMO_PARTNER_STATE,
  GUEST_PARTNER_STATE,
  migratePartnerState,
  MIN_CROWDFUND_STAKE_USDT,
  PARTNER_JOIN_USDT,
  type PartnerState,
  storageKey,
} from '@/components/partner/partnerData';
import { partnerTeamNodes } from '@/components/partner/partnerTeamData';

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

function resolveDownlineLabel(toAddress: string): string | undefined {
  const hit = Object.values(partnerTeamNodes).find(
    (n) => n.address.toLowerCase() === toAddress.toLowerCase(),
  );
  return hit?.label;
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
      return true;
    },
    [state, persist],
  );

  const joinPartner = useCallback(
    (hasReferralBound: boolean) => {
      if (!wallet || state.isPartner || !hasReferralBound) return false;
      persist(applyPartnerJoin(state));
      return true;
    },
    [wallet, state, persist],
  );

  const stakeSd3 = useCallback(
    (amount: number) => {
      if (!state.isPartner || amount <= 0 || amount > state.sd3Balance) return;
      persist(applySd3Stake(state, amount));
    },
    [state, persist],
  );

  const transferSd3 = useCallback(
    (toAddress: string, amount: number) => {
      if (!state.isPartner || amount <= 0 || amount > state.sd3Balance) return;
      persist(applySd3Transfer(state, toAddress, amount, resolveDownlineLabel(toAddress)));
    },
    [state, persist],
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

  return {
    state,
    stats,
    crowdfundStake,
    joinPartner,
    stakeSd3,
    transferSd3,
    submitPartnerSubsidy,
    submitMarketSubsidy,
    requestMarketLeader,
    joinFeeUsdt: PARTNER_JOIN_USDT,
    minCrowdfundUsdt: MIN_CROWDFUND_STAKE_USDT,
    hasStake,
  };
}
