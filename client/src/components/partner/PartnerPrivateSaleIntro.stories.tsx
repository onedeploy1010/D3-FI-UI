import type { Meta, StoryObj } from '@storybook/react-vite';
import { PartnerPrivateSaleIntro } from './PartnerPrivateSaleIntro';

const meta = {
  title: 'partner/PartnerPrivateSaleIntro',
  component: PartnerPrivateSaleIntro,
  args: {
    lang: 'zh-CN',
    isDark: false,
    onClose: () => {},
  },
} satisfies Meta<typeof PartnerPrivateSaleIntro>;

export default meta;
type S = StoryObj<typeof meta>;

export const Light: S = {};
export const Dark: S = { args: { isDark: true } };
