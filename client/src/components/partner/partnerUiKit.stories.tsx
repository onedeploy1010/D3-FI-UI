import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  PartnerAnimatedBar,
  PartnerDualAnimatedBar,
  PartnerInsetCell,
  PartnerLevelBadge,
  PartnerRaisedButton,
  PartnerTagChip,
  PartnerUd3Amount,
} from './partnerUiKit';

function Gallery({ isDark }: { isDark: boolean }) {
  return (
    <div className="space-y-5 max-w-md">
      <div className="flex flex-wrap items-center gap-2">
        <PartnerLevelBadge label="S2 · 80%" />
        <PartnerTagChip accent>直推</PartnerTagChip>
        <PartnerTagChip>二层</PartnerTagChip>
        <PartnerUd3Amount value={3200} className="text-base font-bold text-[#E0568F]" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <PartnerInsetCell label="个人质押" value="$5,000" isDark={isDark} />
        <PartnerInsetCell label="今日新增" value="$1,200" isDark={isDark} accent />
      </div>

      <div className="flex gap-2">
        <PartnerRaisedButton variant="primary">转账 UD3</PartnerRaisedButton>
        <PartnerRaisedButton variant="secondary">查看下线</PartnerRaisedButton>
      </div>

      <PartnerAnimatedBar
        label="小区业绩"
        value={2600}
        display="$2,600"
        max={5700}
        isDark={isDark}
        badge="未结算"
      />

      <PartnerDualAnimatedBar
        title="小区业绩"
        totalLabel="累计"
        totalValue={2600}
        totalDisplay="$2,600"
        newLabel="今日新增"
        newValue={600}
        newDisplay="$600"
        isDark={isDark}
        featured
        featuredHint="考核"
        badge="未结算"
      />
    </div>
  );
}

const meta = {
  title: 'partner/partnerUiKit',
  component: PartnerLevelBadge,
  render: (_args, ctx) => <Gallery isDark={ctx.globals.theme === 'dark'} />,
} satisfies Meta<typeof PartnerLevelBadge>;

export default meta;
type S = StoryObj<typeof meta>;

export const Gallery_Light: S = { args: { label: 'S2 · 80%' } };
