# D3-FI 安全事件响应手册(Incident Response Runbook)

> 原则:**先止血(暂停)→ 再取证 → 再修复 → 多人审批恢复**。暂停可单人即时执行;**恢复(unpause)必须双人审批**。
> 工具:admin-panel「安全中心」页 / `POST /admin/security/pause` / `system_pause_flags` / `security_alerts` / 审计日志 `audit_logs`(不可改删)。

## 0. 通用响应流程(所有事件)
1. **止血**:在「安全中心」关闭相关熔断开关(或 `POST /security/pause {flag,reason}`)。
2. **取证**:查 `security_alerts`(触发规则)、`audit_logs`(操作者/前后值)、链上交易、`partner_yield_withdrawals`/`deposit_records`/`treasury_ledger`。
3. **定级**:P0(资金/权限)立即全员 + 电话值班;P1 立即人工审核;P2 当天处理。
4. **修复 + 恢复**:根因修复后,由**第二位管理员**经审批中心 approve `security.unpause` 恢复。
5. **复盘**:记录时间线、影响金额、根因、改进项,更新监控规则/限额。

---

## 1. 虚假 / 重复充值
- **信号**:告警 `deposit_duplicate_tx` / `deposit_burst`;链上充值与内部入账不符。
- **止血**:暂停 `deposits`。
- **核查**:`deposit_records` 按 `(chain_id, tx_hash, log_index)` 去重是否被绕过;`verifyUsdtTransfer` 的合约/金额/确认数;是否假币(核对 `BSC_USDT_CONTRACT` 是否真实 USDT)。
- **处置**:回滚未结算的错误入账;受影响用户单独核对;确认幂等唯一索引仍在。

## 2. 重复奖励 / 业绩虚增
- **信号**:同一 source 多次发奖;`performance_weight` 异常增长。
- **止血**:暂停 `rewards` 与 `settlement`。
- **核查**:`partner_yield_settlements`(position_id+date 唯一)、`partner_ud3_events`(intent 唯一)是否被绕过;是否 report-tx 重放。
- **处置**:冲正重复奖励(记审计);修复幂等门控后恢复。

## 3. 闪兑钱包异常流失 / 被盗
- **信号**:告警 P0 偿付率击穿(**已自动暂停 flash_swap**)、平台每小时闪兑量超限;Swap 钱包余额骤降。
- **止血**:确认 `flash_swap` 已暂停(未暂停则立即暂停);必要时暂停 `treasury`。
- **核查**:`partner_yield_withdrawals` 近窗口订单 vs 链上支付;是否并发双花 / 退款双付;收款地址是否异常;Turnkey 签名活动。
- **处置**:核对原子扣减 + 在途唯一 + 退款门控是否生效;补足储备后**双人审批恢复**;必要时下调 `risk_limits`。

## 4. Treasury 金库异常出账
- **信号**:金库余额下降未匹配内部流水;Safe/Turnkey 权限变更。
- **止血**:暂停 `treasury`;若疑似凭证泄露,走事件 6。
- **核查**:金库出账是否经多签/quorum;是否 `/admin/turnkey/approve-consensus` 被滥用;Owner/Threshold/Policy 是否被改。
- **处置**:冻结自动出账;链上追踪;核实 root quorum≥2 与凭证隔离(V-04)。

## 5. D3 价格源被操纵
- **信号**:告警 `d3_price_stale` / `d3_price_swing`。
- **止血**:价格失效已自动拒付(收益/闪兑);必要时暂停 `settlement`+`flash_swap`。
- **核查**:`d3_price_settings` 最近变更(审计)、偏差是否超 `max_deviation_pct`、`expires_at`。
- **处置**:按可信来源重设价格(须通过护栏 + 双人复核);核对受影响期间的产出/赎回。

## 6. Turnkey / 金库凭证泄露
- **止血**:暂停 `flash_swap`+`treasury`+`settlement`;吊销/轮换泄露的 API key 与 cron secret。
- **核查**:近期 Turnkey 签名活动、Policy 变更、是否任意签名被利用。
- **处置**:提升 root quorum;将金库/cosigner/Privy 密钥移出边缘环境;重新执行收敛策略 `npm run turnkey:policies`。

## 7. 管理员账户被盗 / 越权
- **信号**:异常 IP/新设备登录;高危 admin 审计;maker-checker 被绕过尝试。
- **止血**:吊销该 admin 会话;临时收回 `security.write`/`subsidies.write`。
- **核查**:`audit_logs`(不可改删)全部该 admin 操作;`admin_action_approvals`(是否自审批 —— 已被 `assertDifferentApprover` 拦截)。
- **处置**:回滚其付款类改动;强制改密 + 2FA;复核角色权限最小化。

## 8. 数据库被直接篡改(应用层被绕过)
- **信号**:余额/价格/多签行与账本不符,但无对应 API 审计。
- **止血**:暂停相关资金功能;确认 RLS 生效(anon 应 401)与 service_role key 是否泄露。
- **核查**:余额非负 CHECK、审计不可变规则、幂等唯一约束是否仍在(跑 `npm run security:preflight`);Merkle 锚 `daily_state_anchors` 比对。
- **处置**:若 service_role key 泄露 → 立即轮换;按锚定/账本重算修复。

## 9. RPC 攻击 / reorg
- **止血**:高价值充值提高确认阈值;付款已要求 `≥12` 确认。
- **核查**:多 RPC 交叉验证;`deposit_records` 是否有已入账但被 reorg 的交易。
- **处置**:回冲被 reorg 的入账;充值全回滚为路线图,期间人工盯高额充值。

## 10. 智能合约漏洞
- **止血**:若合约有 pause 则暂停;停止相关链上交互;必要时暂停 `deposits`/`treasury`。
- **核查**:特权角色、升级权、异常 approve/授权。
- **处置**:UUPS 升级前经多签 + timelock;修复后再开放。

---

## 恢复(Resume)标准流程
1. 根因已修复且验证(必要时补 `security:preflight`)。
2. 第一位管理员在「安全中心」发起 unpause(生成待审批)。
3. **第二位不同管理员**在审批中心 approve `security.unpause`(系统强制 `assertDifferentApprover`)。
4. 恢复后 30 分钟内加密盯盘;告警清零后关闭事件。

## 值班与升级
- P0:电话/SMS + Telegram/Slack,全体安全负责人,≤15 分钟响应。
- P1:Telegram/Slack + 邮件,≤1 小时进入人工审核。
- P2:告警中心,当天处理。
- 告警内容脱敏:严禁包含私钥、完整 API key、JWT、DB 密码。
