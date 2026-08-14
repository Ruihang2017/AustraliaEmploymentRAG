/**
 * EVID-07 — determinism and concurrency safety of the shared frozen data (plan §6 risk 1).
 *
 * These registries are process-lifetime singletons read concurrently by every in-flight request in
 * `apps/worker`. `Object.freeze` is shallow, so a test that only froze the top level would pass while
 * a nested row stayed mutable — and one mutated row silently changes the profile for every other
 * request for the life of the process.
 */
import { describe, expect, it } from 'vitest';

import '../providers/support/network-stub.js';
import { PROFILE_CALL_CEILINGS, REGISTRY_CEILINGS } from '../../src/profiles/ceilings.js';
import { MODEL_PROFILE_REGISTRY_V1 } from '../../src/profiles/registry.js';
import { MODEL_PROFILE_IDS } from '../../src/profiles/types.js';
import { deepFreeze } from '../../src/profiles/freeze.js';

/** Every object reachable from a value by own enumerable value properties. */
function reachableObjects(value: unknown, seen = new Set<object>()): object[] {
  if (value === null || typeof value !== 'object') return [...seen];
  const asObject = value as object;
  if (seen.has(asObject)) return [...seen];
  seen.add(asObject);
  for (const key of Object.getOwnPropertyNames(asObject)) {
    const descriptor = Object.getOwnPropertyDescriptor(asObject, key);
    if (descriptor && 'value' in descriptor) reachableObjects(descriptor.value, seen);
  }
  return [...seen];
}

describe('deepFreeze', () => {
  it('freezes at every level, not just the top', () => {
    const value = deepFreeze({ row: { nested: [1, 2, 3] } });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.row)).toBe(true);
    expect(Object.isFrozen(value.row.nested)).toBe(true);
  });

  it('survives a cycle', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => deepFreeze(cyclic)).not.toThrow();
    expect(Object.isFrozen(cyclic)).toBe(true);
  });

  it('is not vacuous: an unfrozen object is reported unfrozen', () => {
    expect(Object.isFrozen({ a: 1 })).toBe(false);
  });
});

describe.each([
  ['MODEL_PROFILE_REGISTRY_V1', MODEL_PROFILE_REGISTRY_V1 as unknown],
  ['REGISTRY_CEILINGS', REGISTRY_CEILINGS as unknown],
  ['PROFILE_CALL_CEILINGS', PROFILE_CALL_CEILINGS as unknown],
])('%s is deep-frozen', (_name, table) => {
  it('freezes every reachable object', () => {
    for (const object of reachableObjects(table)) expect(Object.isFrozen(object)).toBe(true);
  });
});

describe('mutating a nested registry row throws in strict mode', () => {
  it('refuses to change a promotion state', () => {
    expect(() => {
      (MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS as { promotionState: string }).promotionState = 'APPROVED';
    }).toThrow(TypeError);
    expect(MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS.promotionState).toBe('CANDIDATE');
  });

  it('refuses to add a fallback', () => {
    expect(() => {
      (MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS as { approvedFallbackProfileId?: string }).approvedFallbackProfileId =
        'DEEP_SYNTHESIS';
    }).toThrow(TypeError);
    expect(MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS.approvedFallbackProfileId).toBeUndefined();
  });

  it('refuses to push a provider onto an allowlist', () => {
    expect(() => {
      (MODEL_PROFILE_REGISTRY_V1.QUERY_EMBEDDING.allowedProviderIds as string[]).push('anything');
    }).toThrow(TypeError);
    for (const id of MODEL_PROFILE_IDS) {
      expect(Object.isFrozen(MODEL_PROFILE_REGISTRY_V1[id].allowedProviderIds)).toBe(true);
    }
  });
});
