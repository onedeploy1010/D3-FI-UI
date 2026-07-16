# D3-FI 资金安全修复计划（分支 `security/fund-safety-remediation`）

本计划把审计发现的 P0/P1 漏洞拆成 6 个**文件不重叠**的工作流，由并行 agent 实施，每项带 vitest 回归测试。
测试用 `vitest.security.config.ts`（Deno 垫片 + `npm:` 别名）运行：
`npx vitest run --config vitest.security.config.ts`

## 固定契约（所有 agent 必须遵守，避免相互耦合）

### 迁移编号（仅 Agent B 写迁移，独占 031–037）
| 文件 | 内容 | 漏洞 |
|---|---|---|
| `031_enable_rls_lockdown.sql` | 14 张表 `enable row level security` + `revoke all ... from anon, authenticated` | V-19 |
| `032_balance_nonneg_checks.sql` | 账户余额列 `check (... >= 0)` | V-23 |
| `033_idempotency_constraints.sql` | 见下"唯一约束契约" | V-03/V-21 |
| `034_atomic_balance_functions.sql` | 见下"RPC 契约" | V-03/V-06 |
| `035_d3_price_guardrails.sql` | `d3_price_settings` 增列（见下） | V-05 |
| `036_audit_log_immutability.sql` | `audit_logs` 禁 update/delete 规则 | V-24 |
| `037_referrals_no_self.sql` | `referrals` 增 `check (lower(sponsor)<>lower(wallet))` | V-07 |

### 唯一约束契约（033）
- `partner_yield_withdrawals`：部分唯一索引 `unique (wallet_address) where status in ('pending','signing','broadcasted')`（每钱包至多一条在途）。
- `treasury_ledger`：`unique (ledger_type, chain_id, lower(tx_hash), reference_id) where tx_hash is not null`。

### RPC 契约（034，`security definer`，`grant execute ... to service_role`）
- `debit_pending_d3_yield(p_wallet text, p_amount numeric) returns numeric` — 原子 `UPDATE ... SET pending_d3_yield = pending_d3_yield - p_amount WHERE wallet_address=p_wallet AND pending_d3_yield >= p_amount RETURNING pending_d3_yield`；无行更新则 `RAISE EXCEPTION 'INSUFFICIENT_BALANCE'`。
- `credit_pending_d3_yield(p_wallet text, p_amount numeric) returns numeric` — 原子加回（失败补偿）。
- `debit_ud3_balance(p_wallet text, p_amount numeric) returns numeric` — 同上，作用于 `ud3_balance`，不足 `RAISE EXCEPTION 'INSUFFICIENT_BALANCE'`。
- `transfer_ud3(p_from text, p_to text, p_amount numeric) returns numeric` — 单事务内 debit 发送方 + credit 接收方（接收方不存在则 `RAISE EXCEPTION 'RECIPIENT_NOT_FOUND'`），返回发送方新余额。

调用方（C/D）用 `sb.rpc('<name>', {...})`，捕获 `INSUFFICIENT_BALANCE`→`HttpError(400)`；捕获在途唯一冲突→`HttpError(409)`。

### 价格护栏列（035，Agent F 读取）
`d3_price_settings` 增列：`min_price_usdt numeric(18,6)`、`max_price_usdt numeric(18,6)`、`max_deviation_pct numeric(8,4)`、`previous_price_usdt numeric(18,6)`、`expires_at timestamptz`。

### 跨 agent 函数调用（非文件冲突）
- Agent A 在 treasury 资金路由前调用 Agent E 导出的 `assertSettlementTokenSafe()`（来自 `_shared/tokens.ts`）。
- Agent C/D 调用 Agent B 的 RPC（按上述名字）。
- Agent F 读取 Agent B 的 035 列。

## 文件归属（互不重叠）
- **A 认证地基**：`_shared/requireActor.ts`(新)、`_shared/wallet.ts`、`_shared/privy.ts`、`_shared/demo.ts`、`treasury/index.ts`、`union/index.ts` — V-01/F2、V-14、V-15、V-17。
- **B 数据库**：仅 `supabase/migrations/031–037` — V-19、V-23、V-03/21 约束、原子 RPC、V-05 列、V-24、V-07。
- **C 余额原子性**：`_shared/partnerYieldWithdraw.ts`、`_shared/partnerSd3Stake.ts`、`_shared/partnerSd3Transfer.ts`、`_shared/sweep.ts` — V-03、V-06、V-25(原子认领)。
- **D 充值幂等**：`_shared/deposit.ts`、`_shared/partnerPerformance.ts` — V-21。
- **E Turnkey+假币**：`scripts/turnkey-setup-policies.ts`、`_shared/tokens.ts` — V-02、V-20。
- **F D3 价格护栏**：`_shared/d3Price.ts` — V-05。

## 规则
1. 不改生产配置 `.env`；不加明文密钥。
2. 不删业务逻辑，只加固；金融金额修复方向为原子/幂等，不引入浮点回归。
3. 每项加 `*.security.test.ts`（与被测文件同目录或 `test/security/`）。
4. **agent 不执行任何 git 命令**；提交由编排者最后逐项完成。
5. 链上/运维项（V-22 推荐合约转多签并 renounce 热 EOA、root quorum≥2、生产钉真实 USDT、cron secret 轮换/移出 pg_cron 明文）为**部署清单**，不在本代码分支内，单列 `DEPLOYMENT_CHECKLIST.md`。
