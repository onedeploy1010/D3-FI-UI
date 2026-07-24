import type { Meta, StoryObj } from '@storybook/react-vite';
import { DEMO_PARTNER_STATE } from './partnerData';
import { partnerTeamNodes } from './partnerTeamData';
import { PartnerSubsidyPanel } from './PartnerSubsidyPanel';

const meta = {
  title: 'partner/PartnerSubsidyPanel',
  component: PartnerSubsidyPanel,
  args: {
    lang: 'zh-CN',
    isDark: false,
    // Null wallet keeps quota computation local (no network fetch in Storybook).
    wallet: null,
    state: DEMO_PARTNER_STATE,
    teamNodes: partnerTeamNodes,
    subsidySettings: { partnerSubsidyRatePct: 10, marketSubsidyRatePct: 5 },
    onPartnerSubsidy: async () => true,
    onMarketSubsidy: async () => true,
  },
} satisfies Meta<typeof PartnerSubsidyPanel>;

export default meta;
type S = StoryObj<typeof meta>;

export const ApprovedLeader: S = {};
export const NotLeader: S = {
  args: { state: { ...DEMO_PARTNER_STATE, marketLeaderStatus: 'none' } },
};
export const Dark: S = { args: { isDark: true } };
