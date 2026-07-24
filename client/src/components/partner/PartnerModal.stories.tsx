import type { Meta, StoryObj } from '@storybook/react-vite';
import { PartnerModal } from './PartnerModal';

const meta = {
  title: 'partner/PartnerModal',
  component: PartnerModal,
  args: {
    open: true,
    onClose: () => {},
    title: '确认质押',
    isDark: false,
    children: (
      <div className="space-y-3 text-sm text-[#160510]/80 dark:text-white/70">
        <p>您即将质押 5,000 USDT 成为合伙人，锁仓 540 天。</p>
        <div className="partner-depth-inset rounded-xl p-3 flex justify-between">
          <span>预计日返息</span>
          <span className="font-bold text-[#E0568F]">20 USDT</span>
        </div>
      </div>
    ),
  },
} satisfies Meta<typeof PartnerModal>;

export default meta;
type S = StoryObj<typeof meta>;

export const Light: S = {};
export const Dark: S = { args: { isDark: true } };
