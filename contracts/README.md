# D3-FI Contracts (Foundry)

BSC contracts for D3-FI:
- **TestUSDT** — faucet mock USDT for staging.
- **ReferralRegistry** — UUPS-upgradeable on-chain referral graph. Users call `bind()`
  directly and pay their own gas (no relay). Admin (Turnkey multisig) can correct a
  binding via `adminRebind(reason)`. Single-upline + anti-cycle enforced on-chain.

See `docs/D3-链上链下架构与推荐绑定合约设计.md`.

## Build & test

```bash
cd contracts
forge build
forge test         # 9 passing for TestUSDT
```

`forge-std` is vendored under `lib/` (git-ignored). If missing:
`git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std`

## TestUSDT

Faucet ERC-20 that mimics BSC USDT (**18 decimals**, symbol `"USDT"`), so the existing
frontend/backend treat it as USDT. Public `claim()` mints 1000 with a 12h per-address
cooldown; `owner` can `mint()` / `setFaucet()`.

### Deploy to BSC mainnet (fake-token staging, chain 56)

```bash
cd contracts
export PRIVATE_KEY=0x<deployer-key-with-a-little-BNB>
export BSC_RPC_URL=https://bsc-dataseed.binance.org
export BSCSCAN_API_KEY=<optional-for-verify>

forge script script/DeployTestUSDT.s.sol \
  --rpc-url "$BSC_RPC_URL" --broadcast --verify
```

The script prints the deployed address and mints 1,000,000 test USDT to the deployer.

## Wire the app to the fake token

After deploy, set `<FAKE>` = deployed TestUSDT address:

**Backend (Supabase Edge secrets):**
```bash
npx supabase secrets set BSC_USDT_CONTRACT=<FAKE>
```
This points the whole deposit → monitor → sweep → verify pipeline at the fake token.

**Frontend (Vite env / Netlify):**
```
VITE_BSC_USDT_ADDRESS=<FAKE>
VITE_USDT_IS_FAUCET=true
```
`VITE_USDT_IS_FAUCET=true` enables the `/faketoken` claim page.

## End-to-end test loop

1. Open `/faketoken`, connect wallet, **领取测试 USDT**.
2. Go to `/partner` (or `/d3fi`), start a stake → get a deposit address.
3. Send claimed test USDT to that address → backend credits → 540-day position, daily D3 release.
4. Flash-swap released D3 → USDT from the flash-swap wallet.

> Reminder: on BSC mainnet you still pay real BNB gas (cents) for claim/transfer.
> The fake token itself has no value.
