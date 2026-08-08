/**
 * EVID-02 acceptance item 9 — the suite runs with the model runtime disabled, and `readiness()`
 * reports the state HONESTLY rather than defaulting to `READY`.
 *
 * `PII_STAGES` is what every other suite in this ticket uses, and there is no model artifact
 * anywhere on disk, so "the whole suite runs with it off" is not a separate mode — it is the only
 * mode. What this file adds is the other half: a recogniser built from an `UNAVAILABLE` load outcome
 * must SAY so and must append nothing, and one whose model throws must degrade rather than pretend.
 */
import { describe, expect, it } from 'vitest';

import type { PiiFinding } from '../../src/contract/finding.js';
import type { StageInput } from '../../src/contract/pipeline.js';
import { buildScanViews } from '../../src/deterministic/detect.js';
import { DEFAULT_ENTITY_RECOGNISER, PII_STAGES } from '../../src/context/stages.js';
import { createDeterministicRecogniser } from '../../src/entity/deterministic/recogniser.js';
import { createRuntimeRecogniser } from '../../src/entity/runtime/recogniser.js';
import { unavailable } from '../../src/entity/runtime/loader.js';
import { ENTITY_ARTIFACT_PINS } from '../../src/entity/runtime/pin.js';

const request = { freeText: [{ field: 'question', value: 'Hi Marta Kowalski, about the roster.' }] };
const input: StageInput = { request, views: buildScanViews(request) };
const noFindings: readonly PiiFinding[] = [];

describe('the shipped default', () => {
  it('is the deterministic recogniser and reports READY', () => {
    expect(DEFAULT_ENTITY_RECOGNISER.readiness()).toBe('READY');
    expect(createDeterministicRecogniser().readiness()).toBe('READY');
  });

  it('needs no artifact — none is pinned, and none is shipped (ADR 0001)', () => {
    expect(ENTITY_ARTIFACT_PINS).toEqual([]);
  });

  it('drives PII_STAGES', () => {
    expect(PII_STAGES.recogniseEntities(input, noFindings).length).toBeGreaterThan(0);
  });
});

describe('a runtime recogniser whose artifact is absent', () => {
  const recogniser = createRuntimeRecogniser(
    () => [{ start: 3, end: 17, label: 'PER', score: 0.99 }],
    unavailable('ARTIFACT_ABSENT'),
  );

  it('reports UNAVAILABLE, never READY', () => {
    expect(recogniser.readiness()).toBe('UNAVAILABLE');
  });

  it('appends nothing — it never accepts, suppresses or falls back to silence-as-success', () => {
    expect(recogniser.recognise(input, noFindings)).toBe(noFindings);
  });

  it.each(['SIZE_MISMATCH', 'DIGEST_MISMATCH', 'READ_FAILED'] as const)(
    'reports UNAVAILABLE for %s too',
    (reason) => {
      const other = createRuntimeRecogniser(() => [], unavailable(reason));
      expect(other.readiness()).toBe('UNAVAILABLE');
    },
  );
});

describe('a runtime recogniser that loaded', () => {
  const bytes = new Uint8Array([1, 2, 3]);

  it('reports READY and appends the person spans the model returned', () => {
    const recogniser = createRuntimeRecogniser(
      () => [
        { start: 3, end: 17, label: 'PER', score: 0.99 },
        { start: 0, end: 2, label: 'ORG', score: 0.99 },
        { start: 3, end: 17, label: 'PER', score: 0.1 },
      ],
      { state: 'READY', bytes },
    );
    expect(recogniser.readiness()).toBe('READY');
    const findings = recogniser.recognise(input, noFindings);
    expect(findings.length).toBe(1);
    expect(findings[0]?.category).toBe('EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME');
    expect(findings[0]?.start).toBe(3);
  });

  it('ignores an out-of-range or inverted span rather than throwing', () => {
    const recogniser = createRuntimeRecogniser(
      () => [
        { start: -1, end: 5, label: 'PER', score: 1 },
        { start: 5, end: 5, label: 'PER', score: 1 },
        { start: 0, end: 10_000, label: 'PER', score: 1 },
      ],
      { state: 'READY', bytes },
    );
    expect(recogniser.recognise(input, noFindings)).toEqual([]);
  });

  it('DEGRADES when a model call throws, and still appends nothing', () => {
    const recogniser = createRuntimeRecogniser(
      () => {
        throw new Error('model failure');
      },
      { state: 'READY', bytes },
    );
    expect(recogniser.readiness()).toBe('READY');
    expect(recogniser.recognise(input, noFindings)).toBe(noFindings);
    expect(recogniser.readiness()).toBe('DEGRADED');
  });
});
