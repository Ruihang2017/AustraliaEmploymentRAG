/**
 * FND-03 acceptance items 5 and 6 — `newId` / `isId` / `parseId`.
 *
 * `parseId`'s key set is asserted deliberately: PRD §34.1 says *"clients never parse them"*, and a
 * timestamp accessor on an opaque id leaks record-creation timing (including across tenants). If a
 * later change adds a third key here, this test is the thing that should stop it.
 */
import { describe, expect, it } from 'vitest';

import {
  RESOURCE_KINDS,
  UUID_V7_PATTERN,
  createIdFactory,
  isId,
  newId,
  parseId,
} from '../../src/ids/index.js';

const VALID_UUID = '01997e3a-1c40-7c8f-8b2d-0123456789ab';

describe('newId', () => {
  it('renders <prefix>_<uuidv7> with exactly one separator and no doubled underscore', () => {
    const id = newId('ans');
    expect(id.startsWith('ans_')).toBe(true);
    expect(id.includes('__')).toBe(false);
    expect(id.slice('ans_'.length)).toMatch(UUID_V7_PATTERN);
  });

  it('mints a distinct id for every registered kind', () => {
    const ids = RESOURCE_KINDS.map((kind) => newId(kind));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('takes its clock from the injected factory', () => {
    const factory = createIdFactory({ now: () => 1_800_000_000_000 });
    const first = factory.newId('rec');
    const second = factory.newId('rec');
    expect(second > first).toBe(true);
    expect(parseId(first)?.uuid.slice(0, 8)).toBe(parseId(second)?.uuid.slice(0, 8));
  });
});

describe('isId', () => {
  it('accepts only a well-formed id of exactly the requested kind', () => {
    expect(isId('ans', newId('ans'))).toBe(true);
    expect(isId('ans', `ans_${VALID_UUID}`)).toBe(true);
  });

  it('rejects another kind s id', () => {
    expect(isId('ans', `rec_${VALID_UUID}`)).toBe(false);
    expect(isId('ans', newId('rec'))).toBe(false);
  });

  it('rejects a malformed or wrong-version uuid', () => {
    expect(isId('ans', 'ans_not-a-uuid')).toBe(false);
    expect(isId('ans', 'ans_01997e3a-1c40-4c8f-8b2d-0123456789ab')).toBe(false); // v4
    expect(isId('ans', 'ans_01997e3a-1c40-7c8f-0b2d-0123456789ab')).toBe(false); // variant
    expect(isId('ans', `ans_${VALID_UUID.toUpperCase()}`)).toBe(false);
    expect(isId('ans', `ans_${VALID_UUID}extra`)).toBe(false);
  });

  it('rejects a value with no prefix, an empty prefix or no uuid', () => {
    expect(isId('ans', VALID_UUID)).toBe(false);
    expect(isId('ans', `_${VALID_UUID}`)).toBe(false);
    expect(isId('ans', 'ans_')).toBe(false);
    expect(isId('ans', '')).toBe(false);
    expect(isId('ans', '_')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isId('ans', 42)).toBe(false);
    expect(isId('ans', null)).toBe(false);
    expect(isId('ans', undefined)).toBe(false);
    expect(isId('ans', { toString: () => `ans_${VALID_UUID}` })).toBe(false);
  });
});

describe('parseId', () => {
  it('round-trips a freshly minted id for every registered kind', () => {
    for (const kind of RESOURCE_KINDS) {
      const id = newId(kind);
      const parsed = parseId(id);
      expect(parsed, `parseId failed for kind ${kind}`).not.toBeNull();
      expect(parsed?.kind).toBe(kind);
      expect(`${parsed?.kind}_${parsed?.uuid}`).toBe(id);
    }
  });

  it('exposes the prefix and the uuid and nothing else (PRD §34.1 opacity)', () => {
    const parsed = parseId(newId('ans'));
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed ?? {}).sort()).toEqual(['kind', 'uuid']);
  });

  it('returns null for an unregistered prefix or a malformed value', () => {
    expect(parseId(`nope_${VALID_UUID}`)).toBeNull();
    expect(parseId(`ANS_${VALID_UUID}`)).toBeNull();
    expect(parseId(VALID_UUID)).toBeNull();
    expect(parseId('ans_')).toBeNull();
    expect(parseId('_')).toBeNull();
    expect(parseId('')).toBeNull();
    expect(parseId(null)).toBeNull();
    expect(parseId(12345)).toBeNull();
  });

  it('splits on the first underscore, so a uuid-shaped tail is not re-split', () => {
    const parsed = parseId(`ans_${VALID_UUID}`);
    expect(parsed?.kind).toBe('ans');
    expect(parsed?.uuid).toBe(VALID_UUID);
  });
});
