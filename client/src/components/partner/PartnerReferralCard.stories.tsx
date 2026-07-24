import type { Meta, StoryObj } from '@storybook/react-vite';
import { PartnerReferralCard } from './PartnerReferralCard';

const meta = {
  title: 'partner/PartnerReferralCard',
  component: PartnerReferralCard,
  args: {
    lang: 'zh-CN',
    isDark: false,
    referralLink: 'https://d3-fi.com/join?ref=0x60D0AbCdEf0123456789AbCdEf0123456789f429',
  },
} satisfies Meta<typeof PartnerReferralCard>;

export default meta;
type S = StoryObj<typeof meta>;

export const Light: S = {};
export const Dark: S = { args: { isDark: true } };
