# D3 独立多签系统 —— 设计文档与分阶段落地计划（v1）

> 目标：一个**独立**的多签/多方审批系统（与 `admin-panel` 分开，如同 `admin-panel` 与 `client` 各自独立），
> 成员用**钱包地址或邮箱**登录，按角色（**合伙人 / 超级合伙人=项目方**）对事务进行多签审批；
> 合伙人的某些事务（尤其清算钱包→金库的资金动作）需与**项目方联合审批**；
> 并把 **Turnkey 2/3 多签**的待签活动在系统内**查看 + 一键跳转** Turnkey 后台完成签名。
> 复用现有底座，不重造。链：BSC(56)　后端：Supabase　托管签名：Turnkey

---

## 0. 与现有系统的关系（复用什么 / 新增什么）

**复用（已存在、可靠）**
- **原子领取 + 职责分离**：`admin/index.ts` 的 `createApproval / claimApproval（pending→executed 原子翻转）/ assertDifferentApprover`（`_shared/audit.ts`）——抽成共享模块直接用。
- **资金动作闸门**：`_shared/fundManagement.ts`（`proposeTreasuryTransfer → awaiting_consensus → broadcastTreasuryTransfer`，含额度上限/白名单/幂等/proposer≠broadcaster）。
- **Turnkey 共识诊断**：`_shared/turnkeyConsensus.ts`（`getConsensusDiagnostics` 读 2/3 quorum + 待处理 `CONSENSUS_NEEDED` 活动）。
- **邮箱登录**：Supabase Auth（`admin-panel` 已用 `signInWithPassword`）。
- **钱包登录**：`049_siwe_auth.sql` + client 端 SIWE（终端用户已用）。

**新增（现有系统没有）**
- 钱包登录用于**审批人**（admin 目前只有邮箱）。
- **合伙人 / 超级合伙人** 角色（现 RBAC 只有 superadmin/admin/finance/support/auditor）。
- **可配置 M-of-N**（现 maker-checker 硬编码 2 人）。
- **审批队列 UI**（后端 `/approvals` 有数据，但没有可操作的前端）。
- **Turnkey 后台深链跳转**（现只在文案里提"去 Turnkey 批准"，无可点链接）。
- 合伙人↔项目方**联合审批**概念。
- **每合伙人清算钱包**（规划中，受 Turnkey 配额阻塞）。

---

## 1. 范围与非目标

**做**：独立前端 `multisig/`（Vite，仿 `admin-panel` 结构）+ 共享 Supabase 后端（新 edge function `signer` 或扩展现有）+ 新表。审批流 + Turnkey 查看/跳转。

**不做（安全边界）**：这是**应用级多方审批**，**不是**密码学多签替代品。**真金动作的最终闸门仍是 Turnkey 2/3**（本系统只做提案/审批/可视化 + 跳转 Turnkey 签名）。App 审批**单独不能动钱**。详见 §7。

---

## 2. 身份与角色

### 2.1 双重登录（钱包 或 邮箱）
- **钱包**：SIWE（复用 `049_siwe_auth.sql` 思路），合伙人天然用钱包。
- **邮箱**：Supabase Auth，项目方/运营可用邮箱。
- 统一到一张 **`signers`** 表：一个 signer 可绑钱包地址、和/或 `auth.users.id`（邮箱），二者至少其一。登录后解析为同一 `signer_id`。

### 2.2 角色
| 角色 | 谁 | 权限要点 |
|---|---|---|
| `partner`（合伙人） | 每个合伙人 | 发起自己清算钱包相关提案；审批需自己参与的事务 |
| `super_partner`（超级合伙人=项目方） | 项目方 | 对合伙人事务做**联合审批**方；可发起金库级提案；查看 Turnkey 待签 |

> 角色存 `signers.role`（一个 signer 可多角色）。项目方还可在 Turnkey quorum 内持签名权（把 App 角色与链上签名人对齐）。

---

## 3. 架构

```
multisig/ (独立 Vite 前端)
  ├─ 登录：钱包(SIWE) 或 邮箱(Supabase Auth)
  ├─ 提案列表 / 详情 / 审批按钮
  ├─ Turnkey 待签视图 + 跳转按钮
  └─ 调 Supabase edge function `signer`
        │
        ▼
Supabase 后端（共享）
  ├─ edge function `signer`：提案 CRUD / 审批 / 策略校验
  ├─ 复用 admin 审批原语（原子 claim + assertDifferentApprover）
  ├─ 复用 fundManagement（资金动作 → Turnkey）
  └─ 复用 turnkeyConsensus（读 2/3 待签活动）
        │
        ▼
Turnkey 2/3 org quorum（真金闸门）——App 只提案/查看/跳转
```

