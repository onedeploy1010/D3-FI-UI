import { useCallback, useEffect, useMemo, useState } from 'react';
import { SectionTabBar } from '@/components/d3fi/SectionTabBar';
import { PartnerTeamTree } from '@/components/partner/PartnerTeamTree';
import { PartnerTeamDashboard } from '@/components/partner/PartnerTeamDashboard';
import { PartnerReferralCard } from '@/components/partner/PartnerReferralCard';
import { PartnerTransferGuide } from '@/components/partner/PartnerTransferGuide';
import { PartnerUd3RewardRow } from '@/components/partner/PartnerUd3RewardRow';
import {
  emptyPartnerTeamNodes,
  type PartnerTeamNode,
} from '@/components/partner/partnerTeamData';
import { getUd3Quotas, type PartnerState } from '@/components/partner/partnerData';
import { buildDemoUd3PendingRows } from '@/components/partner/ud3DemoSettle';
import { ensureDemoSimCaughtUp } from '@/components/partner/ud3DemoDailyTick';
import { isDemoWallet } from '@/lib/demoWallet';
import { walletEquals } from '@/lib/wallet';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import { buildReferralLink } from '@/lib/referral';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

type TeamSub = 'tree' | 'sd3';
type StatusFilter = 'all' | 'settled' | 'pending';
type RoleFilter = 'all' | 'direct' | 'upline';

function findNodeIdByAddress(
  nodes: Record<string, PartnerTeamNode>,
  address: string,
): string | null {
  const raw = address.trim();
  if (!raw) return null;
  const hit = Object.values(nodes).find(
    (n) =>
      walletEquals(n.address, raw) ||
      n.address.toLowerCase() === raw.toLowerCase() ||
      n.short?.toLowerCase() === raw.toLowerCase() ||
      n.label?.toLowerCase() === raw.toLowerCase(),
  );
  return hit?.id ?? null;
}

