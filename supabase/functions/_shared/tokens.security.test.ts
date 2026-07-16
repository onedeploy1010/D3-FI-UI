import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * V-20 regression: faucet / TestUSDT token must not be wirable into production accounting.
 *
 * tokens.ts reads BSC_USDT_CONTRACT / ALLOW_FAUCET_TOKEN / BSC_CHAIN_ID at MODULE TOP,
 * so each case sets process.env, then `vi.resetModules()` + fresh `await import()` to
 * re-evaluate the module with that environment.
 */

const REAL_USDT = '0x55d398326f99059fF775485246999027B3197955';
const FAKE_TOKEN = '0x00000000000000000000000000000000deadbeef';

async function loadTokens() {
  const { vi } = await import('vitest');
  vi.resetModules();
  return await import('./tokens.ts');
}

describe('isFaucetTokenAllowed (pure)', () => {
  it('mainnet USDT → true regardless of chain / flag', async () => {
    const { isFaucetTokenAllowed } = await loadTokens();
    expect(isFaucetTokenAllowed(REAL_USDT, 56, false)).toBe(true);
    expect(isFaucetTokenAllowed(REAL_USDT, 56, true)).toBe(true);
    expect(isFaucetTokenAllowed(REAL_USDT.toLowerCase(), 97, false)).toBe(true);
  });

  it('random contract on chain 56 with allowFlag=false → false', async () => {
    const { isFaucetTokenAllowed } = await loadTokens();
    expect(isFaucetTokenAllowed(FAKE_TOKEN, 56, false)).toBe(false);
  });

  it('random contract on mainnet chain 56 even WITH allowFlag → false (mainnet never allows faucet)', async () => {
    const { isFaucetTokenAllowed } = await loadTokens();
    expect(isFaucetTokenAllowed(FAKE_TOKEN, 56, true)).toBe(false);
  });

  it('testnet 97 with allowFlag=true → true', async () => {
    const { isFaucetTokenAllowed } = await loadTokens();
    expect(isFaucetTokenAllowed(FAKE_TOKEN, 97, true)).toBe(true);
  });

  it('testnet 97 with allowFlag=false → false', async () => {
    const { isFaucetTokenAllowed } = await loadTokens();
    expect(isFaucetTokenAllowed(FAKE_TOKEN, 97, false)).toBe(false);
  });
});

describe('assertSettlementTokenSafe', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.BSC_USDT_CONTRACT;
    delete process.env.ALLOW_FAUCET_TOKEN;
    delete process.env.BSC_CHAIN_ID;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('real USDT → does not throw', async () => {
    process.env.BSC_USDT_CONTRACT = REAL_USDT;
    const { assertSettlementTokenSafe } = await loadTokens();
    expect(() => assertSettlementTokenSafe()).not.toThrow();
  });

  it('default (no env) resolves to real USDT → does not throw', async () => {
    const { assertSettlementTokenSafe } = await loadTokens();
    expect(() => assertSettlementTokenSafe()).not.toThrow();
  });

  it('fake token, no ALLOW flag → throws HttpError(503)', async () => {
    process.env.BSC_USDT_CONTRACT = FAKE_TOKEN;
    const { assertSettlementTokenSafe } = await loadTokens();
    try {
      assertSettlementTokenSafe();
      throw new Error('expected assertSettlementTokenSafe to throw');
    } catch (e: any) {
      expect(e.status).toBe(503);
      expect(String(e.message)).toContain(FAKE_TOKEN);
    }
  });

  it('fake token + ALLOW_FAUCET_TOKEN=true but default mainnet chain 56 → STILL throws', async () => {
    // Documented rule: the flag alone is not enough; a faucet token is permitted ONLY on a
    // known testnet chain. On mainnet chain 56 it always throws.
    process.env.BSC_USDT_CONTRACT = FAKE_TOKEN;
    process.env.ALLOW_FAUCET_TOKEN = 'true';
    const { assertSettlementTokenSafe } = await loadTokens();
    expect(() => assertSettlementTokenSafe()).toThrow();
  });

  it('fake token + ALLOW_FAUCET_TOKEN=true + testnet chain 97 → does not throw', async () => {
    process.env.BSC_USDT_CONTRACT = FAKE_TOKEN;
    process.env.ALLOW_FAUCET_TOKEN = 'true';
    process.env.BSC_CHAIN_ID = '97';
    const { assertSettlementTokenSafe } = await loadTokens();
    expect(() => assertSettlementTokenSafe()).not.toThrow();
  });

  it('fake token + testnet chain 97 but ALLOW flag missing → throws', async () => {
    process.env.BSC_USDT_CONTRACT = FAKE_TOKEN;
    process.env.BSC_CHAIN_ID = '97';
    const { assertSettlementTokenSafe } = await loadTokens();
    expect(() => assertSettlementTokenSafe()).toThrow();
  });
});
