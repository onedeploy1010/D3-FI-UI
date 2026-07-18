# D3 系统参数上链 —— 设计文档与分阶段落地计划（v1）

> 目标：把系统的**规则参数**（定价、轮次、出局倍数、利率、费率、档位比例…）从"散落在代码常量 / DB 配置"
> 收敛为**链上唯一真源**，改参数必须**多签**，链下（DB）作为**可对账的缓存**执行。
> 与现有架构一脉相承：`ReferralRegistry`（关系上链）、`DailyStateAnchor`（余额锚定）、Turnkey 多签。
> 链：BNB Smart Chain（56）　签名：Turnkey　参考：`docs/D3-链上链下架构与推荐绑定合约设计.md` §4、`docs/D3-UD3链上记账-优化方案与风险plan.md` §P3

---

## 0. 现状与动机

**现状**：规则参数分散在三处，任何一处都能被"悄悄改"而无审计：
- 前端常量：`partnerData.ts`（`CROWDFUND_UNIT_PRICE_USDT=5`、`PRIVATE_SALE_ROUNDS`、`STAKE_EXIT_MULTIPLIER_*`、`DAILY_YIELD_PCT=0.4`、`FLASH_SWAP_FEE_PCT=3`、`PARTNER_ENTRY_USDT=5000`…）
- 后端常量/引擎：`partnerUd3Rules.ts`（S1–S6 档位比例）、`partnerSettlement.ts`
- DB 配置表：`d3_price_settings`（管理员可改，仅应用层保护）

**动机**：这些是"游戏规则"。上链后 → 改规则**可公开审计 + 必须多签**，杜绝运营方（或被攻破的后端）单方面改价/改倍数/改费率。

---

## 1. 参数清单（哪些上链）

| 分组 | 参数 | 现值 | 现位置 |
|---|---|---|---|
| **定价** | `d3PriceUsdt`（管理价，未来可切预言机） | 5 | `d3_price_settings` |
| **私募轮次** | `rounds[]` = {d3额度, 单价} × 4 | 500万@5/6/7/8 | `PRIVATE_SALE_ROUNDS` |
| **出局倍数** | `exitMultUsdt` / `exitMultUd3` | 6× / 2× | `STAKE_EXIT_MULTIPLIER_*` |
| **利率** | `dailyYieldBps`（日息） | 0.4%（40 bps） | `DAILY_YIELD_PCT` |
| **费率** | `flashSwapFeeBps` | 3%（300 bps） | `FLASH_SWAP_FEE_PCT` |
| **入盟** | `partnerEntryUsdt` | 5000 | `PARTNER_ENTRY_USDT` |
| **UD3 档位** | `tierRateBps[S1..S6]` | 100%–150% | `partnerUd3Rules.UD3_TIERS` |
| **偿付** | `solvencyMinRatioBps` | 1.0 | `solvency.ts` |
| **分账** | `settlementToFlashSwapBps` | 10% | `partnerSettlement` |

> **口径统一**：所有百分比用 **bps（万分之一）** 存 `uint`，所有价格用 **1e6 定点**（避免浮点）。链下读出后再换算。

---

## 2. 总体架构

```
链上 SystemParams（唯一真源，改动多签）
   │  setter → emit ParamsUpdated(version, keyHash, value, effectiveFrom)
   ▼
后端事件同步器 (systemParamsSync.ts)
   │  监听 ParamsUpdated → upsert 到 DB system_params 表（带 version / effective_from）
   ▼
DB system_params（可对账缓存）
   │  d3Price.ts / partnerSettlement.ts / partnerUd3Rules.ts 只读这里（毫秒级）
   ▼
每日结算：把"当日生效参数集合的哈希"写进 DailyStateAnchor → 参数也可自证
```

**三条铁律**
1. **链上是真源**，DB 是缓存（可从事件重建，和 `referrals` 表同理）。
2. **执行读 DB**（快、便宜），但**定期校验 DB==链上**，不一致则告警 / fail-closed。
3. **订单锁定下单时的参数版本**（已在做：`d3_price_at_stake`、`exit_multiplier` 存在头寸行上）。

---

## 3. 合约设计（`contracts/src/SystemParams.sol`）

**要点：改的是数据不是逻辑 → 不需要 UUPS**，只需 `AccessControl` + 角色化 setter + 事件 + version。
（UUPS 留给需要"升级逻辑"的 `ReferralRegistry`。）