export function PartnerTeamTab({
  lang,
  isDark,
  state,
  wallet,
  teamNodes,
  teamStats,
  teamLoading,
  pendingUd3Earned = 0,
  onTransferUd3,
  transferGuideActive,
  onTransferGuideComplete,
}: {
  lang: AppLang;
  isDark: boolean;
  state: PartnerState;
  wallet: string | null;
  teamNodes: Record<string, PartnerTeamNode>;
  teamStats: PartnerTeamStats;
  teamLoading: boolean;
  pendingUd3Earned?: number;
  onTransferUd3?: (toAddress: string, amount: number) => Promise<boolean>;
  transferGuideActive?: boolean;
  onTransferGuideComplete?: () => void;
}) {
  const p = usePartnerTranslation(lang);
  const referralLink = buildReferralLink(wallet);
  const isPartner = state.isPartner;
  const transferQuota = getUd3Quotas(state).transferQuota;
  const [sub, setSub] = useState<TeamSub>('tree');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [transferGuideStep, setTransferGuideStep] = useState(-1);
  /** token bumps every click so tree re-applies even for the same node. */
  const [jumpReq, setJumpReq] = useState<{ id: string; token: number } | null>(null);

  useEffect(() => {
    if (transferGuideActive) setSub('tree');
  }, [transferGuideActive]);

  const treeNodes = useMemo(() => {
    if (teamNodes.me) return teamNodes;
    if (wallet) return emptyPartnerTeamNodes(wallet);
    return {};
  }, [teamNodes, wallet]);

  const history = state.ud3SettlementHistory ?? [];

  /** Demo：当日下线新增 = 未结算行，置顶；其余日期 = 已结算。 */
  const pendingRows = useMemo(() => {
    if (!wallet || !isDemoWallet(wallet) || !treeNodes.me) return [];
    const sim = ensureDemoSimCaughtUp();
    return buildDemoUd3PendingRows(treeNodes, sim.pendingDeposits);
  }, [wallet, treeNodes]);

  const allRows = useMemo(() => [...pendingRows, ...history], [pendingRows, history]);

  const filteredHistory = useMemo(() => {
    const rows = allRows.filter((row) => {
      if (statusFilter === 'settled' && row.settlementStatus === 'pending') return false;
      if (statusFilter === 'pending' && row.settlementStatus !== 'pending') return false;
      if (roleFilter === 'direct' && row.role === 'upline') return false;
      if (roleFilter === 'upline' && row.role !== 'upline') return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const pa = a.settlementStatus === 'pending' ? 1 : 0;
      const pb = b.settlementStatus === 'pending' ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return b.settledAt.localeCompare(a.settledAt);
    });
  }, [allRows, statusFilter, roleFilter]);

  const jumpToAddress = useCallback(
    (address: string) => {
      const id = findNodeIdByAddress(treeNodes, address);
      if (!id) return;
      setSub('tree');
      setJumpReq({ id, token: Date.now() });
    },
    [treeNodes],
  );

  const clearJumpReq = useCallback(() => setJumpReq(null), []);

  const subs = [
    { id: 'tree', label: p('team.referralDetail') },
    { id: 'sd3', label: p('team.ud3Rewards') },
  ];

  return (
    <div className="space-y-4">
      <PartnerReferralCard lang={lang} isDark={isDark} referralLink={referralLink} />

      <PartnerTeamDashboard
        lang={lang}
        isDark={isDark}
        wallet={wallet}
        state={state}
        teamStats={teamStats}
        teamNodes={treeNodes}
        pendingUd3Earned={pendingUd3Earned}
      />

      <SectionTabBar tabs={subs} active={sub} onChange={(id) => setSub(id as TeamSub)} isDark={isDark} />

      {/* Keep mounted so jump-from-rewards does not lose focus across tab remounts. */}
      <div className={sub === 'tree' ? 'contents' : 'hidden'} aria-hidden={sub !== 'tree'}>
        <PartnerTeamTree
          lang={lang}
          isDark={isDark}
          wallet={wallet}
          nodes={treeNodes}
          loading={teamLoading}
          isPartner={isPartner}
          transferQuota={transferQuota}
          onTransferUd3={isPartner ? onTransferUd3 : undefined}
          transferGuideActive={transferGuideActive}
          transferGuideStep={transferGuideStep}
          jumpFocusId={jumpReq?.id ?? null}
          jumpToken={jumpReq?.token ?? 0}
          onJumpFocusConsumed={clearJumpReq}
        />
      </div>

      {sub === 'sd3' && (
        <div className="space-y-2.5">
          <div
            className={`flex flex-wrap gap-1 p-1 rounded-xl ${
              isDark ? 'bg-white/[0.04]' : 'bg-[#160510]/[0.04]'
            }`}
          >
            {(
              [
                ['all', p('team.ud3FilterAll')],
                ['settled', p('team.settledBadge')],
                ['pending', p('team.unsettledBadge')],
                ['direct', p('team.ud3RoleDirect')],
                ['upline', p('team.ud3RoleUpline')],
              ] as const
            ).map(([id, label]) => {
              const active =
                id === 'all'
                  ? statusFilter === 'all' && roleFilter === 'all'
                  : id === 'settled' || id === 'pending'
                    ? statusFilter === id && roleFilter === 'all'
                    : roleFilter === id && statusFilter === 'all';
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (id === 'all') {
                      setStatusFilter('all');
                      setRoleFilter('all');
                    } else if (id === 'settled' || id === 'pending') {
                      setStatusFilter(id);
                      setRoleFilter('all');
                    } else {
                      setRoleFilter(id);
                      setStatusFilter('all');
                    }
                  }}
                  className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                    active
                      ? 'text-[#E0568F] bg-[#E0568F]/14 shadow-sm'
                      : isDark
                        ? 'text-white/40 hover:text-white/60'
                        : 'text-[#160510]/40 hover:text-[#160510]/60'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {filteredHistory.length === 0 ? (
            <div className={`text-center text-sm py-10 ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
              {allRows.length === 0 ? p('team.ud3HistoryEmpty') : p('filters.noResults')}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredHistory.map((row) => (
                <PartnerUd3RewardRow
                  key={row.id}
                  row={row}
                  lang={lang}
                  isDark={isDark}
                  onOpenDepositor={jumpToAddress}
                  onOpenGuide={jumpToAddress}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <PartnerTransferGuide
        lang={lang}
        isDark={isDark}
        active={Boolean(transferGuideActive)}
        onStepChange={setTransferGuideStep}
        onComplete={() => {
          setTransferGuideStep(-1);
          onTransferGuideComplete?.();
        }}
      />
    </div>
  );
}
