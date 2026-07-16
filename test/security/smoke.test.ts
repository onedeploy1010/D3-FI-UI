import { describe, it, expect } from 'vitest';

describe('harness smoke', () => {
  it('shims Deno.env and can import a Deno edge module', async () => {
    process.env.BSC_USDT_CONTRACT = '';
    const mod = await import('../../supabase/functions/_shared/tokens.ts');
    expect(mod.BSC_CHAIN_ID).toBe(56);
    expect(mod.BSC_MIN_CONFIRMATIONS).toBe(12);
  });
});
