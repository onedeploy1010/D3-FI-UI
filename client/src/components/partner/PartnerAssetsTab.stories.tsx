import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import { DEMO_PARTNER_STATE } from './partnerData';
import { partnerTeamNodes } from './partnerTeamData';
import { PartnerAssetsTab } from './PartnerAssetsTab';

const teamStats: PartnerTeamStats = {
  personalPerformanceUsd: 5000,
  teamPerformanceUsd: 5700,
  dailyNewPerformanceUsd: 1200,
  smallAreaPerformanceUsd: 2600,
  smallAreaNewPerformanceUsd: 600,
  largeAreaPerformanceUsd: 3100,
  largeAreaNewPerformanceUsd: 600,
};

const meta = {
  title: 'partner/PartnerAssetsTab',
  component: PartnerAssetsTab,
  args: {
    lang: 'zh-CN',
    isDark: false,
    // Null wallet keeps subsidy quota local (no network fetch in Storybook).
    wallet: null,
    state: DEMO_PARTNER_STATE,
    hasStake: true,
    teamStats,
    subsidySettings: { partnerSubsidyRatePct: 10, marketSubsidyRatePct: 5 },
    teamNodes: partnerTeamNodes,
    pendingUd3Earned: 120,
    onStakeUd3: async () => true,
    onTransferUd3: async () => true,
    onWithdrawYield: async () => true,
    onPartnerSubsidy: async () => true,
    onMarketSubsidy: async () => true,
    onGoTeamTransferGuide: () => {},
    yieldWithdrawing: false,
  },
} satisfies Meta<typeof PartnerAssetsTab>;

export default meta;
type S = StoryObj<typeof meta>;

export const Overview: S = {};
export const Dark: S = { args: { isDark: true } };
