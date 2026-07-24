import type { Meta, StoryObj } from '@storybook/react-vite';
import { DEMO_PARTNER_STATE, DEMO_PARTNER_BASELINE, MIN_CROWDFUND_STAKE_USDT } from './partnerData';
import { PartnerHomeTab } from './PartnerHomeTab';

const meta = {
  title: 'partner/PartnerHomeTab',
  component: PartnerHomeTab,
  args: {
    lang: 'zh-CN',
    isDark: false,
    state: DEMO_PARTNER_BASELINE,
    hasReferralBound: true,
    referralLoading: false,
    referralError: false,
    minCrowdfundUsdt: MIN_CROWDFUND_STAKE_USDT,
    isDemo: true,
    paying: false,
    lastDepositIntent: null,
    onHomeStake: async () => true,
    onStakeUd3: async () => true,
    onGoTeamTransferGuide: () => {},
  },
} satisfies Meta<typeof PartnerHomeTab>;

export default meta;
type S = StoryObj<typeof meta>;

export const NewMember: S = {};
export const ExistingPartner: S = { args: { state: DEMO_PARTNER_STATE } };
export const ReferralLoading: S = { args: { referralLoading: true } };
export const Dark: S = { args: { isDark: true, state: DEMO_PARTNER_STATE } };
