export type BribeProject = {
  id: string;
  name: string;
  nameZh: string;
  gauge: string;
  bribeAmount: string;
  perVote: string;
  deadline: string;
  status: 'active' | 'ended';
  descriptionZh: string;
  descriptionEn: string;
  website: string;
  totalVotes: string;
  voters: number;
  epoch: string;
};

export const bribeProjects: BribeProject[] = [
  {
    id: 'alpha',
    name: 'Project Alpha',
    nameZh: 'Alpha 协议',
    gauge: 'D3/USDT LP',
    bribeAmount: '$45,000',
    perVote: '$0.12',
    deadline: '3d 14h',
    status: 'active',
    descriptionZh: '跨链流动性聚合协议，寻求 D3 排放以深化 D3/USDT 池深度。',
    descriptionEn: 'Cross-chain liquidity aggregator seeking D3 emissions to deepen the D3/USDT pool.',
    website: 'https://alpha.example',
    totalVotes: '375,000',
    voters: 128,
    epoch: '#42',
  },
  {
    id: 'beta',
    name: 'Project Beta',
    nameZh: 'Beta DeFi',
    gauge: 'D3/BNB LP',
    bribeAmount: '$28,000',
    perVote: '$0.08',
    deadline: '3d 14h',
    status: 'active',
    descriptionZh: 'BNB 链上借贷市场，通过贿赂争取 Gauge 权重与流动性激励。',
    descriptionEn: 'BNB Chain lending market competing for Gauge weight and liquidity incentives via bribes.',
    website: 'https://beta.example',
    totalVotes: '350,000',
    voters: 96,
    epoch: '#42',
  },
  {
    id: 'gamma',
    name: 'Project Gamma',
    nameZh: 'Gamma Labs',
    gauge: 'D3/ETH LP',
    bribeAmount: '$12,000',
    perVote: '$0.05',
    deadline: '3d 14h',
    status: 'active',
    descriptionZh: 'ETH 生态衍生品协议，投放 USDT 贿赂换取 veD3 投票支持。',
    descriptionEn: 'ETH ecosystem derivatives protocol depositing USDT bribes for veD3 voting support.',
    website: 'https://gamma.example',
    totalVotes: '240,000',
    voters: 64,
    epoch: '#42',
  },
  {
    id: 'delta',
    name: 'Project Delta',
    nameZh: 'Delta 稳定币',
    gauge: 'D3/USDT LP',
    bribeAmount: '$8,500',
    perVote: '$0.03',
    deadline: '已结束',
    status: 'ended',
    descriptionZh: '算法稳定币项目，上 Epoch 贿赂已结算完毕。',
    descriptionEn: 'Algorithmic stablecoin project; last Epoch bribe fully settled.',
    website: 'https://delta.example',
    totalVotes: '283,000',
    voters: 82,
    epoch: '#41',
  },
];

export type GaugeItem = {
  id: string;
  name: string;
  bribe: string;
  apy: string;
  poolWeight: string;
  emissionShare: string;
  lpFees: string;
  voted: boolean;
  myVotes: number;
};

export function gaugeIdFromName(gauge: string): string {
  if (gauge.includes('USDT')) return 'usdt';
  if (gauge.includes('BNB')) return 'bnb';
  if (gauge.includes('ETH')) return 'eth';
  return 'usdt';
}

export const gaugeList: GaugeItem[] = [
  { id: 'usdt', name: 'D3/USDT LP', bribe: '$45K', apy: '24.5%', poolWeight: '35%', emissionShare: '38%', lpFees: '$12.4K', voted: true, myVotes: 800 },
  { id: 'bnb', name: 'D3/BNB LP', bribe: '$28K', apy: '18.2%', poolWeight: '22%', emissionShare: '24%', lpFees: '$8.1K', voted: false, myVotes: 0 },
  { id: 'eth', name: 'D3/ETH LP', bribe: '$12K', apy: '15.8%', poolWeight: '15%', emissionShare: '16%', lpFees: '$4.2K', voted: false, myVotes: 0 },
];

export type TeamNode = {
  id: string;
  address: string;
  level: string;
  personal: string;
  depth: number;
  isDirect?: boolean;
  children?: TeamNode[];
};

export const teamTree: TeamNode = {
  id: 'me',
  address: '0x1234...5678 (我)',
  level: 'V5',
  personal: '$3,200',
  depth: 0,
  children: [
    {
      id: 'a1',
      address: '0xAbCd...Ef01',
      level: 'V3',
      personal: '$1,100',
      depth: 1,
      isDirect: true,
      children: [
        { id: 'a1-1', address: '0x9876...4321', level: 'V1', personal: '$280', depth: 2 },
        { id: 'a1-2', address: '0x2468...1357', level: 'V2', personal: '$450', depth: 2 },
      ],
    },
    {
      id: 'a2',
      address: '0x5678...9AbC',
      level: 'V4',
      personal: '$2,400',
      depth: 1,
      isDirect: true,
      children: [
        { id: 'a2-1', address: '0x1357...2468', level: 'V2', personal: '$620', depth: 2 },
      ],
    },
    { id: 'a3', address: '0xDeF0...1234', level: 'V1', personal: '$200', depth: 1, isDirect: true },
  ],
};

export const teamPerformance = {
  level: 'V5',
  levelRange: '16% – 38%',
  personal: '$3,200',
  personalReq: '$3,000',
  largeArea: '$428,000',
  largeAreaReq: '$400,000',
  smallArea: '$128,400',
  smallAreaReq: '$120,000',
  teamCount: 156,
  directCount: 24,
  validCount: 89,
  nextLevel: 'V6',
};

export const pocDimensions = [
  { key: 'H', weight: 0.15, labelZh: '个人质押', labelEn: 'Personal Stake', value: 72, rawZh: '质押 D3 价值 $3,200', rawEn: 'Staked D3 value $3,200' },
  { key: 'C', weight: 0.15, labelZh: '团队业绩', labelEn: 'Team Performance', value: 85, rawZh: '大区+小区总业绩 $556,400', rawEn: 'Large+small area $556,400' },
  { key: 'A', weight: 0.30, labelZh: '团队新增', labelEn: 'Team New Deposits', value: 68, rawZh: '30天新增 $42,000', rawEn: '30d new deposits $42,000' },
  { key: 'R', weight: 0.30, labelZh: '留存率', labelEn: 'Retention', value: 91, rawZh: '续投+未提现比例 91%', rawEn: 'Renewal + unwithdrawn 91%' },
  { key: 'E', weight: 0.10, labelZh: '有效账户', labelEn: 'Valid Accounts', value: 56, rawZh: '新增有效户 12 (≥100U)', rawEn: '12 new valid (≥100U)' },
] as const;

export const pocScore = 78.4;
export const levelDiffRate = 28.6; // 下限 + (上限-下限) × PoC/100 for V5

export const vLevelTable = [
  { level: 'V1', personal: '200U', large: '3,000U', small: '—', range: '3%–10%' },
  { level: 'V3', personal: '1,000U', large: '60,000U', small: '—', range: '8%–22%' },
  { level: 'V5', personal: '3,000U', large: '400,000U', small: '120,000U', range: '16%–38%' },
  { level: 'V7', personal: '7,000U', large: '3,000,000U', small: '900,000U', range: '25%–55%' },
  { level: 'V12', personal: '50,000U', large: '300,000,000U', small: '90,000,000U', range: '50%–85%' },
];