---

## 4. 数据模型（新迁移 `05x_multisig.sql`）

```sql
-- 审批人（钱包 或 邮箱，至少其一）
create table public.signers (
  id           uuid primary key default gen_random_uuid(),
  wallet_address text unique,               -- SIWE 身份
  user_id      uuid unique,                 -- Supabase auth.users.id（邮箱）
  display_name text,
  roles        text[] not null default '{}',-- {'partner','super_partner'}
  status       text not null default 'active',
  created_at   timestamptz not null default now(),
  check (wallet_address is not null or user_id is not null)
);

-- 可配置 M-of-N 审批策略（按事务类型）
create table public.approval_policies (
  proposal_type text primary key,           -- 'clearing_withdraw' | 'treasury_transfer' | ...
  threshold     int  not null,              -- 需要多少个批准
  required_roles text[] not null default '{}', -- 例如必须含 1 个 super_partner
  self_approve  boolean not null default false
);

-- 提案
create table public.multisig_proposals (
  id           uuid primary key default gen_random_uuid(),
  proposal_type text not null,
  title        text not null,
  payload      jsonb not null,              -- 事务参数（金额/地址/头寸…）
  proposed_by  uuid not null references signers(id),
  status       text not null default 'pending', -- pending|approved|rejected|executing|executed|failed
  turnkey_activity_id text,                 -- 若映射到 Turnkey 待签活动
  created_at   timestamptz not null default now()
);

-- 审批投票（一人一票，防重复/防自批由策略决定）
create table public.multisig_approvals (
  proposal_id  uuid not null references multisig_proposals(id),
  signer_id    uuid not null references signers(id),
  decision     text not null,              -- approve|reject
  reason       text,
  created_at   timestamptz not null default now(),
  primary key (proposal_id, signer_id)
);
```
- RLS 默认拒绝；`signer` edge function 用 service-role 受控读写。
- 计票：`approved` = 满足 `threshold` 且满足 `required_roles`（如"必须含 1 个 super_partner"）。
- 执行：满足后原子翻 `status pending→executing`（复用 claim 模式），再走 applier（对资金类 → `fundManagement`）。

---

## 5. 审批流（合伙人↔项目方联合审批）

**示例：合伙人清算钱包 → 金库归集提现**
1. 合伙人（partner）在 `multisig/` 发起 `clearing_withdraw` 提案（金额、目标=金库）。
2. 策略 `approval_policies['clearing_withdraw'] = { threshold: 2, required_roles: ['super_partner'] }`：需 2 票且**必须含 1 个项目方**。
3. 合伙人本人投 approve（若 `self_approve=true`）+ 项目方（super_partner）approve。
4. 满足 → 提案 `executing` → applier：若是链上资金动作 → `proposeTreasuryTransfer`/对应清算钱包转账 → Turnkey 返回 `CONSENSUS_NEEDED` → 提案存 `turnkey_activity_id`，状态 `awaiting_consensus`。
5. **Turnkey 视图**（§6）显示该待签活动 → 项目方点"去 Turnkey 批准" → 完成 2/3 → 回来广播 → `executed`。

> 事务类型可扩展：`clearing_withdraw` / `treasury_transfer` / `param_change`（配合《系统参数上链》plan）/ `subsidy_payout` 等，每种一条 `approval_policies`。

---

## 6. Turnkey 集成（查看 + 跳转）

- **查看**：`signer` edge function 暴露 `GET /turnkey/pending` → 调 `getConsensusDiagnostics()` 返回 2/3 quorum 成员、后端是否在 quorum、以及所有 `CONSENSUS_NEEDED` 活动（含 `activityId`、fingerprint、类型、发起时间）。前端渲染成"待签清单"。
- **跳转**：每条活动给一个**深链**到 Turnkey 后台。Turnkey 控制台地址形如 `https://app.turnkey.com/dashboard/activity?activityId=<id>&organizationId=<orgId>`（**落地时以 Turnkey 实际 URL 为准，需实测确认**）。前端"去 Turnkey 批准"按钮 `window.open` 该链接。
- **可选**：若审批人 API key 在 quorum 内，`approveActivityByFingerprint` 可让系统内直接投链上批准（谨慎：这等于把一把签名权放进本系统，削弱"独立密钥"隔离——**默认走跳转，不在本系统持签名密钥**）。

---

## 7. 安全（核心边界）

