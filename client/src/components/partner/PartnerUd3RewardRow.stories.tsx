import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Ud3SettlementRecord } from './partnerData';
import { PartnerUd3RewardRow } from './PartnerUd3RewardRow';

const directSettled: Ud3SettlementRecord = {
  id: 'ud3-1',
  settledAt: '2026-07-18',
  teamPerformanceUsd: 5700,
  dailyNewPerformanceUsd: 1000,
  tierRatePct: 100,
  ud3Amount: 120,
  role: 'direct',
  rewardSharePct: 60,
  sourceDepth: 1,
  sourceAddress: '0x1111222233334444555566667777888899990000',
  sourceLabel: 'Direct A3',
  guideTierLabel: 'S1',
  settlementStatus: 'settled',
};

const uplinePending: Ud3SettlementRecord = {
  id: 'ud3-2',
  settledAt: '2026-07-20',
  teamPerformanceUsd: 26000,
  dailyNewPerformanceUsd: 2000,
  tierRatePct: 80,
  ud3Amount: 64,
  role: 'upline',
  rewardSharePct: 20,
  gapPct: 20,
  vLabel: 'S2',
  sourceDepth: 3,
  sourceAddress: '0x9876543210fedcba9876543210fedcba98765432',
  sourceLabel: 'B2-1',
  guideAddress: '0xbb11223344556677889900aabbccddeeff001122',
  guideLabel: 'Downline B2',
  tierCodes: ['S2', 'S3'],
  settlementStatus: 'pending',
};

const meta = {
  title: 'partner/PartnerUd3RewardRow',
  component: PartnerUd3RewardRow,
  args: {
    row: directSettled,
    lang: 'zh-CN',
    isDark: false,
    onOpenDepositor: () => {},
    onOpenGuide: () => {},
  },
} satisfies Meta<typeof PartnerUd3RewardRow>;

export default meta;
type S = StoryObj<typeof meta>;

export const DirectSettled: S = {};
export const UplinePending: S = { args: { row: uplinePending } };
export const Dark: S = { args: { row: uplinePending, isDark: true } };
