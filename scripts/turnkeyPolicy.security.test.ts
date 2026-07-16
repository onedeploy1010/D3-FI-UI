import { describe, it, expect } from 'vitest';
import {
  buildErc20TransferPolicyCondition,
  buildNativeGasPolicyCondition,
  ERC20_TRANSFER_SELECTOR,
  BSC_CHAIN_ID,
  BSC_USDT_MAINNET_CONTRACT,
} from './turnkey-setup-policies.ts';

/**
 * V-02 regression: the Turnkey hot-wallet policy must NOT allow signing arbitrary
 * transactions. The old condition was just `eth.tx.from != '<treasury>'` (sign anything
 * that isn't treasury). These tests pin the tight replacement conditions.
 */

const HOT = ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'];

describe('buildErc20TransferPolicyCondition', () => {
  const cond = buildErc20TransferPolicyCondition({
    chainId: BSC_CHAIN_ID,
    tokenContract: BSC_USDT_MAINNET_CONTRACT,
    fromWallets: HOT,
  });

  it('pins chain_id 56', () => {
    expect(cond).toContain('eth.tx.chain_id == 56');
  });

  it('pins eth.tx.to to the USDT contract (lowercased)', () => {
    expect(cond).toContain(`eth.tx.to == '${BSC_USDT_MAINNET_CONTRACT.toLowerCase()}'`);
  });

  it('pins the ERC20 transfer selector on the calldata', () => {
    expect(ERC20_TRANSFER_SELECTOR).toBe('0xa9059cbb');
    expect(cond).toContain(ERC20_TRANSFER_SELECTOR);
    expect(cond).toContain(`eth.tx.data[0..10] == '${ERC20_TRANSFER_SELECTOR}'`);
  });

  it('restricts to the managed hot-wallet senders', () => {
    for (const w of HOT) expect(cond).toContain(`eth.tx.from == '${w}'`);
  });

  it('does NOT contain a bare `!=` treasury-only clause (the V-02 hole)', () => {
    expect(cond).not.toContain('!=');
  });

  it('rejects an empty sender allow-list', () => {
    expect(() =>
      buildErc20TransferPolicyCondition({ chainId: 56, tokenContract: BSC_USDT_MAINNET_CONTRACT, fromWallets: [] }),
    ).toThrow();
  });

  it('rejects a non-address token contract', () => {
    expect(() =>
      buildErc20TransferPolicyCondition({ chainId: 56, tokenContract: 'not-an-address', fromWallets: HOT }),
    ).toThrow();
  });
});

describe('buildNativeGasPolicyCondition', () => {
  const cond = buildNativeGasPolicyCondition({ chainId: BSC_CHAIN_ID, fromWallets: HOT, maxValueWei: '50000000000000000' });

  it('pins chain, forbids calldata, and bounds value', () => {
    expect(cond).toContain('eth.tx.chain_id == 56');
    expect(cond).toContain("eth.tx.data == '0x'");
    expect(cond).toContain('eth.tx.value <= 50000000000000000');
  });

  it('does NOT contain a bare `!=` treasury-only clause', () => {
    expect(cond).not.toContain('!=');
  });

  it('rejects a non-numeric wei ceiling', () => {
    expect(() => buildNativeGasPolicyCondition({ chainId: 56, fromWallets: HOT, maxValueWei: '0.05' })).toThrow();
  });
});
