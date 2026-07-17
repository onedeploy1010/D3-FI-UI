可以# D3-FI 安全检查清单(上线前 / 上线后 / 安全告警守护)

> 状态图例:`[x]` 已完成并验证 · `[ ]` 待办(需你操作) · `[~]` 已具备能力,需配置/启用
> 关联文档:`REMEDIATION_PLAN.md`(修复计划)、`DB_VERIFICATION.md`(库校验)、`MONITORING_PLAN.md`(监控)、`INCIDENT_RUNBOOK.md`(事件手册)、`D3-FI-安全复检报告.pdf`(v2 总报告)
> **v2 更新(2026-07-17)**:认证已由 Privy 迁移为 **SIWE(EIP-4361)**,已重新审计并线上验证;本次新增待修 R-1…R-11 见下方 A2 与 v2 报告。

---

## 一、上线前安全检查清单(Pre-Launch)

### A. 代码与账本安全(已完成)
- [x] **SIWE 认证(v2)**:登录以钱包签名(EIP-4361)证明所有权,nonce 原子单次消费 + 域名服务端白名单 + HS256 常量时间校验;下游只信任会话令牌主体,不信任任何可伪造请求头。**线上实测:登录 200、无令牌资金路由 401 失败关闭**
- [x] treasury 资金路由已强制认证(SIWE 会话)
- [x] 闪兑先扣后付 + 并发在途唯一约束 + 失败回补(无双花)
- [x] 借记与贷记全部走原子 RPC(消除丢失更新双花)
- [x] 慢确认交易退款门控 + 付款 ≥12 确认深度(无退款双付/浅 reorg)
- [x] D3 价格边界/偏差/时效护栏,失效即拒付
- [x] 充值 report-tx 重放幂等;链上金额独立校验、按合约识别资产
- [x] 奖励/业绩幂等唯一约束;推荐禁自荐
- [x] 后台不可变审计 + 付款类改动双人复核(maker-checker,先锁后执行)
- [x] 金额输入校验、cron 常量时间比较、速率限制、demo 默认关

### A2. v2 复检新增待修(2026-07-17,详见 `D3-FI-安全复检报告.pdf`)
- [ ] R-1(High)重复迁移编号(两个 `038_*`、两个 `042_*`)重命名为唯一编号后再 `db push`
- [ ] R-2(High/须核实)水龙头币作为主网结算资产——测试期有意;上线前钉真实 USDT 并移除 faucet 标志
- [ ] R-3(Med)审批路由按 `action` 校验权限(`security.*`→`security.write`),防越权解除熔断/放宽限额
- [ ] R-4(Med)删除或下线陈旧 `deploy-pages.yml` 第二公开源
- [ ] R-5(Low-Med)`/auth/nonce`、`/auth/verify` 加限流 + nonce 过期清理(防 DoS/表膨胀)
- [ ] R-6(Low-Med)`partner_accounts.pending_ud3` 补 `CHECK ≥ 0`
- [ ] R-7(Low-Med)两阶段结算:`settle_pending_ud3` 成功后再标记 `settled=true`(防少记滞留)
- [ ] R-8(Low)会话令牌加 jti/吊销或缩短 TTL
- [ ] R-9(Low)`.env.example` 补 `SIWE_SESSION_SECRET`/`SIWE_ALLOWED_DOMAINS`/`TREASURY_CRON_SECRET`
- [ ] R-10(Low-Med)链上核实 ReferralRegistry 角色已转多签并 renounce 热 EOA
- [ ] R-11(Info)删除死代码(`credit_ud3_balance`、`privy.ts` 认证导出);`upsertReferralFromChain` 加自荐守卫

### B. 数据库(已部署线上并验证)
- [x] 14 张暴露表启用 RLS(实测 anon 读/写/伪造均 401)
- [x] anon 角色表/序列/函数授权清零
- [x] 5 个原子余额 RPC(security definer)、10 个余额≥0 约束、审计不可变规则、幂等索引
- [x] 风控限额表 + 熔断开关 + 后台审批表 + 告警表
- [ ] 上线前再跑一次 `npm run security:preflight`,要求 `PREFLIGHT: PASS`

### C. 部署(边缘函数/合约/策略 —— 待你执行)
- [ ] 部署边缘函数:`npm run supabase:deploy`(或 `supabase functions deploy union treasury admin market polymarket`)——**合并到 main 不会自动部署函数,修复代码需部署后才在生产生效**
- [ ] 执行收敛后的 Turnkey 签名策略:`npm run turnkey:policies`(V-02)
- [ ] CI 增加 `deno check` 覆盖 `treasury/index.ts`、`union/index.ts`(本机无 Deno,路由文件未运行时测)

### D. 密钥与凭证(承载真实资金前必须)
- [ ] Turnkey root quorum ≥ 2/3,后端用户单方不足以满足(V-04)
- [ ] 金库 quorum key / `PRIVY_TREASURY_AUTH_PRIVATE_KEY` / cosigner key **移出边缘函数环境**,签名下沉独立最小权限服务(V-04)
- [ ] 轮换 `TREASURY_CRON_SECRET`,并移出 pg_cron 作业行明文(改 Vault/函数密钥注入)(V-24)
- [ ] 确认无 `VITE_` 前缀变量是机密(preflight 会检查);服务密钥仅服务端
- [ ] 全部密钥不入 Git(已确认 `.env` 被忽略且不在历史)