```solidity
interface ISystemParams {
    // 通用 KV（bps / 1e6 定点 / 计数），键为 keccak256("d3PriceUsdt") 等
    event ParamUpdated(bytes32 indexed key, uint256 oldValue, uint256 newValue, uint64 effectiveFrom, uint64 version);
    event RoundsUpdated(uint64 version, uint64 effectiveFrom);

    function getUint(bytes32 key) external view returns (uint256);
    function version() external view returns (uint64);       // 全局单调递增
    function rounds() external view returns (Round[] memory); // 私募轮次表

    // 角色化 setter：onlyRole(PARAM_ADMIN)，PARAM_ADMIN = 多签
    function setUint(bytes32 key, uint256 value, uint64 effectiveFrom) external;
    function setUintBatch(bytes32[] calldata keys, uint256[] calldata values, uint64 effectiveFrom) external;
    function setRounds(Round[] calldata rounds_, uint64 effectiveFrom) external;
}
struct Round { uint128 d3Amount; uint64 priceUsdt1e6; }
```

- `PARAM_ADMIN_ROLE` 由 **Turnkey 多签地址**持有；`DEFAULT_ADMIN_ROLE` 同样多签（管角色）。
- `effectiveFrom`（时间戳/区块）：支持"预告生效"，避免改价瞬间影响在途订单。
- `version` 单调递增：DB 缓存与结算锚定都引用它。
- 每次改动 `emit` → 后端可重建、任何人可审计。
- **不设**任何"后端热钱包可调"的 setter —— setter 只认 `PARAM_ADMIN`（多签）。

---

## 4. 多签与 Turnkey 合约签名

Turnkey **已支持合约调用签名**（本仓库 `turnkey.sendContractCall` 已用于 DailyStateAnchor 锚定）。两种多签落地：

| 方案 | 说明 | 何时选 |
|---|---|---|
| **A. Turnkey 组织 quorum（off-chain M-of-N）** | 一个持 `PARAM_ADMIN` 的 EOA，其签名需 Turnkey 内 N 个 root user 批准才产生。链上单签名，但产生需多人。**复用现有金库 quorum**。 | 先做，成本低 |
| **B. 链上多签（Gnosis Safe）** | Safe 作 `PARAM_ADMIN`，多个 Turnkey 钱包为签名人。链上可审计真多签。 | 需更强审计时 |

**Turnkey Policy（关键）**：给后端热钱包用户配置策略——
- ✅ 允许调 `DailyStateAnchor.anchor`（现有）
- ❌ **禁止**调 `SystemParams.set*`（`eth.tx.to == SystemParams && selector ∈ setters` → deny）
- 改参数走单独的多签签名流程（`turnkey:policies` 脚本扩展）。

→ 达到"后端能锚定、能出款，但**改规则只能多签**"。

---

## 5. 后端同步与执行

**新增 `supabase/functions/_shared/systemParams.ts`**（对标 `referralRegistry.ts` 的 chain-sync）：
- `syncSystemParamsFromChain()`：从 `chain_sync_cursors` 游标起，拉 `ParamUpdated`/`RoundsUpdated` 事件 → upsert `system_params` 表（key, value, version, effective_from, tx_hash）。cron 定时 + 关键路径可即时触发。
- `getParam(key)` / `getRounds()`：读 DB 缓存（快）。`d3Price.ts` 的 `AdminConstPriceSource` 改为 `OnchainParamSource`（读 `system_params`）。
- `verifyParamsAgainstChain()`：定期对账 DB==链上；不一致 → 告警 + 可选 fail-closed（拒绝结算直到一致）。

**DB 迁移**（`migration 05x_system_params.sql`）：
```sql
create table public.system_params (
  key           text primary key,     -- 'd3PriceUsdt' 等
  value_1e6     numeric not null,      -- 定点值
  version       bigint not null,
  effective_from timestamptz not null default now(),
  tx_hash       text,
  updated_at    timestamptz not null default now()
);
create table public.system_param_rounds ( idx int primary key, d3_amount numeric, price_1e6 numeric, version bigint );
```

**结算锚定**：`runDailyPartnerSettlement` 计算当日 `paramsVersion` + `paramsHash`，写进 `daily_state_anchors`（或 leaf），使"当日用了哪套参数"可自证。

---

## 6. 参数变更 SOP（改价示例）

