import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import { DEMO_PARTNER_STATE, GUEST_PARTNER_STATE } from './partnerData';
import { partnerTeamNodes } from './partnerTeamData';
import { PartnerTeamDashboard } from './PartnerTeamDashboard';

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
  title: 'partner/PartnerTeamDashboard',
  component: PartnerTeamDashboard,
  args: {
    lang: 'zh-CN',
    isDark: false,
    wallet: '0x60D0AbCdEf0123456789AbCdEf0123456789f429',
    state: DEMO_PARTNER_STATE,
    teamStats,
    teamNodes: partnerTeamNodes,
    pendingUd3Earned: 120,
  },
} satisfies Meta<typeof PartnerTeamDashboard>;

export default meta;
type S = StoryObj<typeof meta>;

export const Partner: S = {};
export const Dark: S = { args: { isDark: true } };
export const NewMember: S = {
  args: {
    state: GUEST_PARTNER_STATE,
    teamStats: { personalPerformanceUsd: 0, teamPerformanceUsd: 0, dailyNewPerformanceUsd: 0 },
    teamNodes: {},
    pendingUd3Earned: 0,
  },
};
