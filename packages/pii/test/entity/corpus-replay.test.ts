/**
 * EVID-02 acceptance item 3 — person-name recall and precision, by positive context class.
 *
 * BY CLASS, NOT JUST IN AGGREGATE: the acceptance item requires *"every positive context class
 * (greeting, employment relation, signature, adjacent contact detail) has at least one passing
 * case"*, and an aggregate number can hide a class that never fires. Each class is asserted
 * separately, and the class is carried in the case id (`name-greet-…`, `name-rel-…`, `name-sig-…`,
 * `name-adj-…`, `name-hon-…`) rather than in a field, so the corpus stays in `EVID-01`'s shape.
 *
 * The numbers land in `test/entity/recall-report.json` via `recall-report.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import { PII_STAGES } from '../../src/context/stages.js';
import { admitFieldWith, loadEntityCorpus } from './fixture.js';

const corpus = loadEntityCorpus();
const CATEGORY = 'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME';

function detectedSpans(field: string, value: string): { start: number; end: number }[] {
  return admitFieldWith(PII_STAGES, field, value)
    .findings.filter((finding) => finding.category === CATEGORY)
    .map((finding) => ({ start: finding.start, end: finding.end }));
}

describe('the person-name corpus', () => {
  it('is large enough to mean something, and is entirely synthetic', () => {
    expect(corpus.positives.length).toBeGreaterThanOrEqual(40);
    expect(corpus.negatives.length).toBeGreaterThanOrEqual(40);
    for (const entry of [...corpus.positives, ...corpus.negatives]) {
      expect(entry.synthetic, entry.id).toBe(true);
    }
    for (const negative of corpus.negatives) {
      expect(negative.prdAllowedRow.length, negative.id).toBeGreaterThan(10);
    }
  });

  it('covers all five positive context classes', () => {
    const classes = new Set(corpus.positives.map((entry) => entry.id.split('-').slice(0, 2).join('-')));
    expect([...classes].sort()).toEqual([
      'name-adj',
      'name-greet',
      'name-hon',
      'name-rel',
      'name-sig',
    ]);
  });
});

describe('recall — every positive is detected at its authored span', () => {
  it.each(corpus.positives.map((entry) => [entry.id, entry] as const))('%s', (_id, positive) => {
    const spans = detectedSpans(positive.field, positive.value);
    for (const expected of positive.expected) {
      expect(
        spans.some((span) => span.start === expected.start && span.end === expected.end),
        `${positive.id}: no ${CATEGORY} finding at [${String(expected.start)}, ${String(expected.end)})`,
      ).toBe(true);
    }
  });
});

describe('recall by positive context class (the acceptance item’s own words)', () => {
  it.each([
    ['greeting', 'name-greet'],
    ['employment relation', 'name-rel'],
    ['signature', 'name-sig'],
    ['adjacent contact detail', 'name-adj'],
    ['honorific', 'name-hon'],
  ])('%s has at least one passing case', (_label, prefix) => {
    const cases = corpus.positives.filter((entry) => entry.id.startsWith(prefix));
    expect(cases.length).toBeGreaterThan(0);
    const passing = cases.filter((positive) => {
      const spans = detectedSpans(positive.field, positive.value);
      return positive.expected.every((expected) =>
        spans.some((span) => span.start === expected.start && span.end === expected.end),
      );
    });
    expect(passing.length).toBeGreaterThan(0);
  });
});

describe('precision — no PRD §37.1 allowed row is blocked', () => {
  it.each(corpus.negatives.map((entry) => [entry.id, entry] as const))('%s', (_id, negative) => {
    const spans = detectedSpans(negative.field, negative.value);
    expect(spans, `${negative.id} (${negative.prdAllowedRow}) produced a name finding`).toEqual([]);
  });
});