1. 提案：多签成员在管理端发起 `setUint("d3PriceUsdt", 6e6, effectiveFrom)`。
2. Turnkey quorum（或 Safe）N 人批准 → 广播交易。
3. 链上 `emit ParamUpdated(...)`。
4. 后端同步器捕获 → 更新 `system_params`（新 version）。
5. 系统在 `effectiveFrom` 后按新价执行；在途订单已锁旧价（`d3_price_at_stake`）。
6. 次日锚定含新 `paramsVersion`。

---

## 7. 安全风险 + 缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| DB 缓存被改/过期 → 按错参数执行 | 高 | 定期 `verifyParamsAgainstChain` + 结算读 version + 不匹配 fail-closed |
| 改价瞬间在途订单口径错乱 | 中 | `effectiveFrom` 预告生效 + 订单锁定下单版本（已做） |
| 后端热钱包被攻破去改参数 | 高 | Turnkey policy 禁 setter；只多签可调 |
| RPC 故障读不到链 | 中 | DB 缓存兜底 + 事件重放补齐游标 |
| 定点/bps 换算错误 | 中 | 统一口径 + 单测覆盖换算 + 边界值 |
| 多签私钥/quorum 管理 | 高 | Turnkey N-of-M + 角色最小化 + 变更留事件 |
| 预言机切换（未来）被操纵 | 中 | TWAP + 偏离限速 + 仍可多签回退管理价 |

---

## 8. 分阶段落地计划

| 阶段 | 内容 | 产出 | 风险 |
|---|---|---|---|
| **P0 口径收敛（纯链下，先做）** | 把散落常量收敛为单一 `system_params` DB 表 + `getParam()` 读取层；前后端都改读它 | 零链上、零风险的重构 | 低 |
| **P1 合约** | `SystemParams.sol`（AccessControl + setters + 事件 + version + rounds）+ Foundry 测试 + 部署脚本 | 合约 + 测试网部署 | 中 |
| **P2 事件同步** | `systemParams.ts` 同步器 + `migration 05x` + `d3Price.ts` 切 `OnchainParamSource` + cron | 链上→DB 缓存打通 | 中（涉及定价） |
| **P3 多签接管** | `PARAM_ADMIN` 交给 Turnkey 多签；policy 禁后端调 setter；管理端发起多签改参数流程 | 改参数必须多签 | 中 |
| **P4 对账 + 锚定** | `verifyParamsAgainstChain` 告警 + 结算把 `paramsVersion/Hash` 进锚定 | 参数可自证 + fail-closed | 低 |

> 建议顺序 **P0 → P1 → P2 → P3 → P4**，每阶段可独立上线、随时停。P0 已经能解决"参数散落"，风险为零，最先做。

---

## 9. 迁移与回滚

- **迁移**：P0 先把现有常量/`d3_price_settings` 灌进 `system_params`（一次性脚本）；P2 后由链上事件覆盖。
- **回滚**：`OnchainParamSource` 保留 `AdminConstFallback`——链上/同步异常时回退到 DB 上一版本（loud 告警），不阻断系统。
- **兼容**：订单已锁 `d3_price_at_stake`/`exit_multiplier`，历史订单不受参数变更影响。

---

## 10. 落地检查清单

- [ ] P0：`system_params` 表 + `getParam()` 读取层；前后端切读；旧常量标 `@deprecated`
- [ ] P1：`SystemParams.sol` + 测试（setter 仅 admin、version 单调、rounds 往返、effectiveFrom）
- [ ] P1：部署脚本 + BSC 测试网部署 + 源码验证
- [ ] P2：`systemParams.ts` 同步器 + 游标 + cron；`d3Price.ts` 切链上源
- [ ] P2：一次性把现值上链（`setUintBatch` + `setRounds`）
- [ ] P3：`PARAM_ADMIN` → Turnkey 多签；policy 禁热钱包调 setter；管理端多签流程
- [ ] P4：DB↔链对账告警 + 结算参数哈希进锚定 + fail-closed 开关
- [ ] 回归：改价在途订单口径、RPC 故障兜底、定点换算边界

---

## 附：一句话结论

**先做 P0（DB 单一参数源，零风险）拿到"参数收敛"；再 P1/P2 上 `SystemParams` 合约 + 事件同步把"真源"搬上链；
P3 用 Turnkey 多签接管改参数 + policy 锁死后端；P4 对账 + 锚定让参数也能自证。
不需要 UUPS（改数据不改逻辑），多签复用你现有的 Turnkey quorum 即可起步。**
