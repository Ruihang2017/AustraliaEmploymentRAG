/**
 * FND-03 acceptance item 5 (the UUID half) — RFC 9562 §5.7 shape and §6.2 monotonicity.
 *
 * Every ordering assertion uses an INJECTED clock. A wall-clock test does not prove ordering within
 * a millisecond, and a wall-clock test is flaky (ticket test plan step 6). Every ordering assertion
 * also stays inside this one file and one factory instance: vitest runs files in separate workers,
 * and two factories in two processes are deliberately NOT ordered relative to each other inside a
 * millisecond (RFC 9562 §6.2 — see the concurrency note in src/ids/uuidv7.ts).
 */
import { describe, expect, it } from 'vitest';

import { UUID_V7_PATTERN, createUuidV7, isUuidV7, uuidv7 } from '../../src/ids/index.js';

const FIXED_MS = 1_800_000_000_000;

/** Deterministic, non-random "randomness": a counter fill, so a run is byte-for-byte reproducible. */
function deterministicRandomBytes(): (size: number) => Uint8Array {
  let n = 0;
  return (size: number) => {
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) {
      n = (n + 97) & 0xff;
      out[i] = n;
    }
    return out;
  };
}

const bytesOf = (uuid: string): number[] => {
  const hex = uuid.replace(/-/g, '');
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(Number.parseInt(hex.slice(i, i + 2), 16));
  return out;
};

describe('shape', () => {
  it('produces version 7 and the RFC variant', () => {
    const next = createUuidV7({ now: () => FIXED_MS, randomBytes: deterministicRandomBytes() });
    for (let i = 0; i < 100; i += 1) {
      const id = next();
      expect(id).toMatch(UUID_V7_PATTERN);
      const bytes = bytesOf(id);
      expect(bytes).toHaveLength(16);
      expect((bytes[6] as number) >>> 4, 'version nibble').toBe(0x7);
      expect((bytes[8] as number) >>> 6, 'RFC variant bits').toBe(0b10);
    }
  });

  it('encodes the injected timestamp in the first 48 bits, big-endian', () => {
    const next = createUuidV7({ now: () => FIXED_MS, randomBytes: deterministicRandomBytes() });
    const bytes = bytesOf(next());
    const ms = bytes
      .slice(0, 6)
      .reduce((acc, byte) => acc * 256 + byte, 0);
    expect(ms).toBe(FIXED_MS);
  });

  it('rejects a v4 uuid, an upper-case uuid and a non-string', () => {
    expect(isUuidV7('9f1c8e2a-3b4d-4c5e-8f01-0123456789ab')).toBe(false); // version 4
    expect(isUuidV7('9F1C8E2A-3B4D-7C5E-8F01-0123456789AB')).toBe(false); // upper case
    expect(isUuidV7('9f1c8e2a-3b4d-7c5e-0f01-0123456789ab')).toBe(false); // wrong variant nibble
    expect(isUuidV7('not-a-uuid')).toBe(false);
    expect(isUuidV7(42)).toBe(false);
    expect(isUuidV7(null)).toBe(false);
  });

  it('mints a valid uuid from the process-wide generator (real Web Crypto randomness)', () => {
    const id = uuidv7();
    expect(id).toMatch(UUID_V7_PATTERN);
    expect(uuidv7()).not.toBe(id);
  });
});

describe('monotonicity', () => {
  it('makes 10,000 successive ids from a FIXED clock strictly increasing and unique', () => {
    const next = createUuidV7({ now: () => FIXED_MS, randomBytes: deterministicRandomBytes() });
    const ids: string[] = [];
    for (let i = 0; i < 10_000; i += 1) ids.push(next());

    expect(new Set(ids).size).toBe(10_000);
    for (let i = 1; i < ids.length; i += 1) {
      expect(
        (ids[i] as string) > (ids[i - 1] as string),
        `id ${i} (${ids[i]}) is not greater than id ${i - 1} (${ids[i - 1]})`,
      ).toBe(true);
    }
    // Same millisecond throughout: ordering came from the counter, not from the clock.
    expect(new Set(ids.map((id) => id.slice(0, 13))).size).toBe(1);
  });

  it('stays strictly increasing across an advancing clock', () => {
    let ms = FIXED_MS;
    const next = createUuidV7({ now: () => ms, randomBytes: deterministicRandomBytes() });
    const ids: string[] = [];
    for (let i = 0; i < 500; i += 1) {
      if (i % 3 === 0) ms += 1;
      ids.push(next());
    }
    for (let i = 1; i < ids.length; i += 1) {
      expect((ids[i] as string) > (ids[i - 1] as string)).toBe(true);
    }
  });

  it('never regresses when the clock jumps backwards (NTP step)', () => {
    let ms = FIXED_MS;
    const next = createUuidV7({ now: () => ms, randomBytes: deterministicRandomBytes() });
    const before = next();
    ms -= 5_000; // a five-second backwards step
    const after = next();
    expect(after > before).toBe(true);
    // The embedded timestamp holds at the high-water mark rather than following the clock down.
    expect(after.slice(0, 13)).toBe(before.slice(0, 13));
  });

  it('advances the timestamp instead of regressing when the counter overflows', () => {
    // The counter seed is a test seam: with the real 30-bit seed this branch needs ~3.2e9 calls in
    // one millisecond, so it would never be exercised.
    const next = createUuidV7({
      now: () => FIXED_MS,
      randomBytes: deterministicRandomBytes(),
      counterSeed: () => 0xffff_ffff,
    });
    const first = next(); // counter = 0xffffffff
    const second = next(); // overflow -> lastMs + 1, counter reseeded to 0xffffffff
    expect(second > first).toBe(true);
    const firstMs = bytesOf(first)
      .slice(0, 6)
      .reduce((acc, byte) => acc * 256 + byte, 0);
    const secondMs = bytesOf(second)
      .slice(0, 6)
      .reduce((acc, byte) => acc * 256 + byte, 0);
    expect(firstMs).toBe(FIXED_MS);
    expect(secondMs).toBe(FIXED_MS + 1);
  });
});
