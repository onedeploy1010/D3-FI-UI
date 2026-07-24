import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import { DEMO_PARTNER_STATE } from './partnerData';
import { partnerTeamNodes } from './partnerTeamData';
import { PartnerTeamTab } from './PartnerTeamTab';

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
  title: 'partner/PartnerTeamTab',
  component: PartnerTeamTab,
  args: {
    lang: 'zh-CN',
    isDark: false,
    state: DEMO_PARTNER_STATE,
    // Non-demo wallet → uses state.ud3SettlementHistory instead of the demo sim.
    wallet: '0x60D0AbCdEf0123456789AbCdEf0123456789f429',
    teamNodes: partnerTeamNodes,
    teamStats,
    teamLoading: false,
    pendingUd3Earned: 120,
    onTransferUd3: async () => true,
  },
} satisfies Meta<typeof PartnerTeamTab>;

export default meta;
type S = StoryObj<typeof meta>;

export const Default: S = {};
export const Dark: S = { args: { isDark: true } };
