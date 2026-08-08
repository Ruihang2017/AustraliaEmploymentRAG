/**
 * Byte codecs and the constant-time comparator used by `./sign.ts`. No imports at all.
 *
 * `Buffer` is deliberately absent: this package ships no `@types/node` (see the header of
 * `./sha256.ts`), so `Buffer` would be an untyped global here. `TextEncoder` is reached through a
 * narrow structural cast, exactly the pattern `../ids/uuidv7.ts` uses for `globalThis.crypto`.
 */

/**
 * `globalThis.TextEncoder`, typed structurally and narrowly to the one method used. A stable global
 * in Node 19+ and in every modern browser; `lib: ["ES2024"]` does not declare it.
 */
const encoder = new (
  globalThis as unknown as {
    TextEncoder: new () => { encode: (input: string) => Uint8Array };
  }
).TextEncoder();

/** UTF-8 bytes of `text`. Never hand-rolled — a hand-rolled encoder is a surrogate-pair bug waiting. */
export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

const HEX_DIGITS = '0123456789abcdef';

/** Lower-case hex — PRD §34.8 specifies *lowercase* hex for `X-AER-Signature`. */
export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i] as number;
    out += (HEX_DIGITS[(byte >>> 4) & 0x0f] as string) + (HEX_DIGITS[byte & 0x0f] as string);
  }
  return out;
}

/** Bytes of a hex string, or `null` when the length is odd or a character is not hex. */
export function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const high = HEX_DIGITS.indexOf(hex[i * 2] as string);
    const low = HEX_DIGITS.indexOf(hex[i * 2 + 1] as string);
    if (high < 0 || low < 0) return null;
    bytes[i] = (high << 4) | low;
  }
  return bytes;
}

/** `a` followed by `b`, at the byte level. Used to build `<timestamp>.` ++ raw body. */
export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Constant-time equality over two byte arrays.
 *
 * The length guard is not a timing leak here: the caller has already pinned both operands to 32
 * bytes through the anchored `v1=[0-9a-f]{64}` header pattern, and a length difference is public
 * anyway. It is a plain `return false` rather than a throw on purpose — `node:crypto.timingSafeEqual`
 * throws on a length mismatch, which would turn a forged input into an unhandled exception (a
 * receiver-side denial of service) instead of a rejection.
 *
 * There is no early `return` inside the loop: an early exit on the first differing byte is precisely
 * the leak this function exists to avoid. The final comparison is on the accumulator, never on a
 * signature or a digest, which is what the static check in `test/events/sign.test.ts` asserts.
 */
export function equalsInConstantTime(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}
