import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ADMITS_CUSTOMER_FREE_TEXT,
  aggregateDetectorHealth,
  decideOperationAdmission,
  DETECTOR_STAGE_NAMES,
  OPERATION_CLASSES,
  PROCEED_DECISION,
  projectDetectionStatus,
  STATIC_STAGE_HEALTH,
} from '../../src/availability/index.js';
import { PACKAGE_ROOT } from '../contract/fixture.js';

const dir = join(PACKAGE_ROOT, 'src', 'availability');
const sources = readdirSync(dir)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));

const FORBIDDEN: readonly RegExp[] = [
  /\bDate\.now\b/,
  /\bnew Date\b/,
  /\bMath\.random\b/,
  /\bprocess\.env\b/,
  /\bfetch\s*\(/,
  /\bconsole\./,
];

function assertDeepFrozen(value: unknown, path: string): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value), `${path} is not frozen`).toBe(true);
  for (const key of Object.getOwnPropertyNames(value)) {
    assertDeepFrozen((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

describe('availability purity and determinism', () => {
  it('contains no clock, randomness, environment, network, or logger access', () => {
    expect(sources.length).toBe(6);
    for (const pattern of FORBIDDEN) {
      expect(sources.filter((source) => pattern.test(source.text)).map((source) => source.name)).toEqual([]);
    }
  });

  it('proves the forbidden scanner is non-vacuous', () => {
    const control = 'Date.now(); new Date(); Math.random(); process.env.X; fetch("/"); console.log();';
    expect(FORBIDDEN.every((pattern) => pattern.test(control))).toBe(true);
  });

  it('returns equal and identically serialised values on repeated calls', () => {
    const snapshot = {
      limits: 'READY',
      deterministic: 'DEGRADED',
      entity: 'READY',
      context: 'READY',
    } as const;
    const firstAvailability = aggregateDetectorHealth(snapshot);
    const secondAvailability = aggregateDetectorHealth(snapshot);
    expect(firstAvailability).toEqual(secondAvailability);
    expect(JSON.stringify(firstAvailability)).toBe(JSON.stringify(secondAvailability));

    const firstDecision = decideOperationAdmission('FREE_TEXT_COMPARE', firstAvailability);
    const secondDecision = decideOperationAdmission('FREE_TEXT_COMPARE', secondAvailability);
    expect(firstDecision).toEqual(secondDecision);
    expect(JSON.stringify(firstDecision)).toBe(JSON.stringify(secondDecision));

    const firstStatus = projectDetectionStatus(firstAvailability, null);
    const secondStatus = projectDetectionStatus(secondAvailability, null);
    expect(firstStatus).toEqual(secondStatus);
    expect(JSON.stringify(firstStatus)).toBe(JSON.stringify(secondStatus));
  });

  it.each([
    ['OPERATION_CLASSES', OPERATION_CLASSES as unknown],
    ['ADMITS_CUSTOMER_FREE_TEXT', ADMITS_CUSTOMER_FREE_TEXT as unknown],
    ['DETECTOR_STAGE_NAMES', DETECTOR_STAGE_NAMES as unknown],
    ['STATIC_STAGE_HEALTH', STATIC_STAGE_HEALTH as unknown],
    ['PROCEED_DECISION', PROCEED_DECISION as unknown],
  ])('deep-freezes %s', (name, value) => {
    assertDeepFrozen(value, name);
  });

  it('proves the deep-freeze assertion is non-vacuous', () => {
    expect(() => assertDeepFrozen({ nested: {} }, 'control')).toThrow();
  });
});
