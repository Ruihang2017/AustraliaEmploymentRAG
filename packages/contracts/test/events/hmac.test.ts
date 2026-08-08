/**
 * The crypto pin (FND-05 plan §5.4). This file is what makes a hand-written SHA-256/HMAC defensible:
 * it compares it byte-for-byte against Node's OpenSSL-backed `node:crypto`, an implementation this
 * repository did not write, over every SHA-256 block and padding boundary and both HMAC key branches.
 *
 * A test file may import `node:crypto` freely: `packages/contracts/tsconfig.json` includes only `src`
 * (so tests are not typechecked against the missing `@types/node`) and
 * `test/enums/package-purity.test.ts` scans `src` only. `src/events/**` itself imports nothing.
 *
 * Everything here is deterministic — no `Math.random`, so a failure is always reproducible.
 */
import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { SHA256_BLOCK_BYTES, sha256 } from '../../src/events/sha256.js';
import { HMAC_BLOCK_BYTES, hmacSha256 } from '../../src/events/hmac.js';
import {
  concatBytes,
  equalsInConstantTime,
  fromHex,
  toHex,
  utf8,
} from '../../src/events/bytes.js';
import { fixtureText } from './support/load.js';

const vectors = JSON.parse(fixtureText('hmac-vectors.json')) as {
  sha256: Record<string, string>;
};

/** Deterministic filler: byte i is `i & 0xff`, offset so two lengths never share a prefix pattern. */
function fill(length: number, offset = 0): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) bytes[i] = (i + offset) & 0xff;
  return bytes;
}

const nodeSha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(Buffer.from(bytes)).digest('hex');

const nodeHmac = (key: Uint8Array, message: Uint8Array): string =>
  createHmac('sha256', Buffer.from(key)).update(Buffer.from(message)).digest('hex');

/** Every SHA-256 block and padding boundary: 55/56 and 119/120 are where the length word moves. */
const MESSAGE_LENGTHS = [
  0, 1, 2, 3, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 255, 256, 1000,
];
/** 0 and 64 are edge cases; > 64 takes RFC 2104's "hash the key first" branch. */
const SECRET_LENGTHS = [0, 1, 63, 64, 65, 100];

describe('sha256 (FIPS 180-4)', () => {
  it('matches the committed published digests', () => {
    expect(toHex(sha256(utf8('')))).toBe(vectors.sha256['']);
    expect(toHex(sha256(utf8('abc')))).toBe(vectors.sha256['abc']);
  });

  it('declares the FIPS block size', () => {
    expect(SHA256_BLOCK_BYTES).toBe(64);
    expect(HMAC_BLOCK_BYTES).toBe(64);
    expect(sha256(utf8('abc'))).toHaveLength(32);
  });

  it.each(MESSAGE_LENGTHS)('agrees with node:crypto on a %i-byte message', (length) => {
    const message = fill(length);
    expect(toHex(sha256(message))).toBe(nodeSha256(message));
  });

  it('agrees with node:crypto on multi-byte UTF-8 text', () => {
    const text = 'café — 日本語 \u{1f512} tail';
    expect(utf8(text)).toEqual(new Uint8Array(Buffer.from(text, 'utf8')));
    expect(toHex(sha256(utf8(text)))).toBe(nodeSha256(utf8(text)));
  });

  it('is not vacuous — a one-bit change changes the digest', () => {
    const message = fill(100);
    const flipped = fill(100);
    flipped[50] = (flipped[50] as number) ^ 0x01;
    expect(toHex(sha256(message))).not.toBe(toHex(sha256(flipped)));
  });
});

describe('hmacSha256 (RFC 2104)', () => {
  it.each(SECRET_LENGTHS)(
    'agrees with node:crypto for a %i-byte secret across every message length',
    (secretLength) => {
      const key = fill(secretLength, 7);
      for (const messageLength of MESSAGE_LENGTHS) {
        const message = fill(messageLength);
        expect(
          toHex(hmacSha256(key, message)),
          `secret ${secretLength} bytes, message ${messageLength} bytes`,
        ).toBe(nodeHmac(key, message));
      }
    },
  );

  it('takes the RFC 2104 long-key branch, and a hashed key is not the raw key', () => {
    const longKey = fill(100, 7);
    const message = utf8('the signed input');
    expect(toHex(hmacSha256(longKey, message))).toBe(nodeHmac(longKey, message));
    // A 100-byte key is hashed to 32 bytes first; that digest used directly as the key must agree.
    expect(toHex(hmacSha256(sha256(longKey), message))).toBe(
      toHex(hmacSha256(longKey, message)),
    );
  });

  it('agrees on the shape the webhook helper actually signs', () => {
    const key = utf8('fixture-webhook-signing-value-not-a-credential');
    const message = concatBytes(utf8('1785726012.'), utf8('{"schema_version":"1.0"}'));
    expect(toHex(hmacSha256(key, message))).toBe(nodeHmac(key, message));
  });
});

describe('byte codecs', () => {
  it('round-trips hex, lower-case only', () => {
    const bytes = fill(64);
    const hex = toHex(bytes);
    expect(hex).toMatch(/^[0-9a-f]{128}$/);
    expect(fromHex(hex)).toEqual(bytes);
    expect(toHex(new Uint8Array([0x00, 0x0f, 0xff]))).toBe('000fff');
  });

  it('returns null for an odd length or a non-hex character', () => {
    expect(fromHex('abc')).toBeNull();
    expect(fromHex('zz')).toBeNull();
    expect(fromHex('AB')).toBeNull(); // upper case is not the lower-case wire form (PRD §34.8)
  });

  it('concatenates at the byte level', () => {
    expect(concatBytes(new Uint8Array([1, 2]), new Uint8Array([3]))).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
});

describe('equalsInConstantTime', () => {
  it('is true for equal arrays and false for a one-bit difference of equal length', () => {
    const a = fill(32);
    const b = fill(32);
    expect(equalsInConstantTime(a, b)).toBe(true);
    b[31] = (b[31] as number) ^ 0x01;
    expect(equalsInConstantTime(a, b)).toBe(false);
  });

  it('is false — never a throw — on a length mismatch', () => {
    expect(equalsInConstantTime(fill(32), fill(31))).toBe(false);
    expect(equalsInConstantTime(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});
