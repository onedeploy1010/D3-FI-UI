# Turnkey 金库与 Policy 配置指南（D3 合伙人 USDT 流水线）

本文档基于本仓库 `supabase/functions/_shared/` 中的 treasury / sweep 实现，说明 **Turnkey Policy 应加在哪些钱包、如何配置、如何日常管理**，以及 Policy 对 **归集** 与 **闪兑提现** 的影响。

> **重要区分**：本系统有两套「多签」概念，不要混用。
>
> | 系统 | 用途 | 配置位置 |
> |------|------|----------|
> | **Turnkey** | BSC USDT 充值 → 归集 → 金库 / 闪兑 → 收益提现 | Turnkey Dashboard → Policies |
> | **Privy Key Quorum** | 股东线长分红金库（`multisig_wallets`） | Privy Dashboard → Keys and quorums |
>
> 本文只讲 **Turnkey** 侧。

---

## 1. 资金流转总览

```text
用户钱包
   │ USDT 充值
   ▼
[deposit] 用户专属充值地址（HD 派生）
   │ job: deposit_to_settlement  ← deposit 地址签名
   ▼
[settlement] 归集中转钱包（默认 3 个）
   │ job: settlement_to_treasury   ← settlement 签名（约 90%）
   │ job: settlement_to_flash_swap ← settlement 签名（约 10%）
   ├──────────────────┬──────────────────┐
   ▼                  ▼                  │
[treasury] 公司金库      [flash_swap] 闪兑池  │
（只进不出，自动化）      │ job: yield_flash_withdraw
                        │ ← flash_swap 签名
                        ▼
                   合伙人钱包（收益提现）

[gas] Gas 钱包 ──(BNB 补给)──► deposit / settlement / flash_swap
                              （当余额 < 0.0005 BNB 时自动打 Gas）
```

**关键结论：**

- **金库（treasury）在自动化流水线中从不签名**，只作为 **收款方**。
- 归集、闪兑提现的签名发生在：**充值地址、settlement、flash_swap、gas**。
- 金库转出必须 **人工** 在 Turnkey Dashboard（或未来自建 admin 接口）完成。

---

## 2. 钱包类型与环境变量

| `wallet_type` | 角色 | 是否自动签名 | 典型 env 变量 |
|---------------|------|-------------|---------------|
| `deposit_hd` | HD 父钱包，用于批量派生充值地址 | 间接（子地址签名） | `TURNKEY_DEPOSITS_WALLET_ID` / `TURNKEY_DEPOSITS_WALLET_ADDRESS` |
| `deposit` | 用户充值地址 | **是** | 由 HD 派生，存于 `wallet_accounts` |
| `settlement` | 归集中转 | **是** | `TURNKEY_SETTLEMENT_ADDRESSES` + `TURNKEY_SETTLEMENT_WALLET_IDS` |
| `gas` | BNB Gas 补给 | **是** | `TURNKEY_GAS_WALLET_ADDRESS` + `TURNKEY_GAS_WALLET_ID` |
| `flash_swap` | 收益发放池 | **是** | `TURNKEY_FLASH_SWAP_WALLET_ADDRESS` + `TURNKEY_FLASH_SWAP_WALLET_ID` |
| `treasury` | 公司金库 | **否（仅收款）** | `TURNKEY_TREASURY_ADDRESS` + `TURNKEY_TREASURY_WALLET_ID` |

后端通过 `TURNKEY_API_PUBLIC_KEY` / `TURNKEY_API_PRIVATE_KEY` 调用 Turnkey API 的 `sign_transaction`，`signWith` 参数为 **具体链上地址**（见 `turnkey.ts`）。

相关代码：

- 钱包注册：`supabase/functions/_shared/wallets.ts`
- 签名与转账：`supabase/functions/_shared/turnkey.ts`
- 归集流水线：`supabase/functions/_shared/sweep.ts`
- 收益提现：`supabase/functions/_shared/partnerYieldWithdraw.ts`

---

## 3. Policy 加在哪里？

