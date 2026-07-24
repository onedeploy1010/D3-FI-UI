import type { Meta, StoryObj } from '@storybook/react-vite';
import { PartnerUd3TransferModal } from './PartnerUd3TransferModal';

const meta = {
  title: 'partner/PartnerUd3TransferModal',
  component: PartnerUd3TransferModal,
  args: {
    open: true,
    onClose: () => {},
    lang: 'zh-CN',
    isDark: false,
    toAddress: '0x60D0AbCdEf0123456789AbCdEf0123456789f429',
    levelLabel: 'S2 · 80%',
    layerLabel: '直推',
    recipientIsDirect: true,
    transferQuota: 3200,
    onConfirm: async () => true,
  },
} satisfies Meta<typeof PartnerUd3TransferModal>;

export default meta;
type S = StoryObj<typeof meta>;

export const Direct: S = {};
export const SecondLayerWithAlias: S = {
  args: {
    layerLabel: '二层',
    recipientIsDirect: false,
    toAlias: '华南团队长',
    levelLabel: 'S3 · 60%',
  },
};
export const NoQuota: S = { args: { transferQuota: 0 } };
