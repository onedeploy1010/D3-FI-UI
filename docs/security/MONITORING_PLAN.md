# D3-FI 安全监控 / 熔断 / 告警推送 / 部署前检查 — 构建计划

在已部署的 `system_pause_flags` / `risk_limits` 基础上,新增:监控告警引擎、告警推送(Telegram/Slack）、admin-panel 熔断与告警界面、部署前安全检查脚本。

## 固定契约(4 个 agent 遵守,文件不重叠)

### 迁移(仅 Agent N 写)
- `042_security_alerts.sql`：`security_alerts(id uuid pk, severity text check in ('P0','P1','P2','P3'), rule_id text not null, title text, detail jsonb, entity_type text, entity_id text, status text default 'open' check in ('open','ack','resolved'), auto_paused boolean default false, created_at timestamptz default now(), acknowledged_by uuid, acknowledged_at timestamptz)`。RLS + revoke anon/authenticated + grant service_role。去重：同一 `rule_id` 存在 `open` 记录时不重复插入。

### 通知环境变量(Agent N 加入 `.env.example`,非真实密钥)
`SECURITY_TELEGRAM_BOT_TOKEN`、`SECURITY_TELEGRAM_CHAT_ID`、`SECURITY_SLACK_WEBHOOK_URL`、`SECURITY_ALERT_MIN_SEVERITY`(默认 `P1`)。未配置则跳过推送、仅落库。推送内容不得含私钥/完整 key/JWT/DB 密码。

### 管理端安全 API(Agent O 在 `admin/index.ts` 实现;Agent P 的 UI 消费)
全部前缀 `/security/*`,需 admin(读:任意 admin;写:`security.write` 或 superadmin):
- `GET /security/overview` → `{ pauseFlags:[{flag,paused,reason,updated_at}], limits:risk_limits, solvency:{ratio,liabilityUsdt,flashSwapReserveUsdt,healthy}, alertCounts:{P0,P1,P2,P3} }`
- `GET /security/alerts?status=&severity=` → 列表
- `POST /security/alerts/:id/ack` → 置 ack
- `POST /security/pause` `{flag,reason}` → **单人即时**置 `paused=true`(可逆保守动作,写审计)
- `POST /security/unpause` `{flag,reason}` → **maker-checker**:`createApproval(action='security.unpause', payload:{flag})`;第二位不同 admin 经 `/approvals/:id/approve` 执行(O 扩展审批执行器识别该 action)
- `GET /security/limits` / `PATCH /security/limits` → **maker-checker**(action=`risk_limits.update`)
恢复(unpause）与改限额须双人审批;暂停可单人即时。复用现有 `createApproval`/`claimApproval`/审批执行器。

### 监控规则(Agent N 的 `runSecurityScan(sb)`,由 treasury `/internal/security-scan` cron 触发)
- P0 偿付率击穿:`computeSolvency().healthy===false` 或 `ratio< minRatio` → 告警 + **自动暂停** `flash_swap`(置 `system_pause_flags`,`auto_paused=true`)。
- P1 平台每小时闪兑量 > `risk_limits.max_platform_hourly_usdt` → 告警。
- P1 D3 价格:`expires_at` 过期 或 相对 `previous_price_usdt` 偏差 > `max_deviation_pct` → 告警。
- P1 充值异常:近窗口重复 tx_hash / 突增 → 告警。
- P2 后台:`admin_action_approvals` 存在 pending;近窗口高危 admin 审计 → 告警。
- 信息:任一 `system_pause_flags.paused=true` 持续存在 → 提示。
去重后落 `security_alerts`,`>= SECURITY_ALERT_MIN_SEVERITY` 经 notifier 推送。

## 文件归属(互不重叠)
- **N 监控引擎/通知/表/cron**:`_shared/securityMonitor.ts`(新)、`_shared/notifier.ts`(新)、`_shared/securityAlerts.ts`(新)、`migrations/042_security_alerts.sql`(新)、`treasury/index.ts`(加 `/internal/security-scan` 路由)、`.env.example`、tests。
- **O 管理端安全 API**:`admin/index.ts`、tests。
- **P admin-panel 界面**:`admin-panel/src/pages/admin/security.tsx`(新)、`admin-panel/src/lib/adminApi.ts`、`admin-panel/src/App.tsx`(路由)、`admin-panel/src/components/admin-layout.tsx`(导航项)。
- **Q 部署前检查**:`scripts/security-preflight.ts`(新)、`package.json`(加 `security:preflight`)、`docs/security/PREFLIGHT.md`。

## 规则
1. 不改 `.env`(只改 `.env.example` 模板);不加明文密钥;推送内容脱敏。
2. Deno 边缘模块用 vitest 契约(`vitest.security.config.ts`)测纯逻辑;不可导入的路由/UI 用纯 helper 抽取测试。
3. agent 不执行 git;编排者最后统一提交推送。
4. 暂停可单人即时;恢复(unpause)与改限额须 maker-checker。
