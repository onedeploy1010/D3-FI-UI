import type { Meta, StoryObj } from '@storybook/react-vite';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';
import { PartnerPaymentConfirmSection } from './PartnerPaymentConfirmSection';

const meta = {
  title: 'partner/PartnerPaymentConfirmSection',
  component: PartnerPaymentConfirmSection,
  args: {
    isDemo: false,
    amountUsdt: 5000,
    isDark: false,
    paying: false,
    label: (k: string) => k,
  },
  // Inject the real Chinese i18n label fn so hints render in Chinese.
  render: (args) => {
    const p = usePartnerTranslation('zh-CN');
    return <PartnerPaymentConfirmSection {...args} label={p} />;
  },
} satisfies Meta<typeof PartnerPaymentConfirmSection>;

export default meta;
type S = StoryObj<typeof meta>;

export const WalletPay: S = {};
export const WalletPaying: S = { args: { paying: true } };
export const DemoPay: S = { args: { isDemo: true } };
