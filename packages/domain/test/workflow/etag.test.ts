/**
 * FND-08 acceptance items 6 and 7 — `[machine]` ETag derivation and the MISSING/STALE distinction.
 */
import { describe, expect, it } from 'vitest';

import {
  ETAG_VERSION_TAG,
  checkIfMatch,
  computeETag,
  nextRowVersion,
} from '../../src/workflow/etag.js';

describe('computeETag', () => {
  it('is deterministic — identical inputs give an identical token', () => {
    expect(computeETag(7, 'rec_0193')).toBe(computeETag(7, 'rec_0193'));
    expect(computeETag(7, 'rec_0193')).toBe(`${ETAG_VERSION_TAG}.7.rec_0193`);
  });

  it('is injective over 20 row_versions x 10 resources (200 distinct tokens)', () => {
    const ids = Array.from({ length: 10 }, (_, index) => `rec_${index}`);
    const tokens = new Set<string>();
    for (let rowVersion = 0; rowVersion < 20; rowVersion += 1) {
      for (const id of ids) tokens.add(computeETag(rowVersion, id));
    }
    expect(tokens.size, 'computeETag collided across the row_version x resource matrix').toBe(200);
  });

  it('differs for every distinct row_version on the same resource', () => {
    const tokens = Array.from({ length: 50 }, (_, index) => computeETag(index, 'rec_same'));
    expect(new Set(tokens).size).toBe(50);
  });

  it('differs for the same row_version on different resources', () => {
    expect(computeETag(7, 'rec_a')).not.toBe(computeETag(7, 'rec_b'));
  });

  it('stays injective for ids that contain the separator (the adversarial pair)', () => {
    expect(computeETag(1, '2.x')).not.toBe(computeETag(12, '.x'));
    expect(computeETag(1, '2.x')).toBe('w1.1.2.x');
    expect(computeETag(12, '.x')).toBe('w1.12..x');
  });

  it('rejects a malformed row_version or resource id (caller bug)', () => {
    expect(() => computeETag(-1, 'rec_a')).toThrow(RangeError);
    expect(() => computeETag(1.5, 'rec_a')).toThrow(TypeError);
    expect(() => computeETag(Number.NaN, 'rec_a')).toThrow(TypeError);
    expect(() => computeETag(Number.POSITIVE_INFINITY, 'rec_a')).toThrow(TypeError);
    expect(() => computeETag(Number.MAX_SAFE_INTEGER, 'rec_a')).toThrow(RangeError);
    expect(() => computeETag(1, '')).toThrow(TypeError);
    expect(() => computeETag(1, undefined as unknown as string)).toThrow(TypeError);
  });
});

describe('nextRowVersion', () => {
  it('increments by exactly one', () => {
    for (const current of [0, 1, 7, 4096]) expect(nextRowVersion(current)).toBe(current + 1);
  });

  it('is strictly increasing across a chain', () => {
    let version = 0;
    for (let step = 0; step < 1000; step += 1) {
      const next = nextRowVersion(version);
      expect(next).toBeGreaterThan(version);
      version = next;
    }
    expect(version).toBe(1000);
  });

  it('refuses to overflow into an unsafe integer', () => {
    expect(() => nextRowVersion(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
    expect(() => nextRowVersion(Number.MAX_SAFE_INTEGER - 1)).toThrow(RangeError);
    expect(() => nextRowVersion(-1)).toThrow(RangeError);
  });
});

describe('checkIfMatch', () => {
  const current = computeETag(7, 'rec_0193');
  const asProvided = (value: unknown): string | undefined => value as string | undefined;

  it('returns MISSING when no If-Match value was supplied', () => {
    expect(checkIfMatch(undefined, current)).toBe('MISSING');
    expect(checkIfMatch(asProvided(null), current)).toBe('MISSING');
    expect(checkIfMatch('', current)).toBe('MISSING');
    expect(checkIfMatch('   ', current)).toBe('MISSING');
    expect(checkIfMatch('\t\n', current)).toBe('MISSING');
  });

  it('returns OK only on an exact match', () => {
    expect(checkIfMatch(current, current)).toBe('OK');
    expect(checkIfMatch(computeETag(7, 'rec_0193'), current)).toBe('OK');
  });

  it('returns STALE for a different row_version or a different resource', () => {
    expect(checkIfMatch(computeETag(6, 'rec_0193'), current)).toBe('STALE');
    expect(checkIfMatch(computeETag(8, 'rec_0193'), current)).toBe('STALE');
    expect(checkIfMatch(computeETag(7, 'rec_other'), current)).toBe('STALE');
  });

  it('does not trim, unwrap or special-case transport syntax (that is RUNT-01)', () => {
    expect(checkIfMatch(`${current} `, current)).toBe('STALE');
    expect(checkIfMatch(` ${current}`, current)).toBe('STALE');
    expect(checkIfMatch('*', current)).toBe('STALE');
    expect(checkIfMatch(`W/"${current}"`, current)).toBe('STALE');
    expect(checkIfMatch(`"${current}"`, current)).toBe('STALE');
    expect(checkIfMatch('7', current), 'the bare row_version is not this module token').toBe(
      'STALE',
    );
  });

  it('fails closed on a value that is present but not a usable string', () => {
    for (const value of [7, {}, [], true, Symbol.iterator]) {
      expect(checkIfMatch(asProvided(value), current), String(value)).toBe('STALE');
    }
  });

  it('distinguishes MISSING from STALE so the caller can pick the §34.9 code', () => {
    expect(checkIfMatch(undefined, current)).not.toBe(checkIfMatch('nope', current));
  });

  it('throws when the current token is itself malformed (caller bug)', () => {
    expect(() => checkIfMatch(current, '')).toThrow(TypeError);
    expect(() => checkIfMatch(current, undefined as unknown as string)).toThrow(TypeError);
  });
});
