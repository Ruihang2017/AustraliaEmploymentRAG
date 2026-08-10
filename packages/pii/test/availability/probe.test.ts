import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDetectorProbe,
  DETECTOR_STAGE_NAMES,
  worstOf,
} from '../../src/availability/index.js';
import type { StageHealth } from '../../src/availability/index.js';
import { PACKAGE_ROOT } from '../contract/fixture.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('the detector probe contract', () => {
  it('does no network work, is repeatable, checks readiness once, and cannot recognise text', () => {
    globalThis.fetch = () => {
      throw new Error('the probe attempted a network call');
    };
    let readinessCalls = 0;
    let recogniseCalls = 0;
    const recogniser = {
      readiness: (): StageHealth => {
        readinessCalls += 1;
        return 'READY';
      },
      recognise: () => {
        recogniseCalls += 1;
        throw new Error('recognise must not be called');
      },
    };
    const probe = createDetectorProbe(recogniser);
    const first = probe.check();
    expect(readinessCalls).toBe(1);
    const second = probe.check();
    expect(readinessCalls).toBe(2);
    expect(recogniseCalls).toBe(0);
    expect(first).toEqual(second);
  });

  it('folds observed health with worstOf, so observation can only narrow', () => {
    const healths: readonly StageHealth[] = ['READY', 'DEGRADED', 'UNAVAILABLE'];
    const rank: Readonly<Record<StageHealth, number>> = {
      READY: 0,
      DEGRADED: 1,
      UNAVAILABLE: 2,
    };
    for (const derived of healths) {
      for (const observed of healths) {
        const actual = createDetectorProbe(
          { readiness: () => derived },
          { entity: observed },
        ).check().entity;
        expect(actual).toBe(worstOf(derived, observed));
        expect(rank[actual]).toBeGreaterThanOrEqual(rank[derived]);
      }
    }
  });

  it('uses a closed, content-free import graph', () => {
    const source = readFileSync(join(PACKAGE_ROOT, 'src', 'availability', 'probe.ts'), 'utf8');
    const specifiers = [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    );
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.every((specifier) => specifier?.startsWith('../') || specifier?.startsWith('./'))).toBe(true);
    expect(source).not.toMatch(/corpus|detector\/|\badmit\b|node:/i);
    expect(DETECTOR_STAGE_NAMES).toEqual(['limits', 'deterministic', 'entity', 'context']);
  });
});
