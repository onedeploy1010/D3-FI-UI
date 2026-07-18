// EIP-55 checksum + BscScan explorer helpers.
//
// Neither `viem` nor `@noble/hashes` is a dependency of admin-panel, so we ship
// a tiny self-contained keccak256 (BigInt-lane Keccak-f[1600]) purely for
// address checksumming. Inputs are 40-hex-char addresses, so throughput is a
// non-issue and correctness/zero-deps win.

const KECCAK_MASK = (1n << 64n) - 1n;

const KECCAK_RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const KECCAK_ROTC = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44];
const KECCAK_PILN = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];

function rotl64(x: bigint, n: number): bigint {
  const b = BigInt(n);
  return ((x << b) | (x >> (64n - b))) & KECCAK_MASK;
}

function keccakF(state: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    // Theta
    const c: bigint[] = new Array(5);
    for (let x = 0; x < 5; x++) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) state[x + y] ^= d;
    }
    // Rho + Pi
    let last = state[1];
    for (let i = 0; i < 24; i++) {
      const j = KECCAK_PILN[i];
      const tmp = state[j];
      state[j] = rotl64(last, KECCAK_ROTC[i]);
      last = tmp;
    }
    // Chi
    for (let y = 0; y < 25; y += 5) {
      const t: bigint[] = [state[y], state[y + 1], state[y + 2], state[y + 3], state[y + 4]];
      for (let x = 0; x < 5; x++) {
        state[y + x] = t[x] ^ ((~t[(x + 1) % 5] & KECCAK_MASK) & t[(x + 2) % 5]);
      }
    }
    // Iota
    state[0] ^= KECCAK_RC[round];
  }
}

/** keccak256 of a byte array → 32-byte Uint8Array. */
export function keccak256(input: Uint8Array): Uint8Array {
  const rate = 136; // bytes (1088-bit rate, 512-bit capacity)
  const state: bigint[] = new Array(25).fill(0n);

  // Absorb with pad10*1 (Keccak domain byte 0x01, final bit 0x80).
  const padded = new Uint8Array(Math.ceil((input.length + 1) / rate) * rate);
  padded.set(input);
  padded[input.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;

  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) {
        lane = (lane << 8n) | BigInt(padded[offset + i * 8 + b]);
      }
      state[i] ^= lane;
    }
    keccakF(state);
  }

  // Squeeze first 32 bytes (little-endian lanes).
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = state[i];
    for (let b = 0; b < 8; b++) {
      out[i * 8 + b] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

const HEX = '0123456789abcdef';
function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const byte of bytes) s += HEX[byte >> 4] + HEX[byte & 15];
  return s;
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * EIP-55 checksum casing for a 20-byte hex address. Returns the input
 * unchanged if it is not a well-formed `0x`-prefixed 40-hex-char address.
 */
export function toChecksumAddress(addr: string): string {
  if (!addr || !ADDR_RE.test(addr.trim())) return addr;
  const lower = addr.trim().slice(2).toLowerCase();
  const hash = toHex(keccak256(new TextEncoder().encode(lower)));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

export function isAddress(addr: string | null | undefined): boolean {
  return !!addr && ADDR_RE.test(addr.trim());
}

const EXPLORER = 'https://bscscan.com';

export function explorerAddressUrl(addr: string): string {
  return `${EXPLORER}/address/${addr}`;
}

export function explorerTxUrl(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}
