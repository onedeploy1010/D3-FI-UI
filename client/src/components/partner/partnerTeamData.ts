export type PartnerTeamNode = {
  id: string;
  address: string;
  short: string;
  label: string;
  parentId: string | null;
  childrenIds: string[];
  teamUsd: number;
  dailyNewUsd: number;
  personalUsd: number;
  directCount: number;
  teamCount: number;
  isDirect: boolean;
};

export const partnerTeamNodes: Record<string, PartnerTeamNode> = {
  me: {
    id: 'me',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    short: '0x1234…5678',
    label: '我',
    parentId: null,
    childrenIds: ['d1', 'd2', 'd3'],
    teamUsd: 86_400,
    dailyNewUsd: 3000,
    personalUsd: 6500,
    directCount: 3,
    teamCount: 12,
    isDirect: false,
  },
  d1: {
    id: 'd1',
    address: '0x1111222233334444555566667777888899990000',
    short: '0x1111…0000',
    label: 'Direct A3',
    parentId: 'me',
    childrenIds: ['d1a'],
    teamUsd: 41_400,
    dailyNewUsd: 1200,
    personalUsd: 2100,
    directCount: 1,
    teamCount: 5,
    isDirect: true,
  },
  d2: {
    id: 'd2',
    address: '0xaaaabbbbccccddddeeeeffff0011223344556677',
    short: '0xAAaa…6677',
    label: 'Downline B1',
    parentId: 'me',
    childrenIds: [],
    teamUsd: 28_000,
    dailyNewUsd: 900,
    personalUsd: 1500,
    directCount: 0,
    teamCount: 4,
    isDirect: true,
  },
  d3: {
    id: 'd3',
    address: '0xbb11223344556677889900aabbccddeeff001122',
    short: '0xBb11…1122',
    label: 'Downline B2',
    parentId: 'me',
    childrenIds: ['d3a', 'd3b'],
    teamUsd: 17_000,
    dailyNewUsd: 900,
    personalUsd: 800,
    directCount: 2,
    teamCount: 3,
    isDirect: true,
  },
  d1a: {
    id: 'd1a',
    address: '0xabcdef1234567890abcdef1234567890abcdef01',
    short: '0xAbCd…Ef01',
    label: 'A3-1',
    parentId: 'd1',
    childrenIds: [],
    teamUsd: 12_000,
    dailyNewUsd: 400,
    personalUsd: 500,
    directCount: 0,
    teamCount: 2,
    isDirect: false,
  },
  d3a: {
    id: 'd3a',
    address: '0x9876543210fedcba9876543210fedcba98765432',
    short: '0x9876…5432',
    label: 'B2-1',
    parentId: 'd3',
    childrenIds: [],
    teamUsd: 8000,
    dailyNewUsd: 300,
    personalUsd: 400,
    directCount: 0,
    teamCount: 1,
    isDirect: false,
  },
  d3b: {
    id: 'd3b',
    address: '0xcc223344556677889900aabbccddeeff00112233',
    short: '0xCc22…2233',
    label: 'B2-2',
    parentId: 'd3',
    childrenIds: [],
    teamUsd: 8200,
    dailyNewUsd: 350,
    personalUsd: 350,
    directCount: 0,
    teamCount: 1,
    isDirect: false,
  },
};

export function partnerTeamDepth(nodes: Record<string, PartnerTeamNode>, nodeId: string): number {
  let depth = 0;
  let id = nodeId;
  while (id !== 'me') {
    const node = nodes[id];
    if (!node?.parentId) return depth;
    depth += 1;
    id = node.parentId;
  }
  return depth;
}
