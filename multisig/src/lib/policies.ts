export type PolicyStatus = 'active' | 'todo';

export type PolicyItem = {
  id: string;
  name: string;
  category: string;
  status: PolicyStatus;
  /** 中文说明 — what this policy does and why. */
  descZh: string;
  /** Policy DSL / condition template (reference). */
  template: string;
};

/**
 * Curated reference of D3's Turnkey policies. Status here is a CHECKLIST guess —
 * the authoritative state lives in the Turnkey console. `todo` = 需在 Turnkey 完成/确认.
 */
export const POLICIES: PolicyItem[] = [
  {
    id: 'root-quorum-2of3',
    name: '根签名门槛 2/3',
    category: '根量子 Root Quorum',
    status: 'todo',
    descZh:
      '组织根签名人共 3 位，把门槛从「后端可自动签」提升到「3 人中需 2 人批准」。这是整个金库与合约权限的最终闸门——提升后，任何关键操作都必须 2/3 人工签名。',
    template: 'rootQuorum: { threshold: 2, userIds: [signer1, signer2, signer3] }',
  },
  {
    id: 'backend-proposer-2of3',
    name: '后端发起 · 2/3 批准',
    category: '金库出款',
    status: 'todo',
    descZh:
      '允许后端 API 用户「发起」任意活动（建钱包、发交易、改额度…），但只有 3 个根签名人中 2 人批准后才真正执行。后端能提案，签名权仍握在 3 位人手里。',
    template:
      "policy: d3-backend-proposer-2of3\ncondition: true\nconsensus: approvers.filter(u, u.id in ROOT_IDS).count() >= 2",
  },
  {
    id: 'hot-wallet-bound',
    name: '热钱包出款限额',
    category: '热钱包',
    status: 'todo',
    descZh:
      '给结算 / 闪兑等热钱包设 USDT（ERC20）与 BNB（gas）的单笔/累计上限，超限自动拒签，缩小热钱包一旦被盗的爆炸半径。',
    template: 'ALLOW eth.tx: to == USDT && erc20.amount <= CAP\nALLOW eth.tx: value <= GAS_CAP',
  },
  {
    id: 'anchor-allow',
    name: '允许后端每日锚定',
    category: '防篡改',
    status: 'active',
    descZh:
      '允许后端 gas 钱包调用 DailyStateAnchor.anchor 写入每日余额 Merkle 根（防篡改、可自证）。这是低风险、每天只写一次的操作。',
    template: 'ALLOW eth.tx: to == DailyStateAnchor && selector == anchor()',
  },
  {
    id: 'param-setter-deny',
    name: '禁止后端改系统参数',
    category: '系统参数（规划）',
    status: 'todo',
    descZh:
      '配合《系统参数上链》方案：禁止后端热钱包调用 SystemParams 合约的 set* 方法——改规则（D3 价格 / 出局倍数 / 费率 / 档位）只能走多签，后端只能读不能改。',
    template: 'DENY eth.tx: to == SystemParams && selector in SETTERS',
  },
];
