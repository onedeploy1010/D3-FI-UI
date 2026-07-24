import type { Meta, StoryObj } from '@storybook/react-vite';
import { PartnerSubsidyApplyModal } from './PartnerSubsidyApplyModal';

const meta = {
  title: 'partner/PartnerSubsidyApplyModal',
  component: PartnerSubsidyApplyModal,
  args: {
    open: true,
    onClose: () => {},
    title: '申请合伙人补贴',
    lang: 'zh-CN',
    isDark: false,
    wallet: '0x60D0AbCdEf0123456789AbCdEf0123456789f429',
    ratePct: 10,
    remainingUsd: 3200,
    accentClass: 'text-emerald-600',
    purposePlaceholder: '例如：7月线下招商会场地费',
    onSubmit: async () => true,
  },
} satisfies Meta<typeof PartnerSubsidyApplyModal>;

export default meta;
type S = StoryObj<typeof meta>;

export const Light: S = {};
export const Dark: S = { args: { isDark: true } };
export const QuotaExhausted: S = { args: { remainingUsd: 0 } };
