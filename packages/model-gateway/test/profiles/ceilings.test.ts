/**
 * EVID-07 acceptance item "Ceilings are enforced, not clamped" — the load half.
 *
 * The call half (a call exceeding `maxElapsedMs` returning `PROFILE_TIMEOUT`) lives in
 * `test/providers/failure-matrix.test.ts`, where a fake clock and timer make it deterministic.
 */
import { describe, expect, it } from 'vitest';

import '../providers/support/network-stub.js';
import { ProfileCeilingExceededError, assertProfileWithinCeilings } from '../../src/profiles/load.js';
import { REGISTRY_CEILINGS } from '../../src/profiles/ceilings.js';
import { MODEL_PROFILE_REGISTRY_V1 } from '../../src/profiles/registry.js';
import { MODEL_PROFILE_IDS } from '../../src/profiles/types.js';
import type { ModelProfile } from '../../src/profiles/types.js';

const base = (): ModelProfile => ({ ...MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS });

describe('assertProfileWithinCeilings', () => {
  it('accepts every shipped profile (the registry loads)', () => {
    for (const id of MODEL_PROFILE_IDS) {
      expect(assertProfileWithinCeilings(MODEL_PROFILE_REGISTRY_V1[id])).toBe(
        MODEL_PROFILE_REGISTRY_V1[id],
      );
    }
  });

  it.each(['maxInputTokens', 'maxOutputTokens', 'maxElapsedMs'] as const)(
    'rejects a profile whose %s exceeds the registry ceiling',
    (limit) => {
      const profile = { ...base(), [limit]: REGISTRY_CEILINGS.QUICK_SYNTHESIS[limit] + 1 };
      expect(() => assertProfileWithinCeilings(profile)).toThrow(ProfileCeilingExceededError);
    },
  );

  it('rejects rather than clamps — the thrown error names the configured value and the ceiling', () => {
    const profile = { ...base(), maxElapsedMs: 600_000 };
    try {
      assertProfileWithinCeilings(profile);
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ProfileCeilingExceededError);
      const thrown = error as ProfileCeilingExceededError;
      expect(thrown.limit).toBe('maxElapsedMs');
      expect(thrown.message).toContain('600000');
      expect(thrown.message).toContain(String(REGISTRY_CEILINGS.QUICK_SYNTHESIS.maxElapsedMs));
      expect(thrown.message).toContain('never clamped');
    }
    // And the input is untouched: nothing was clamped in place.
    expect(profile.maxElapsedMs).toBe(600_000);
  });

  it('accepts a value exactly at the ceiling (the comparison is not off by one)', () => {
    const profile = { ...base(), maxElapsedMs: REGISTRY_CEILINGS.QUICK_SYNTHESIS.maxElapsedMs };
    expect(() => assertProfileWithinCeilings(profile)).not.toThrow();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects the nonsense limit %s', (value) => {
    expect(() => assertProfileWithinCeilings({ ...base(), maxOutputTokens: value })).toThrow(
      ProfileCeilingExceededError,
    );
  });
});

describe('the registry ceilings themselves', () => {
  it('covers every profile id', () => {
    expect(Object.keys(REGISTRY_CEILINGS)).toEqual([...MODEL_PROFILE_IDS]);
  });

  it('never allows a hosted profile past PRD §36.7 Deep hard elapsed limit', () => {
    for (const id of MODEL_PROFILE_IDS) {
      expect(REGISTRY_CEILINGS[id].maxElapsedMs).toBeLessThanOrEqual(180_000);
    }
  });
});