### E. 链上合约(承载真实资金前必须)
- [ ] ReferralRegistry:UPGRADER/REBIND/ADMIN 三角色转 Turnkey 多签,renounce 部署热 EOA,UPGRADER 加 timelock(V-22)
- [ ] 结算币:`BSC_USDT_CONTRACT` 钉真实 USDT,并**移除** `ALLOW_MAINNET_FAUCET_TOKEN`(测试期用它放行水龙头币)
- [ ] 链上核实 Turnkey/Safe 的 owner/threshold/policy 与预期一致

### F. 基础设施
- [ ] 数据库/Redis 不公网暴露;管理后台加 IP 白名单/VPN
- [ ] 生产不复用测试凭证;测试环境不接触生产数据
- [ ] 备份 + 灾难恢复演练;关闭调试/Swagger/source-map 泄露

---

## 二、上线后安全检查清单(Post-Launch)

### G. 监控启用(能力已具备,需配置)
- [~] 配置告警推送渠道:`SECURITY_TELEGRAM_BOT_TOKEN`+`SECURITY_TELEGRAM_CHAT_ID` 或 `SECURITY_SLACK_WEBHOOK_URL`,`SECURITY_ALERT_MIN_SEVERITY`(默认 P1)
- [~] pg_cron 定时触发 `POST /treasury/internal/security-scan`(带 `X-Treasury-Cron-Secret`),建议每 5 分钟
- [~] admin-panel「安全中心」页可查看熔断开关、偿付率、限额、告警流

### H. 例行对账(建议频率)
- [ ] 实时:闪兑订单 vs 链上交易;充值事件去重;Turnkey 签名活动
- [ ] 每 5 分钟:闪兑钱包余额/偿付率;队列积压;RPC 同步
- [ ] 每小时:链上充值 vs 内部入账;D3 产出异常;奖励分配总额
- [ ] 每日:全量资金/ D3 账本;金库对账;奖励守恒;质押本金守恒;管理员操作审计;权限变更审计;密钥检查

### I. 运营巡检
- [ ] 每日查看 `security_alerts`(P0/P1 是否清零/已处置)
- [ ] 每日确认 `system_pause_flags` 状态(是否有自动熔断未恢复)
- [ ] 每周复核 admin 审计日志、待审批(maker-checker)队列
- [ ] 定期(建议月度)复扫:`npm run security:preflight` + 依赖漏洞扫描
- [ ] 关注 Turnkey Policy / Safe Owner / 合约 Owner / Root Quorum 任何变更

---

## 三、安全告警守护措施清单(Alert & Guardrails)

### J. 告警规则与等级(已内建于监控引擎)
| 规则 | 触发条件 | 等级 | 自动动作 |
|---|---|---|---|
| 偿付率击穿 | 闪兑储备/负债 < `min_solvency_ratio` | **P0** | **自动暂停 flash_swap** |
| 平台闪兑量激增 | 每小时净支付 > `max_platform_hourly_usdt` | P1 | 告警 + 人工审核 |
| D3 价格异常 | 过期 或 偏差 > `max_deviation_pct` | P1 | 告警(价格失效已拒付) |
| 充值异常 | 24h 内同 tx_hash 多条 / 突增 | P1 | 告警 + 人工核对 |
| 待审批堆积 | 存在 pending maker-checker | P2 | 告警提醒第二审批人 |
| 熔断处于开启 | 任一 pause_flag=true | P3 | 提示 |

> 建议后续扩展(路线图):Treasury 任何出账、Turnkey Policy/Root Quorum 变更、Safe Owner/Threshold 变更、新 Credential 创建、管理员异地/新设备登录、审计日志服务停写 —— 这些属 P0,需接入链上/云监控事件源。

### K. 熔断守护(已具备,可独立暂停)
- [~] 可独立暂停:`flash_swap`(闪兑)、`deposits`(入账)、`settlement`(结算)、`treasury`(金库)、`rewards`(奖励)
- [x] 暂停=单人即时(止血优先);**恢复=双人 maker-checker 审批**(不允许单人解除)
- [x] 偿付率击穿自动暂停闪兑(auto_paused 标记)
- [x] 闪兑扣减前强制 `assertWithdrawAllowed`:单笔/单用户日/平台时 限额 + 偿付率门禁 + 暂停开关

### L. 告警推送与响应
- [~] 渠道:Telegram / Slack(P0/P1 推送;推送内容脱敏,不含私钥/key/JWT/DB 密码)
- [ ] 建议 P0 加电话/SMS 值班(PagerDuty 类),并在告警含:等级/时间/服务/订单/钱包/txHash/异常金额/触发规则/是否已自动暂停/建议动作/审计链接
- [ ] 制定事件响应 Runbook(虚假充值/重复奖励/闪兑钱包被盗/金库异常出账/Turnkey 凭证泄露/管理员被盗/价格源被操纵)——恢复须多人审批

### M. 守护性硬约束(已在数据库层,攻破应用层也拦得住)
- [x] RLS 默认拒绝 + anon 授权清零(应用被绕过也无法直连改库)
- [x] 余额非负 CHECK;审计日志禁改删规则
- [x] 幂等唯一约束(闪兑在途、ledger、收益、UD3 事件、充值 tx_hash)
- [x] 原子借贷记 RPC(并发下不丢更新)

---

### 快速判定门槛
- **测试期(当前)**:A+B 完成、G 配置后即安全运行(水龙头币,无真实资金敞口)。
- **承载真实资金(GO)**:额外完成 C(部署函数/策略)、D(凭证隔离 + quorum)、E(合约角色多签 + 钉真实 USDT),并 `security:preflight` PASS。
