# Supabase setup — D3 Shareholder Alliance

## 1. Configure environment

Copy keys into `.env` (never commit `.env`):

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY
```

Server uses `SUPABASE_SECRET_KEY` (service role). Client uses publishable key only.

## 2. Run migration

In [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql):

1. Paste and run `supabase/migrations/001_d3_union_schema.sql`
2. Optionally run `supabase/seed.sql` for demo data

Or with Supabase CLI:

```bash
supabase link --project-ref gvyvdnegsxiykxffddwb
supabase db push
```

## 3. Verify connection

```bash
curl http://localhost:3000/api/union/health
```

## Schema overview

| Table | Purpose |
|-------|---------|
| `profiles` | Wallet users (Privy / auth link) |
| `referrals` | Sponsor → downline referral graph |
| `shareholders` | Genesis DT / 发起人股东 |
| `union_lines` | 分线 |
| `team_nodes` | Team tree per line |
| `multisig_wallets` | Line / DAO treasuries (Privy Key Quorum) |
| `committee_members` | 委员会签名人 |
| `multisig_proposals` | 分红 / 发放提案 |
| `multisig_signatures` | 多签签名记录 |
| `usd3_accounts` | USD3 业绩分红资产账户 |
| `d3_accounts` | D3 链上分红账户 |
| `dividend_accruals` | 三路收益明细账 |
| `usd3_transfers` | 转 D3-Fi / 转伞下 |
| `fi_positions` | D3-Fi 投资持仓 |

## API routes (`/api/union/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Supabase connectivity |
| GET | `/profile/:wallet` | Full user bundle |
| POST | `/profile` | Create/update profile + empty accounts |
| POST | `/shareholders/join` | Activate shareholder + optional referral |
| POST | `/usd3/claim` | Claim pending USD3 → account balance |
