# Supabase — D³ Union / D³-Fi

## Keys（不需要额外 KEY）

| 变量 | 用途 |
|------|------|
| `VITE_SUPABASE_URL` | 浏览器 + Edge Function |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 浏览器调用 Function 的 `Authorization` / `apikey` |
| `SUPABASE_SECRET_KEY` | **仅** Supabase Dashboard / Edge Function 密钥，**不要**放进前端 |

Privy 登录后，浏览器把 **Privy access token** 放在 `X-Privy-Token` 请求头；Edge Function 验证后使用 **service role** 读写数据库。

## 1. 数据库迁移

在 [SQL Editor](https://supabase.com/dashboard/project/_/sql) 依次执行 `supabase/migrations/001` … `008`，再运行 `supabase/seed.sql`（可选）。

或 CLI：

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

## 2. 部署 Edge Function `union`

在 Supabase 项目里设置 **Function secrets**（Dashboard → Edge Functions → Secrets）：

```bash
PRIVY_APP_ID=your-privy-app-id
# 可选，默认 https://auth.privy.io/api/v1/apps/{PRIVY_APP_ID}/jwks.json
PRIVY_JWKS_URL=
```

`SUPABASE_URL` 与 `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase 自动注入，无需手动配置。

部署：

```bash
supabase functions deploy union --no-verify-jwt
```

本地调试：

```bash
supabase secrets set PRIVY_APP_ID=your-privy-app-id
supabase functions serve union --no-verify-jwt --env-file .env
```

## 3. 前端环境（Netlify / 本地）

`.env`：

```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_PRIVY_APP_ID=your-privy-app-id
```

Netlify 只需静态构建 `pnpm run build`，**不需要** Node API。所有股东联盟 / D³-Fi 数据走：

`https://xxx.supabase.co/functions/v1/union/*`

## 4. 架构

```
浏览器 (publishable key + Privy token)
    → Supabase Edge Function `union`
        → 验证 Privy JWT
        → service role 读写 Postgres (RLS 由服务端绕过)
```

公开只读（Epoch / Bribe）同样经 Function 的 `GET /protocol`，无需 Privy。

## 5. Function 路由

| Method | Path | 说明 |
|--------|------|------|
| GET | `/health` | 连通性 |
| GET | `/protocol` | 当前 Epoch + Bribe 项目 |
| GET | `/profile/:wallet` | 用户完整 bundle |
| POST | `/profile` | 创建/更新 profile |
| POST | `/shareholders/join` | 加入股东 |
| POST | `/usd3/claim` | 领取 UD3 |
| POST | `/referrals/bind` | 绑定推荐人 |
| GET | `/notifications` | 通知列表 |
| POST | `/notifications/:id/read` | 标记已读 |
| POST | `/notifications/read-all` | 全部已读 |
| POST | `/multisig/proposals` | 发起分红提案 |
| POST | `/multisig/proposals/:id/sign` | 多签 |
| POST/PATCH/DELETE | `/multisig/committee` | 委员会管理 |

## 6. D³-AI

OpenRouter / 行情等仍含密钥，需单独 Edge Function 或保留开发用 Express；与 Union 无关。

## 7. Privy 真多签（Key Quorum + 链上执行）

在 Supabase Secrets 中配置：

```bash
supabase secrets set \
  PRIVY_APP_ID=cmr8vygpn00o20cl5oil97sgj \
  PRIVY_APP_SECRET=privy_app_secret_... \
  PRIVY_LINE_KEY_QUORUM_ID=pz0hdt8qtma7uyhujq1hzdbw \
  PRIVY_TREASURY_AUTH_PRIVATE_KEY='wallet-auth:<Dashboard 创建的私钥>' \
  PRIVY_CHAIN_CAIP2=eip155:56
```

说明：

- `PRIVY_LINE_KEY_QUORUM_ID`：Dashboard → Keys and quorums 里的 **Key quorum ID**（你的是 `pz0hdt8q...`）
- `PRIVY_TREASURY_AUTH_PRIVATE_KEY`：创建 authorization key 时 **一次性下载的私钥**（`wallet-auth:` 前缀）。你贴的 `MIGHAgEA...` 是**公钥**，不能用来签名
- 线长成为股东后，Edge Function 会自动用 quorum 创建 **Privy 金库钱包**（`multisig_wallets.privy_wallet_id`）
- 发起提案 → 委员签名 → 凑够 threshold 个 **Privy authorization signature** → `eth_sendTransaction` 广播到 BSC
- 应用层仍会解锁 UD3 分红状态；链上 tx 为分红发放 attestation（后续可扩展为 ERC20 批量转账）

## 8. 验证

```bash
curl -s "$VITE_SUPABASE_URL/functions/v1/union/health" \
  -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"

curl -s "$VITE_SUPABASE_URL/functions/v1/polymarket/leaderboard?type=top" \
  -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" | head -c 400
```

部署 Polymarket 排行榜（AI 站点「AI排名」）：

```bash
supabase functions deploy polymarket --no-verify-jwt
```

数据来自 `data-api.polymarket.com`，结果缓存于 `market_analysis_cache` 表（5 分钟 TTL）。
