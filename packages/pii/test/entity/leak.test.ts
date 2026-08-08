/**
 * EVID-02 acceptance item 8 — zero raw logging on the ENTITY and COMBINATION paths.
 *
 * Modelled on `test/deterministic/leak.test.ts` (EVID-01), extended in the two ways this ticket
 * needs:
 *
 * - it replays BOTH `canaries` (EVID-01's eight) and `stageCanaries` (this ticket's three, in the
 *   same manifest file) through `PII_STAGES`, so the assertion covers findings produced by stages 4
 *   and 6 rather than only by stage 2;
 * - it serialises the `CombinationAssessment` too. That object is NEW leak surface: it is what
 *   `EVID-03` and `ASSR-03` will consume, and it must carry dimension NAMES, a field name and
 *   offsets — never a character of the request (sub-PRD D3).
 *
 * A truncated or encoded value is still the value, so every canary is checked in six renderings:
 * raw, base64, hex, URL-encoded, reversed and its first eight characters. The non-vacuity control
 * from `EVID-01` is kept: a scan that silently matches nothing is the most comfortable kind of green
 * test.
 */
import { describe, expect, it } from 'vitest';

import { admit } from '../../src/contract/pipeline.js';
import { PII_STAGES } from '../../src/context/stages.js';
import { buildScanViews } from '../../src/deterministic/detect.js';
import { evaluateCombination } from '../../src/context/combination.js';
import type { PiiMetricsEvent, PiiMetricsSink } from '../../src/contract/metrics.js';
import { emitAdmissionMetrics } from '../../src/contract/metrics.js';
import type { Id } from '../../../contracts/src/ids/index.js';
import { loadCanaries } from '../contract/fixture.js';
import { loadStageCanaries } from './fixture.js';

const REQUEST_ID = 'req_0198f3c1-0000-7000-8000-00000000beef' as Id<'req'>;
const canaries = loadCanaries();
const stageCanaries = loadStageCanaries();
const all = [...canaries, ...stageCanaries];

function derivatives(token: string): { label: string; text: string }[] {
  const hex = [...token].map((char) => char.charCodeAt(0).toString(16)).join('');
  return [
    { label: 'raw', text: token },
    { label: 'base64', text: Buffer.from(token, 'utf8').toString('base64') },
    { label: 'hex', text: hex },
    { label: 'url-encoded', text: encodeURIComponent(token) },
    { label: 'reversed', text: [...token].reverse().join('') },
    { label: 'first 8 characters', text: token.slice(0, 8) },
  ];
}

describe('the stage canary manifest', () => {
  it('lives in the SAME file EVID-01 created, under a second key', () => {
    expect(stageCanaries.length).toBeGreaterThanOrEqual(3);
    expect(canaries.length).toBeGreaterThanOrEqual(8);
    const tokens = new Set(all.map((canary) => canary.token));
    expect(tokens.size, 'a duplicated token would make one assertion vacuous').toBe(all.length);
  });

  it('names the stage each canary exercises, and covers both new stages', () => {
    expect(new Set(stageCanaries.map((canary) => canary.stage))).toEqual(
      new Set(['recogniseEntities', 'applyCombinationRules']),
    );
  });

  it('is DETECTED under PII_STAGES — a canary that is never blocked would prove nothing', () => {
    for (const canary of stageCanaries) {
      const result = admit(
        { freeText: [{ field: canary.field, value: canary.value }] },
        PII_STAGES,
      );
      expect(result.decision, canary.id).toBe('REJECT');
      expect(result.findings.map((finding) => finding.category), canary.id).toContain(
        canary.category,
      );
    }
  });
});

describe('no canary, and no derivative of one, reaches any sink on the entity path', () => {
  it.each(all.map((canary) => [canary.id, canary] as const))('%s leaks nothing', (_id, canary) => {
    const events: PiiMetricsEvent[] = [];
    const sink: PiiMetricsSink = { record: (event) => events.push(event) };
    const errors: string[] = [];

    const request = { freeText: [{ field: canary.field, value: canary.value }] };
    let result;
    let assessment;
    try {
      result = admit(request, PII_STAGES);
      assessment = evaluateCombination({ request, views: buildScanViews(request) }, result.findings);
      emitAdmissionMetrics(result, sink, REQUEST_ID);
    } catch (error) {
      errors.push(String(error));
      errors.push(error instanceof Error ? (error.stack ?? '') : '');
    }

    const emitted = [
      JSON.stringify(result),
      JSON.stringify(events),
      JSON.stringify(result?.findings ?? []),
      JSON.stringify(assessment),
      ...errors,
    ].join('\n');

    for (const { label, text } of derivatives(canary.token)) {
      expect(emitted.includes(text), `${canary.id}: the ${label} form of the canary leaked`).toBe(
        false,
      );
    }
  });

  it('the leak scan is not vacuous — it finds a canary that IS present', () => {
    const canary = all[0];
    if (!canary) throw new Error('no canaries');
    const emitted = JSON.stringify({ oops: canary.value });
    expect(emitted.includes(canary.token)).toBe(true);
  });
});

describe('the combination assessment carries names, never text', () => {
  const request = {
    freeText: [
      {
        field: 'question',
        value: 'The only zephyr-glass polisher at our three-person atelier had a stroke.',
      },
    ],
  };

  it('fires, so the assertion below is not vacuous', () => {
    const result = admit(request, PII_STAGES);
    const assessment = evaluateCombination(
      { request, views: buildScanViews(request) },
      result.findings,
    );
    expect(assessment.blocked).toBe(true);
    expect(assessment.fired.length).toBeGreaterThanOrEqual(2);
  });

  it('serialises to names, a field name and offsets — and to nothing else', () => {
    const result = admit(request, PII_STAGES);
    const assessment = evaluateCombination(
      { request, views: buildScanViews(request) },
      result.findings,
    );
    expect(Object.keys(assessment).sort()).toEqual([
      'blocked',
      'end',
      'field',
      'fired',
      'rule',
      'start',
      'version',
    ]);
    const serialised = JSON.stringify(assessment);
    for (const word of ['zephyr', 'polisher', 'atelier', 'stroke', 'three-person']) {
      expect(serialised.includes(word), `the assessment leaked "${word}"`).toBe(false);
    }
  });
});
