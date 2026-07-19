export type PolicyEffect = 'EFFECT_ALLOW' | 'EFFECT_DENY';

/** Turnkey policy body — matches the createPolicy request shape. */
export type TurnkeyPolicyBody = {
  policyName: string;
  effect: PolicyEffect;
  condition: string;
  consensus: string;
};

export type PolicyStatus = 'active' | 'todo';

export type PolicyItem = {
  id: string;
  status: PolicyStatus;
  /** 中文说明 */
  descZh: string;
  body: TurnkeyPolicyBody;
  custom?: boolean;
};

/** Pretty, always-valid JSON for a Turnkey policy body. */
export function policyJson(body: TurnkeyPolicyBody): string {
  return JSON.stringify(body, null, 2);
}

// The 3 root signers (root quorum, threshold 2) — from the treasury proposer policy.
const ROOT_IDS = [
  'eda9c451-aaef-4488-974c-c3e67baf8dbd',
  '2825481a-5ae2-41a5-90f5-de855640c9a7',
  'c8c18268-8418-4389-899e-db807a48c897',
];
const proposerConsensus = `approvers.filter(user, ${ROOT_IDS.map((id) => `user.id == '${id}'`).join(' || ')}).count() >= 2`;

const USDT = '0x55d398326f99059fF775485246999027B3197955';

export const CURATED_POLICIES: PolicyItem[] = [
  {
    id: 'backend-proposer-2of3',
    status: 'todo',
    descZh: '后端 API 用户可发起任意活动（建钱包 / 发交易 / 改额度…），但只有 3 个根签名人中 2 人批准后才真正执行。',
    body: {
      policyName: 'd3-backend-proposer-2of3',
      effect: 'EFFECT_ALLOW',
      condition: 'true',
      consensus: proposerConsensus,
    },
  },
  {
    id: 'hot-wallet-usdt-only',
    status: 'todo',
    descZh: '热钱包只允许向 USDT 合约发交易，缩小热钱包一旦被盗的爆炸半径。',
    body: {
      policyName: 'd3-hot-wallet-usdt-only',
      effect: 'EFFECT_ALLOW',
      condition: `eth.tx.to == '${USDT}'`,
      consensus: 'approvers.count() >= 1',
    },
  },
  {
    id: 'anchor-allow',
    status: 'active',
    descZh: '允许后端 gas 钱包调用 DailyStateAnchor 写入每日余额 Merkle 根（防篡改、可自证）。低风险、每天只写一次。',
    body: {
      policyName: 'd3-anchor-allow',
      effect: 'EFFECT_ALLOW',
      condition: "eth.tx.to == '<DAILY_STATE_ANCHOR_ADDRESS>'",
      consensus: 'approvers.count() >= 1',
    },
  },
  {
    id: 'param-setter-deny',
    status: 'todo',
    descZh: '禁止后端热钱包调用 SystemParams 合约的 set* 方法——改规则（价格/倍数/费率）只能走多签。',
    body: {
      policyName: 'd3-param-setter-deny',
      effect: 'EFFECT_DENY',
      condition: "eth.tx.to == '<SYSTEM_PARAMS_ADDRESS>'",
      consensus: 'true',
    },
  },
];

// ── Custom templates (persisted locally) ─────────────────────────────────────
const LS_KEY = 'd3ms_custom_policies';

export function loadCustomPolicies(): PolicyItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PolicyItem[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomPolicies(items: PolicyItem[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}
