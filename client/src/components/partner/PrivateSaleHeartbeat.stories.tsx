import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrivateSaleHeartbeat } from './PrivateSaleHeartbeat';

const meta = {
  title: 'partner/PrivateSaleHeartbeat',
  component: PrivateSaleHeartbeat,
  args: {
    lang: 'zh-CN',
    isDark: false,
  },
} satisfies Meta<typeof PrivateSaleHeartbeat>;

export default meta;
type S = StoryObj<typeof meta>;

export const Light: S = {};
export const Dark: S = { args: { isDark: true } };
