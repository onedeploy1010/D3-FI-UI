import type { Meta, StoryObj } from '@storybook/react-vite';
import { PartnerReferralLoading } from './PartnerReferralLoading';

const meta = {
  title: 'partner/PartnerReferralLoading',
  component: PartnerReferralLoading,
  args: {
    label: '正在加载团队数据…',
    isDark: false,
  },
} satisfies Meta<typeof PartnerReferralLoading>;

export default meta;
type S = StoryObj<typeof meta>;

export const Light: S = {};
export const Dark: S = { args: { isDark: true, label: '正在同步链上推荐关系…' } };