Turnkey 的 Policy 是 **组织级（Organization）** 规则，通过 **Effect（ALLOW / DENY）+ Consensus + Condition** 控制某类 Activity 是否允许、是否需要多人批准。

在 D3 流水线中，需要关注的 Activity 类型：

| Activity | 何时触发 | 影响 |
|----------|----------|------|
| `ACTIVITY_TYPE_CREATE_WALLET` | bootstrap 自动创建 settlement / gas / flash 钱包 | 创建失败 → `CONSENSUS_NEEDED` |
| `ACTIVITY_TYPE_CREATE_WALLET_ACCOUNTS` | 派生用户充值地址（deposit pool） | 地址池耗尽，新用户无法充值 |
| `ACTIVITY_TYPE_SIGN_TRANSACTION_V2` | 每一笔链上 USDT/BNB 转账 | **归集、提现全部卡住** |

### 3.1 推荐策略：分两层

#### 层 A — 运营自动化钱包（必须允许后端 API 自动签名）

适用于：

- 所有 **deposit** 派生地址
- 所有 **settlement** 钱包
- **gas** 钱包
- **flash_swap** 钱包
- **deposit_hd** 父钱包（若需 `create_wallet_accounts`）

**做法：** 在 Turnkey Dashboard → **Policies** 新建 ALLOW 规则，**Consensus = 无需额外批准（1-of-1 或 API 用户单独可执行）**，Condition 限制范围，例如：

```text
Effect:     ALLOW
Activity:   SIGN_TRANSACTION
Consensus:  仅 backend API 用户（或 1/1）
Condition（建议尽量收紧）:
  - signWith 属于「运营钱包组」地址列表
  - 或 destination 在白名单内（settlement 地址、treasury 地址、flash_swap 地址、任意用户 EOA）
  - chain = BSC (eip155:56)
  - contract = BSC USDT 合约（归集/提现）或 native（Gas 补给）
```

> Turnkey Policy 的 Condition 语法以 Dashboard 当前版本为准；原则上是 **只允许签名从运营地址发出、且 Token/链符合预期**。

#### 层 B — 公司金库 treasury（必须人工多签）

适用于：`TURNKEY_TREASURY_ADDRESS` 对应钱包。

**做法：**

```text
Effect:     ALLOW（出站转账）
Activity:   SIGN_TRANSACTION
Consensus:  2-of-N 或 3-of-N（管理员 Passkey + 财务等）
Condition:
  - signWith = 金库地址
  - 可选：destination 白名单（公司运营地址、交易所充值地址等）
  - 可选：单笔金额上限
```

同时建议对金库增加 **DENY 默认规则**（Deny all sign from treasury unless explicit allow），防止 API 用户误签金库出账。

**金库 inbound 不受影响：** `settlement_to_treasury` 是 settlement 钱包签名，金库 Policy **不会阻止资金流入金库**。

---

## 4. 各钱包 Policy 要点（对照本仓库 job 类型）

### 4.1 Deposit 充值地址

| 项目 | 说明 |
|------|------|
| **签名场景** | `deposit_to_settlement`：把用户充值的 USDT 打到 settlement |
| **Policy 要求** | 允许 backend API 对 **每个 deposit 地址** 执行 `SIGN_TRANSACTION` |
| **Destination 建议** | 仅允许转到本 org 的 settlement 地址列表 |
| **常见故障** | Policy 过严 → sweep_jobs 失败，充值卡在 `detected/credited` 后无法归集 |

### 4.2 Settlement 归集中转

| 项目 | 说明 |
|------|------|
| **签名场景** | `settlement_to_treasury`（余额 − 10% 闪兑份额）<br>`settlement_to_flash_swap`（默认 10%，`SETTLEMENT_TO_FLASH_SWAP_PCT`） |
| **Policy 要求** | 允许 settlement 地址签名 USDT 转出 |
| **Destination 建议** | 仅 `TURNKEY_TREASURY_ADDRESS` + `TURNKEY_FLASH_SWAP_WALLET_ADDRESS` |
| **触发门槛** | settlement 余额 ≥ `SETTLEMENT_TO_TREASURY_MIN_USDT`（生产默认 100，测试可设 1） |

