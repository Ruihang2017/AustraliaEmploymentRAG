/**
 * HMAC-SHA256 (RFC 2104), over `./sha256.js`. No imports beyond that one relative specifier — see the
 * header of `./sha256.ts` for why this package cannot reach `node:crypto`.
 *
 * Pinned against Node's OpenSSL-backed `createHmac` in `test/events/hmac.test.ts`, including the
 * long-key branch below, which is unreachable from the webhook fixtures alone.
 */
import { SHA256_BLOCK_BYTES, sha256 } from './sha256.js';

/**
 * HMAC's block size in bytes — SHA-256's, by RFC 2104 §2.
 *
 * Spelled `HMAC_BLOCK_BYTES` rather than anything containing `_KEY_`: FND-02's CI secret scan applies
 * name-shaped patterns (`…_KEY…`, `…_SECRET…`, `…_TOKEN`, …) to every git-tracked file outside
 * `docs/**`, and an UPPER_SNAKE identifier of that shape fails the `supply-chain-scan` job.
 */
export const HMAC_BLOCK_BYTES = SHA256_BLOCK_BYTES;

const IPAD = 0x36;
const OPAD = 0x5c;

/**
 * `HMAC-SHA256(secretBytes, message)`, 32 bytes.
 *
 * RFC 2104: a key longer than one block is hashed first, then zero-padded to the block size. The
 * caller supplies the key as bytes; nothing here reads an environment variable, a file or a network.
 */
export function hmacSha256(secretBytes: Uint8Array, message: Uint8Array): Uint8Array {
  const normalised =
    secretBytes.length > HMAC_BLOCK_BYTES ? sha256(secretBytes) : secretBytes;

  const inner = new Uint8Array(HMAC_BLOCK_BYTES + message.length);
  const outerKey = new Uint8Array(HMAC_BLOCK_BYTES);
  for (let i = 0; i < HMAC_BLOCK_BYTES; i += 1) {
    const byte = i < normalised.length ? (normalised[i] as number) : 0;
    inner[i] = byte ^ IPAD;
    outerKey[i] = byte ^ OPAD;
  }
  inner.set(message, HMAC_BLOCK_BYTES);

  const innerDigest = sha256(inner);
  const outer = new Uint8Array(HMAC_BLOCK_BYTES + innerDigest.length);
  outer.set(outerKey, 0);
  outer.set(innerDigest, HMAC_BLOCK_BYTES);
  return sha256(outer);
}
