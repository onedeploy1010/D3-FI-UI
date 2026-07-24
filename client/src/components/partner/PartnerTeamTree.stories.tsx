import type { Meta, StoryObj } from '@storybook/react-vite';
import { emptyPartnerTeamNodes, partnerTeamNodes } from './partnerTeamData';
import { PartnerTeamTree } from './PartnerTeamTree';

const meta = {
  title: 'partner/PartnerTeamTree',
  component: PartnerTeamTree,
  args: {
    lang: 'zh-CN',
    isDark: false,
    wallet: '0x60D0AbCdEf0123456789AbCdEf0123456789f429',
    nodes: partnerTeamNodes,
    loading: false,
    isPartner: true,
    transferQuota: 3200,
    onTransferUd3: async () => true,
  },
} satisfies Meta<typeof PartnerTeamTree>;

export default meta;
type S = StoryObj<typeof meta>;

export const Partner: S = {};
export const Dark: S = { args: { isDark: true } };
export const EmptyDownline: S = {
  args: { nodes: emptyPartnerTeamNodes('0x60D0AbCdEf0123456789AbCdEf0123456789f429'), isPartner: false },
};