### 4.3 Flash Swap 闪兑池

| 项目 | 说明 |
|------|------|
| **签名场景** | `yield_flash_withdraw`：合伙人 USDT 收益提现 |
| **Policy 要求** | 允许 flash_swap 地址签名 USDT 转出 |
| **Destination** | 任意合伙人 EOA（用户提现地址）；可按需设单笔上限 |
| **与金库关系** | 闪兑池资金来自 settlement 拆分，**不是**直接从金库出 |

### 4.4 Gas 钱包

| 项目 | 说明 |
|------|------|
| **签名场景** | 当 deposit/settlement/flash 的 BNB < 0.0005 时，自动转 0.0005 BNB |
| **Policy 要求** | 允许 gas 地址签名 **native BNB** 转账 |
| **Destination** | 本 org 运营钱包地址 |
| **注意** | Gas 不足会导致 **所有 ERC-20 归集/提现失败**（即使 USDT Policy 正确） |

### 4.5 Treasury 公司金库

| 项目 | 说明 |
|------|------|
| **自动化** | **不参与** sweep 签名；metadata 标记 `multisig: true` |
| **Policy 建议** | **禁止** backend API 自动签出；仅人工 quorum 可转出 |
| **入账** | settlement 自动转入，无需金库签名 |
| **出账** | 见下文 §7 |

---

## 5. 后端 API 用户与 Root Quorum 设置

### 5.1 创建专用 API 用户（推荐）

1. Turnkey Dashboard → **Users** → 创建用户，例如 `d3-treasury-bot`
2. 为该用户创建 **API Key**，下载公私钥 → 写入 Supabase Secret：
   ```bash
   supabase secrets set \
     TURNKEY_ORGANIZATION_ID=... \
     TURNKEY_API_PUBLIC_KEY=... \
     TURNKEY_API_PRIVATE_KEY=...
   ```
3. **不要把 API Key 挂在带 Passkey 的管理员用户上**（见 Path C 说明）

### 5.2 Root Quorum 建议

| 成员 | 角色 |
|------|------|
| `d3-treasury-bot`（仅 API Key，无 Passkey） | 自动归集 / 提现签名 |
| 管理员 A（Passkey） | 人工审批、金库出账 |
| 管理员 B（Passkey，可选） | 金库 2-of-3 |
| `it-cosigner`（独立 API Key，可选） | Path C 第二票 |

运营钱包的 Policy：**bot 用户单独 ALLOW**。  
金库出账 Policy：**仅 Passkey 管理员 quorum，不包含 bot**。

---

## 6. 初始化与 Secret 配置步骤

### 6.1 写入 Supabase Edge Function Secrets

参考 `.env.example`（**仅服务端**，不要写进 `VITE_` 前端变量）：

```bash
# 必填
TURNKEY_ORGANIZATION_ID
TURNKEY_API_PUBLIC_KEY
TURNKEY_API_PRIVATE_KEY
TURNKEY_TREASURY_ADDRESS          # 金库地址（提前在 Dashboard 创建）
TURNKEY_TREASURY_WALLET_ID        # 金库 Turnkey wallet UUID

# 若自动创建被 Policy 拦截，手动创建后填入：
TURNKEY_SETTLEMENT_ADDRESSES=0x...,0x...,0x...
TURNKEY_SETTLEMENT_WALLET_IDS=uuid1,uuid2,uuid3
TURNKEY_GAS_WALLET_ADDRESS=0x...
TURNKEY_GAS_WALLET_ID=uuid
TURNKEY_FLASH_SWAP_WALLET_ADDRESS=0x...
TURNKEY_FLASH_SWAP_WALLET_ID=uuid
TURNKEY_DEPOSITS_WALLET_ID=uuid
TURNKEY_DEPOSITS_WALLET_ADDRESS=0x...

# 流水线参数
SETTLEMENT_WALLET_COUNT=3
SETTLEMENT_TO_TREASURY_MIN_USDT=100    # 测试环境可设 1
SETTLEMENT_TO_FLASH_SWAP_PCT=10
TREASURY_CRON_SECRET=随机长密钥
BSC_RPC_URL=https://bsc-dataseed.binance.org
```

