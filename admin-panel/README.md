# D3 Admin Panel

合伙人计划运营后台：会员、推荐、合伙人、质押、补贴工单。

## 开发

```bash
cd admin-panel
cp .env.example .env   # 填入 Supabase URL + anon key
npm install
npm run dev            # http://localhost:5174
```

## 环境变量

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`（或 `VITE_SUPABASE_ANON_KEY`）

## 管理员账号

1. 在 Supabase Auth 创建用户（邮箱可用 `admin@d3.local` 形式）
2. 在 `admin_users` 表插入对应 `user_id`：

```sql
insert into admin_users (user_id, username, role, permissions)
values (
  '<auth.users.id>',
  'admin',
  'superadmin',
  array['subsidies.write', 'members.read']
);
```

## 部署 Edge Function

```bash
npx supabase functions deploy admin --no-verify-jwt
```

迁移：`supabase/migrations/020_admin_panel.sql`

## 页面

| 路径 | 功能 |
|------|------|
| `/dashboard` | 概览 KPI |
| `/members` | 会员列表 + 详情 |
| `/referrals` | 推荐关系 |
| `/partners` | 合伙人（原节点管理） |
| `/stakes` | USDT / sD3 质押 |
| `/subsidies` | 补贴工单 Helpdesk |
