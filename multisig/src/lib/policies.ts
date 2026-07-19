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

// ── identities / constants ────────────────────────────────────────────────────
// Backend API user (d3finance@hotmail.com / "Root user", id 5eba34d3). NOT in the root
// quorum (DA/Ye/DADA, threshold 2); no standalone governance rights.
const BACKEND_USER = '5eba34d3-7b27-4a41-8192-49d80438cb54';
const TREASURY = '0x2802A588F575Cb040487Dc0bD9e45b58c62C3B0B';
// Settlement token. TEST env = faucet USDT below; switch to real BSC USDT at launch.
const SETTLEMENT_USDT = '0xE763F2dF7C8aDF28eAa34683245e3a6f82fC2512';
// The live hot-wallet from-allowlist is ~200 addresses (5 settlement + gas + flash-swap
// + the pooled deposit addresses). Shown as a readable placeholder here; the exact list
// is enumerated inline in the live Turnkey conditions.
const MANAGED_HOT_WALLETS = 'eth.tx.from ∈ 受管热钱包(5 结算 + gas + 闪兑 + ~200 充值地址)';
// Fill after the root quorum creates these user tags.
const OPERATORS_TAG_ID = '<OPERATORS_TAG_ID>';
const CLEARING_TAG_ID = '<CLEARING_TAG_ID>';

export const CURATED_POLICIES: PolicyItem[] = [
  // ══ 当前线上策略（active，从 Turnkey 抄录） ═══════════════════════════════════
  {
    id: 'backend-hot-wallet-sign-broad',
    status: 'active',
    descZh:
      '⚠️ 安全隐患（建议删除或改 DENY）：允许后端对【任何非国库交易】签名——可调用任意合约、把热钱包资金原生转到任意地址。它把下面三条收紧策略全抵消了（ALLOW 叠加）。V-02 本意就是删掉它，但它还活着。',
    body: {
      policyName: 'd3-backend-hot-wallet-sign',
      effect: 'EFFECT_ALLOW',
      condition: `eth.tx.from != '${TREASURY}'`,
      consensus: `approvers.filter(user, user.id == '${BACKEND_USER}').count() >= 1`,
    },
  },
  {
    id: 'backend-manage-wallets',
    status: 'active',
    descZh: '后端建结算/gas/闪兑钱包、派生充值地址；不签交易——安全。',
    body: {
      policyName: 'd3-backend-manage-wallets',
      effect: 'EFFECT_ALLOW',
      condition:
        "activity.type == 'ACTIVITY_TYPE_CREATE_WALLET' || activity.type == 'ACTIVITY_TYPE_CREATE_WALLET_ACCOUNTS'",
      consensus: `approvers.any(user, user.id == '${BACKEND_USER}')`,
    },
  },
  {
    id: 'backend-native-gas',
    status: 'active',
    descZh: 'V-02：后端只做 gas 补给——原生转账、无 calldata、≤0.05 BNB，发起方=受管热钱包。收紧、安全。',
    body: {
      policyName: 'd3-backend-native-gas',
      effect: 'EFFECT_ALLOW',
      condition: `eth.tx.chain_id == 56 && (${MANAGED_HOT_WALLETS}) && eth.tx.data == '0x' && eth.tx.value <= 50000000000000000`,
      consensus: `approvers.any(user, user.id == '${BACKEND_USER}')`,
    },
  },
  {
    id: 'backend-usdt-transfer',
    status: 'active',
    descZh:
      'V-02：后端只签 USDT transfer（chain 56、to=USDT、selector 0xa9059cbb、发起方=受管热钱包；国库不在名单）。收紧、安全。',
    body: {
      policyName: 'd3-backend-usdt-transfer',
      effect: 'EFFECT_ALLOW',
      condition: `eth.tx.chain_id == 56 && eth.tx.to == '${SETTLEMENT_USDT}' && eth.tx.data[0..10] == '0xa9059cbb' && (${MANAGED_HOT_WALLETS})`,
      consensus: `approvers.any(user, user.id == '${BACKEND_USER}')`,
    },
  },
  // ══ 建议修复（todo）：删掉上面那条 broad + 可选 DENY 兜底 ═══════════════════════
  {
    id: 'deny-backend-arbitrary-contract',
    status: 'todo',
    descZh:
      '修复：主要动作是【删除 d3-backend-hot-wallet-sign(broad)】——删掉后隐式拒绝就够了，后端只剩「建钱包 + gas + USDT 转账」三条合法权限。这条 DENY 是双保险：明确禁止后端签「非 USDT-transfer 的合约调用」（DENY 压过 ALLOW）。注意 DENY 挡不住原生转账，所以 broad 那条必须删。',
    body: {
      policyName: 'd3-deny-backend-arbitrary-contract',
      effect: 'EFFECT_DENY',
      condition: `eth.tx.data != '0x' && eth.tx.data[0..10] != '0xa9059cbb'`,
      consensus: `approvers.filter(user, user.id == '${BACKEND_USER}').count() >= 1`,
    },
  },
  // ══ 提案（todo，需 2/3 根签名批准）：operators / clearing 标签 ══════════════════
  // Positive ALLOWLIST (not "!= treasury"): operators can only move the settlement
  // token; manage membership via tag, not policy edits. Raise count() to >= 2 for
  // two-person sign-off on larger flows.
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
  // ── clearing wallets: isolated auto-forward path (合伙人清算钱包) ────────────────
  // 每个合伙人一个清算热钱包，下线入金进来后自动转发到国库/结算。清算签名用独立的
  // clearing tag（专用 API 用户，与 operators 隔离），权限收到最窄：只能 ERC20 转 USDT。
  // 收款方=国库由后端强制校验；即使清算 key 泄漏，钱也只能变成 USDT 转账、进不了黑客地址。
  {
    id: 'clearing-usdt-forward',
    status: 'todo',
    descZh:
      '清算钱包转发：clearing 标签的专用签名用户可自动签「只发给 USDT 合约」的转账（用于把下线入金从清算钱包转到国库）。收款方=国库由后端强制。与 operators 隔离，权限比 operators 还窄——不能建钱包、不能碰治理、不能发原生币或调用任意合约。',
    body: {
      policyName: 'd3-clearing-usdt-forward',
      effect: 'EFFECT_ALLOW',
      condition: `eth.tx.to == '${SETTLEMENT_USDT}'`,
      consensus: `approvers.filter(user, user.tags.contains('${CLEARING_TAG_ID}')).count() >= 1`,
    },
  },
  // ══ 删除 broad 前必须先补的白名单（否则合法合约调用会断） ═══════════════════════
  // ⚠️ broad 那条目前也是【唯一】允许后端做合约调用的策略。删它之前，必须先给所有
  //    合法的后端合约调用各加一条 tight ALLOW，否则会断：
  //      • DailyStateAnchor 每日锚定（下面这条）
  //      • ReferralRegistry adminRebind/setRoot（如后端 gas 钱包代付）
  //    枚举完 + 加好白名单，再删 broad。
  {
    id: 'anchor-allow',
    status: 'todo',
    descZh: '允许后端 gas 钱包调用 DailyStateAnchor 写每日余额 Merkle 根（防篡改、每天一次）。删 broad 前必须先加这条，否则锚定会断。填入 DailyStateAnchor 合约地址。',
    body: {
      policyName: 'd3-anchor-allow',
      effect: 'EFFECT_ALLOW',
      condition: "eth.tx.to == '<DAILY_STATE_ANCHOR_ADDRESS>'",
      consensus: `approvers.any(user, user.id == '${BACKEND_USER}')`,
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