### 6.2 Bootstrap 基础设施钱包

```bash
# 配置 cron + 首次 bootstrap
npm run treasury:setup-cron

# 或手动调用（Header: X-Treasury-Cron-Secret）
curl -X POST "$SUPABASE_URL/functions/v1/treasury/admin/bootstrap" \
  -H "X-Treasury-Cron-Secret: $TREASURY_CRON_SECRET"

# 预派生充值地址池
npm run treasury:bootstrap-pool
```

若返回 `CONSENSUS_NEEDED` 警告：在 Dashboard 手动创建钱包，填入上表 env，重新 bootstrap。

### 6.3 部署函数

```bash
npx supabase functions deploy treasury --no-verify-jwt
```

---

## 7. 从金库钱包转出 USDT（人工操作）

**当前代码没有「金库自动出账」接口。** `sweep_jobs` 不存在 `treasury → 外部` 类型。

### 方式一：Turnkey Dashboard（推荐）

1. 登录 [Turnkey Dashboard](https://app.turnkey.com)
2. 找到 `TURNKEY_TREASURY_ADDRESS` 对应钱包
3. 发起 **Send / Transfer**（BSC USDT）
4. 按金库 Policy 配置的 quorum 用 Passkey 审批
5. 在 BSCScan 核对 tx

### 方式二：未来扩展（未实现）

若需程序化出金，需新增 admin 接口 + `sweep_job` 类型，且 Policy 必须 **显式允许** 金库 `signWith` 在严格条件下出账。生产环境不建议让 cron bot 签金库。

---

## 8. Policy 对归集 / 提现的影响矩阵

| 若 Policy 限制… | 归集（deposit→settlement） | settlement→金库/闪兑 | 闪兑提现 | 金库入账 |
|----------------|---------------------------|---------------------|----------|----------|
| deposit 不能 sign | ❌ 卡住 | — | — | — |
| settlement 不能 sign | ✅ 可到 settlement | ❌ 卡住 | — | ❌ 无入账 |
| flash_swap 不能 sign | — | ✅ 闪兑份额卡住 | ❌ 提现失败 | ✅ 金库份额仍可能入账 |
| gas 不能 sign | ❌ 间接全挂 | ❌ 间接全挂 | ❌ 间接全挂 | — |
| 金库 outbound 多签 | — | — | — | ✅ 入账不受影响 |
| create_wallet 需 consensus | ⚠️ 无法自动建钱包 | — | — | — |
| create_wallet_accounts 需 consensus | ⚠️ 无法派生新充值地址 | — | — | — |

失败任务：`sweep_jobs` 重试 3 次后进入 `manual_review`，`partner_yield_withdrawals` 同步标记失败。

---

## 9. CONSENSUS_NEEDED 与 Path C 处理

当 Policy 要求多人批准时，API 返回 `ACTIVITY_STATUS_CONSENSUS_NEEDED`，后端抛出 `CONSENSUS_NEEDED`。

### 9.1 诊断

```bash
npm run treasury:path-c
# 或
curl "$SUPABASE_URL/functions/v1/treasury/admin/turnkey/consensus-status" \
  -H "X-Treasury-Cron-Secret: $TREASURY_CRON_SECRET"
```

### 9.2 自动批准（Path C）

适用场景：root quorum ≥ 2，且 **bot API 用户与管理员 Passkey 不能为同一人**。

```bash
# 配置第二票 API 用户（不能与主 API 同 user）
supabase secrets set \
  TURNKEY_COSIGNER_API_PUBLIC_KEY=... \
  TURNKEY_COSIGNER_API_PRIVATE_KEY=...

npm run treasury:path-c -- approve
```

### 9.3 根治方案

为 **运营钱包** 单独写 ALLOW Policy（bot 用户 1-of-1），避免每次 `sign_transaction` 都走 root quorum。

---

## 10. 日常运维命令

| 操作 | 命令 |
|------|------|
| 流水线（归集+提现） | `POST /treasury/internal/run`，Header `X-Treasury-Cron-Secret`，body `{"maxMonitor":0}` |
| 合伙人日息结算 | `POST /treasury/internal/partner-settlement/run`（`npm run partner:setup-cron` 已配 SGT 0 点） |
| 健康检查 | `GET /treasury/health` |
| 查看基础设施摘要 | health 响应中的 `infrastructure` 字段 |
| Quorum 诊断 | `npm run treasury:path-c` |

Cron 默认每 **1 分钟** 跑一次 pipeline（`scripts/treasury-setup-cron.ts`）。

---

## 11. 推荐 Policy 配置清单（上线前自检）

- [ ] 已创建独立 `d3-treasury-bot` API 用户（无 Passkey）
- [ ] 运营钱包组 ALLOW：`SIGN_TRANSACTION` + `CREATE_WALLET_ACCOUNTS`（按需）
- [ ] deposit / settlement / gas / flash_swap 地址已登记 env 或自动创建成功
- [ ] 金库地址已设 `TURNKEY_TREASURY_ADDRESS`，且 **bot 无金库出账权限**
- [ ] 金库出账 Policy：仅管理员 Passkey quorum（2-of-N）
- [ ] Gas 钱包有足够 BNB（建议常驻 ≥ 0.05 BNB）
- [ ] `TREASURY_CRON_SECRET` 已配置，pg_cron 正常
- [ ] 测试：小额充值 → 等 12 确认 → pipeline → settlement → 金库/闪兑到账
- [ ] 测试：合伙人 `pending_usdt_yield` → 闪兑提现 → flash_swap 出账

---

## 12. 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 充值到账但不归集 | deposit sign Policy / Gas 不足 | 查 `sweep_jobs.error_message`；补 BNB；放宽 deposit Policy |
| settlement 有钱不进金库 | 低于 `SETTLEMENT_TO_TREASURY_MIN_USDT` | 降阈值或等余额累积 |
| 闪兑提现 pending 失败 | flash_swap Policy / 池子 USDT 不足 | 查 settlement→flash 是否成功；查 flash 余额 |
| bootstrap CONSENSUS_NEEDED | 创建钱包需人工批 | Dashboard 创建钱包 + 填 env；或加 CREATE_WALLET ALLOW |
| 403 Partner account required | 用户未入盟 | 与 Turnkey 无关，需完成 partner join |
| API 401 Privy token | 用户接口鉴权 | yield-withdraw 只需 `X-Wallet-Address`，检查是否入盟 |

---

## 13. 与 Privy 股东多签的关系

股东分红使用的是 **Privy `multisig_wallets`**（`union` Edge Function），配置见 `supabase/README.md` §7：

- `PRIVY_LINE_KEY_QUORUM_ID`
- `PRIVY_TREASURY_AUTH_PRIVATE_KEY`

与 Turnkey 公司金库 **完全独立**，修改 Privy quorum **不影响** USDT 归集流水线。

---

## 14. 相关文件索引

| 文件 | 内容 |
|------|------|
| `.env.example` | 全部 Turnkey / treasury 环境变量 |
| `supabase/functions/_shared/wallets.ts` | 钱包 bootstrap 与 `CONSENSUS_HELP` |
| `supabase/functions/_shared/sweep.ts` | 四类 sweep job |
| `supabase/functions/_shared/turnkey.ts` | `sign_transaction` 实现 |
| `supabase/functions/_shared/turnkeyConsensus.ts` | Path C 诊断与批准 |
| `scripts/treasury-setup-cron.ts` | Cron 初始化 |
| `scripts/turnkey-path-c.ts` | 本地 quorum 诊断 CLI |

---

*文档版本：与 `main` 分支 treasury 流水线实现同步。若新增金库出账 admin 接口，请更新 §7。*
