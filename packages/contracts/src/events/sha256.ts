/**
 * FIPS 180-4 SHA-256, in TypeScript, with **no imports at all**.
 *
 * WHY NOT `node:crypto`. Three verified reasons, the same shape as the header of `../ids/uuidv7.ts`:
 *
 * 1. It does not typecheck here. Every workspace member declares zero dependencies
 *    (`tools/tests/skeleton.test.mjs`, and `test/enums/package-purity.test.ts` for this package), so
 *    there is no `@types/node`, and `tsconfig.base.json` sets `lib: ["ES2024"]`. Importing
 *    `node:crypto` is `TS2307` unless this package hand-writes an ambient `declare module` — a
 *    repository-wide type assertion authored by a contracts package, checked by no compiler.
 * 2. It would break every downstream consumer. `tsconfig.base.json#paths` maps `@taxrag/contracts`
 *    into this source tree and each member's `include` is its own `src`, so a consumer program
 *    reaching `sign.ts` would need that ambient file in *its* program, where it is not.
 * 3. Web Crypto (`crypto.subtle`), which needs no declaration, is **async** and offers no
 *    constant-time comparator, so it cannot back the synchronous `signWebhook`/`verifyWebhook`
 *    signatures FND-05 deliverable 3 specifies — nor a browser SDK (`PLTF-02`) without an async
 *    sibling API.
 *
 * "Never roll your own crypto" is answered by verification rather than assertion:
 * `test/events/hmac.test.ts` pins this implementation against Node's OpenSSL-backed `node:crypto`
 * (importable from a test file, which is neither typechecked nor covered by the purity test) over
 * every SHA-256 block and padding boundary, plus the published FIPS digests. Weakening that suite
 * makes this file indefensible.
 */

/** The first 32 bits of the fractional parts of the cube roots of the first 64 primes (FIPS 180-4 §4.2.2). */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** The first 32 bits of the fractional parts of the square roots of the first 8 primes (FIPS 180-4 §5.3.3). */
const INITIAL_STATE = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/** SHA-256 digest size in bytes. */
export const SHA256_DIGEST_BYTES = 32;
/** SHA-256 block size in bytes (also HMAC's block size — see ./hmac.ts). */
export const SHA256_BLOCK_BYTES = 64;

const rotr = (value: number, bits: number): number =>
  ((value >>> bits) | (value << (32 - bits))) >>> 0;

/**
 * The SHA-256 digest of `message`, as 32 bytes.
 *
 * `noUncheckedIndexedAccess` makes every index `T | undefined`; the `as number` casts follow the
 * precedent set in `../ids/uuidv7.ts`. `!` is not used — `@typescript-eslint/no-non-null-assertion`
 * is in the recommended set `tools/eslint.config.mjs` enables.
 */
export function sha256(message: Uint8Array): Uint8Array {
  // Padding (FIPS 180-4 §5.1.1): 0x80, then zeros, then the 64-bit big-endian *bit* length.
  const blocks = Math.floor((message.length + 8) / SHA256_BLOCK_BYTES) + 1;
  const padded = new Uint8Array(blocks * SHA256_BLOCK_BYTES);
  padded.set(message, 0);
  padded[message.length] = 0x80;

  // The bit length is `message.length * 8`, which overflows 32 bits past 512 MiB of input. Split it
  // the way ../ids/uuidv7.ts splits its 48-bit timestamp, so nothing is silently truncated.
  const highBits = Math.floor(message.length / 0x2000_0000);
  const lowBits = ((message.length % 0x2000_0000) * 8) >>> 0;
  const lengthAt = padded.length - 8;
  padded[lengthAt] = (highBits >>> 24) & 0xff;
  padded[lengthAt + 1] = (highBits >>> 16) & 0xff;
  padded[lengthAt + 2] = (highBits >>> 8) & 0xff;
  padded[lengthAt + 3] = highBits & 0xff;
  padded[lengthAt + 4] = (lowBits >>> 24) & 0xff;
  padded[lengthAt + 5] = (lowBits >>> 16) & 0xff;
  padded[lengthAt + 6] = (lowBits >>> 8) & 0xff;
  padded[lengthAt + 7] = lowBits & 0xff;

  const state = new Uint32Array(INITIAL_STATE);
  const w = new Uint32Array(64);

  for (let block = 0; block < blocks; block += 1) {
    const at = block * SHA256_BLOCK_BYTES;
    for (let i = 0; i < 16; i += 1) {
      const j = at + i * 4;
      w[i] =
        (((padded[j] as number) << 24) |
          ((padded[j + 1] as number) << 16) |
          ((padded[j + 2] as number) << 8) |
          (padded[j + 3] as number)) >>>
        0;
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] as number;
      const w2 = w[i - 2] as number;
      const s0 = (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0) as number;
    }

    let a = state[0] as number;
    let b = state[1] as number;
    let c = state[2] as number;
    let d = state[3] as number;
    let e = state[4] as number;
    let f = state[5] as number;
    let g = state[6] as number;
    let h = state[7] as number;

    for (let i = 0; i < 64; i += 1) {
      const sigma1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + sigma1 + ch + (K[i] as number) + (w[i] as number)) >>> 0;
      const sigma0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (sigma0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = ((state[0] as number) + a) >>> 0;
    state[1] = ((state[1] as number) + b) >>> 0;
    state[2] = ((state[2] as number) + c) >>> 0;
    state[3] = ((state[3] as number) + d) >>> 0;
    state[4] = ((state[4] as number) + e) >>> 0;
    state[5] = ((state[5] as number) + f) >>> 0;
    state[6] = ((state[6] as number) + g) >>> 0;
    state[7] = ((state[7] as number) + h) >>> 0;
  }

  const digest = new Uint8Array(SHA256_DIGEST_BYTES);
  for (let i = 0; i < 8; i += 1) {
    const word = state[i] as number;
    digest[i * 4] = (word >>> 24) & 0xff;
    digest[i * 4 + 1] = (word >>> 16) & 0xff;
    digest[i * 4 + 2] = (word >>> 8) & 0xff;
    digest[i * 4 + 3] = word & 0xff;
  }
  return digest;
}