| 主张 | 说明 |
|---|---|
| **App 审批 ≠ 密码学多签** | 本系统的安全 = Supabase 项目 + `signer` 后端的安全。拿到 `service_role` key / DB 写权限的人可伪造审批。 |
| **真金闸门在 Turnkey** | 资金动作最终需 Turnkey 2/3 人工签名（系统内**查看+跳转**，不代持密钥）。App 审批只决定"是否发起 Turnkey 活动"。 |
| `service_role` | 超级后门，绕过 RLS；只在 `signer` edge function 用，绝不进前端。 |
| RLS + 防自批 | `multisig_approvals` 主键 `(proposal_id, signer_id)` 防重复投票；`required_roles` 强制项目方参与；`self_approve` 策略控制能否自投。 |
| 原子执行 | 满足阈值→执行 用 `pending→executing` 原子翻转（复用 `claimApproval`），防并发重复执行。 |
| 审计不可变 | 提案/投票/执行写 append-only 审计（复用现有 `audit_log` 不可变机制）。 |
| 身份对齐 | 钱包 signer 与 Turnkey quorum 签名人尽量同人，App 审批与链上签名可对账。 |
| 限额兜底 | 资金类提案仍受 `fundManagement` 的单笔/日限额 + 目标白名单约束（即使 App 审批通过）。 |

> **一句话**：项目方在本系统里"批准"只是**发起/放行**；钱真正动，还得项目方在 **Turnkey** 里用私钥签到 2/3。两层叠加，Supabase 被攻破也签不出交易。

---

## 8. 分阶段落地计划

| 阶段 | 内容 | 产出 | 风险 |
|---|---|---|---|
| **P0 底座抽取** | 把 admin 审批原语（claim/assertDifferentApprover）抽成 `_shared/approvalEngine.ts`；admin 现流程改用它（等价重构） | 可复用引擎，零行为变化 | 低 |
| **P1 数据 + 角色** | 迁移 `05x_multisig.sql`（signers/policies/proposals/approvals）；`signer` edge function（提案 CRUD + 计票 + 双登录：SIWE + Supabase Auth） | 后端多签 API | 中 |
| **P2 独立前端** | 新 `multisig/` Vite 应用：登录（钱包/邮箱）、提案列表/详情/审批、策略可视化 | 可用的审批台 | 中 |
| **P3 资金事务接线** | `clearing_withdraw` / `treasury_transfer` applier 接 `fundManagement` → Turnkey；提案存 `turnkey_activity_id` | 联合审批真闭环 | 中（涉及钱） |
| **P4 Turnkey 视图 + 跳转** | `GET /turnkey/pending`（`getConsensusDiagnostics`）+ 前端待签清单 + 深链跳转（实测 URL） | Turnkey 可视化 | 低 |
| **P5 清算钱包（依赖 Turnkey 配额）** | partner-join 生成每合伙人清算钱包；下线入金经清算钱包→金库；归集/提现进本审批流 | 每合伙人清算闭环 | 中（被配额阻塞） |

> 建议 **P0→P4** 先做（不依赖清算钱包）；**P5** 待 Turnkey 配额解锁后接入（见记忆：per-partner clearing wallet 规划中、被配额阻塞）。

---

## 9. 落地检查清单

- [ ] P0：`approvalEngine.ts` 抽取；admin maker-checker 回归测试全绿
- [ ] P1：迁移 + `signer` edge function；SIWE 与 Supabase Auth 双登录解析为同一 `signer_id`
- [ ] P1：计票（threshold + required_roles）+ 防自批 + 原子执行 单测
- [ ] P2：`multisig/` 前端（钱包/邮箱登录、提案队列、审批、拒绝、理由）
- [ ] P3：`clearing_withdraw`/`treasury_transfer` applier 接 fundManagement；限额/白名单仍生效
- [ ] P4：Turnkey 待签清单 + 深链（**实测 Turnkey dashboard URL**）
- [ ] P5：每合伙人清算钱包（Turnkey 配额解锁后）
- [ ] 安全：service_role 仅后端、RLS 默认拒绝、审计不可变、App 审批不单独动钱

---

## 附：一句话结论

**做一个独立 `multisig/` 前端 + Supabase `signer` 后端：钱包/邮箱双登录，合伙人/超级合伙人角色，
可配置 M-of-N（强制项目方参与）的联合审批，复用现有 maker-checker 原子引擎与 fundManagement 资金闸门，
并把 Turnkey 2/3 待签活动查看 + 深链跳转进来。真金最终仍由 Turnkey 密钥签名——本系统是治理/审批/可视化前台，不代持密钥。**
