import type { Meta, StoryObj } from '@storybook/react-vite';
import { DEMO_PARTNER_STATE, GUEST_PARTNER_STATE } from './partnerData';
import { PartnerStakeTab } from './PartnerStakeTab';

const meta = {
  title: 'partner/PartnerStakeTab',
  component: PartnerStakeTab,
  args: {
    lang: 'zh-CN',
    isDark: false,
    state: DEMO_PARTNER_STATE,
    hasReferralBound: true,
    referralLoading: false,
    onGoHome: () => {},
  },
} satisfies Meta<typeof PartnerStakeTab>;

export default meta;
type S = StoryObj<typeof meta>;

export const WithOrders: S = {};
export const Dark: S = { args: { isDark: true } };
export const Empty: S = { args: { state: GUEST_PARTNER_STATE } };
