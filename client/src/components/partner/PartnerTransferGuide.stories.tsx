import type { Meta, StoryObj } from '@storybook/react-vite';
import { PartnerTransferGuide } from './PartnerTransferGuide';

const meta = {
  title: 'partner/PartnerTransferGuide',
  component: PartnerTransferGuide,
  args: {
    lang: 'zh-CN',
    isDark: false,
    active: true,
    onComplete: () => {},
    onStepChange: () => {},
  },
} satisfies Meta<typeof PartnerTransferGuide>;

export default meta;
type S = StoryObj<typeof meta>;

export const Light: S = {};
export const Dark: S = { args: { isDark: true } };
