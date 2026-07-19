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

// d3finance@hotmail.com — the org "Root user" (backend API user, id 5eba34d3). It is
// NOT part of the root quorum (DA/Ye/DADA, threshold 2) and has NO standalone rights
// (Turnkey denies it create-tag/wallet/policy → needs 2/3 root approval).
//
// The operator policy below grants an "operators" USER TAG single-approver rights, so
// you manage who is an operator by adding/removing users from the tag — no policy edit.
// STEP 1: create a user tag named "operators" and add d3finance (5eba34d3) — this is a
//         governance change, so the 2/3 root quorum must approve it.
// STEP 2: replace <OPERATORS_TAG_ID> below with the created tag's id.
// Settlement token the operators may move. TEST env uses the faucet USDT below;
// at mainnet launch switch to real BSC USDT 0x55d398326f99059fF775485246999027B3197955.
const SETTLEMENT_USDT = '0xE763F2dF7C8aDF28eAa34683245e3a6f82fC2512';
// Fill after the root quorum creates the "operators" user tag (adds d3finance 5eba34d3).
const OPERATORS_TAG_ID = '<OPERATORS_TAG_ID>';

export const CURATED_POLICIES: PolicyItem[] = [
  // ── operators tag: least-privilege day-to-day (Turnkey best practice) ──────────
  // Positive ALLOWLIST (not "!= treasury"): operators can only move the settlement
  // token, so treasury + arbitrary-contract calls are out of reach. Manage who is an
  // operator via tag membership — no policy edits. Raise count() to >= 2 for 2-person
  // sign-off on larger flows.
  {
    id: 'operator-usdt-transfer',
    status: 'todo',
    descZh:
      '操作人（operators 标签，含 d3finance / 5eba34d3）可批准「只发给 USDT 合约」的热钱包转账。正向白名单——国库出款、调用任意合约都做不到。金额大可把 count() 改成 >= 2（两人共签）。',
    body: {
      policyName: 'd3-operator-usdt-transfer',
      effect: 'EFFECT_ALLOW',
      condition: `eth.tx.to == '${SETTLEMENT_USDT}'`,
      consensus: `approvers.filter(user, user.tags.contains('${OPERATORS_TAG_ID}')).count() >= 1`,
    },
  },
  {
    id: 'operator-create-wallet',
    status: 'todo',
    descZh:
      '（可选）操作人可创建钱包 / 子账户（建清算钱包等）。不含任何出款权限。不需要就别应用这条。',
    body: {
      policyName: 'd3-operator-create-wallet',
      effect: 'EFFECT_ALLOW',
      condition: "activity.kind == 'CREATE_WALLET' || activity.kind == 'CREATE_WALLET_ACCOUNTS'",
      consensus: `approvers.filter(user, user.tags.contains('${OPERATORS_TAG_ID}')).count() >= 1`,
    },
  },
  {
    id: 'deny-operator-governance',
    status: 'todo',
    descZh:
      '兜底 DENY：禁止 operators 碰治理（创建/改/删策略）。DENY 压过一切 ALLOW，防止操作人自我提权——治理只能走 2/3 根签名人。',
    body: {
      policyName: 'd3-deny-operator-governance',
      effect: 'EFFECT_DENY',
      condition:
        "activity.kind == 'CREATE_POLICY' || activity.kind == 'UPDATE_POLICY' || activity.kind == 'DELETE_POLICY'",
      consensus: `approvers.filter(user, user.tags.contains('${OPERATORS_TAG_ID}')).count() >= 1`,
    },
  },
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
