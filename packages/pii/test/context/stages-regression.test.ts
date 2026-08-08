/**
 * EVID-02 — the differential replay, and the regression test that matters most.
 *
 * `EVID-01`'s whole corpus is replayed twice — once under `CONSERVATIVE_STAGE_DEFAULTS`, once under
 * `PII_STAGES` — and every decision change is accounted for BY CASE ID. Three assertions:
 *
 * 1. no case flips `REJECT -> ACCEPT`, ever, for any reason (stages 4-6 may not lose a block);
 * 2. the set of cases that flip `ACCEPT -> REJECT` is EXACTLY the twenty `deferred`
 *    `IDENTIFYING_COMBINATION` ids `EVID-01` authored — the deferral this ticket exists to close;
 * 3. every negative — the 22 shared ones and every per-category one — still replays `ACCEPT`.
 *
 * The intended-flip list is written out by id rather than compared as a count, so a new false
 * positive cannot hide inside a set comparison. This is where a too-eager gazetteer, name rule or
 * dimension detector fails first, and it closes `EVID-01`'s deferral without touching
 * `test/deterministic/**`.
 */
import { describe, expect, it } from 'vitest';

import { CONSERVATIVE_STAGE_DEFAULTS, admit } from '../../src/contract/pipeline.js';
import { PII_STAGES } from '../../src/context/stages.js';
import { loadCorpus } from '../contract/fixture.js';

const corpus = loadCorpus();

interface Case {
  readonly id: string;
  readonly field: string;
  readonly value: string;
  readonly kind: 'positive' | 'negative' | 'deferred';
}

const cases: Case[] = [];
for (const file of corpus.categories) {
  for (const positive of file.positives) {
    cases.push({ id: positive.id, field: positive.field, value: positive.value, kind: 'positive' });
  }
  for (const negative of file.negatives) {
    cases.push({ id: negative.id, field: negative.field, value: negative.value, kind: 'negative' });
  }
  for (const deferred of file.deferred) {
    cases.push({ id: deferred.id, field: deferred.field, value: deferred.value, kind: 'deferred' });
  }
}
for (const negative of corpus.sharedNegatives) {
  cases.push({ id: negative.id, field: negative.field, value: negative.value, kind: 'negative' });
}

const INTENDED_FLIPS: readonly string[] = [
  'combo-d-01',
  'combo-d-02',
  'combo-d-03',
  'combo-d-04',
  'combo-d-05',
  'combo-d-06',
  'combo-d-07',
  'combo-d-08',
  'combo-d-09',
  'combo-d-10',
  'combo-d-11',
  'combo-d-12',
  'combo-d-13',
  'combo-d-14',
  'combo-d-15',
  'combo-d-16',
  'combo-d-17',
  'combo-d-18',
  'combo-d-19',
  'combo-d-20',
];

function decideUnder(stages: typeof PII_STAGES, entry: Case): 'ACCEPT' | 'REJECT' {
  return admit({ freeText: [{ field: entry.field, value: entry.value }] }, stages).decision;
}

const before = new Map(cases.map((entry) => [entry.id, decideUnder(CONSERVATIVE_STAGE_DEFAULTS, entry)]));
const after = new Map(cases.map((entry) => [entry.id, decideUnder(PII_STAGES, entry)]));

describe('the differential replay of EVID-01’s corpus', () => {
  it('walks every authored case (non-vacuity)', () => {
    expect(cases.length).toBeGreaterThanOrEqual(300);
  });

  it('never flips REJECT -> ACCEPT', () => {
    const lost = cases
      .filter((entry) => before.get(entry.id) === 'REJECT' && after.get(entry.id) === 'ACCEPT')
      .map((entry) => entry.id);
    expect(lost, `stages 4-6 lost a block on: ${lost.join(', ')}`).toEqual([]);
  });

  it('flips ACCEPT -> REJECT on exactly the twenty deferred combination cases', () => {
    const gained = cases
      .filter((entry) => before.get(entry.id) === 'ACCEPT' && after.get(entry.id) === 'REJECT')
      .map((entry) => entry.id)
      .sort();
    expect(gained).toEqual([...INTENDED_FLIPS].sort());
  });

  it('closes each deferred case with a BLOCKING IDENTIFYING_COMBINATION finding', () => {
    for (const id of INTENDED_FLIPS) {
      const entry = cases.find((candidate) => candidate.id === id);
      expect(entry, id).toBeDefined();
      if (!entry) continue;
      const result = admit({ freeText: [{ field: entry.field, value: entry.value }] }, PII_STAGES);
      const combination = result.findings.filter(
        (finding) => finding.category === 'IDENTIFYING_COMBINATION',
      );
      expect(combination.length, id).toBe(1);
      expect(combination[0]?.severity, id).toBe('BLOCKING');
      expect(combination[0]?.end, id).toBeGreaterThan(combination[0]?.start ?? 0);
    }
  });

  /**
   * Stated as "no negative CHANGES", not "no negative is blocked": one §37.1 allowed row
   * (`social-n-02`, a published institutional URL) is already blocked by `EVID-01`'s own detectors
   * and is recorded as such in its corpus. Asserting the absolute would assert something the merged
   * branch never held, and would hide the thing this test is for — a NEW false positive from stages
   * 4-6.
   */
  it('changes the outcome of no negative at all', () => {
    const changed = cases
      .filter((entry) => entry.kind === 'negative' && before.get(entry.id) !== after.get(entry.id))
      .map((entry) => entry.id);
    expect(changed, `stages 4-6 changed a §37.1 allowed row: ${changed.join(', ')}`).toEqual([]);
  });

  it('leaves every negative that EVID-01 accepted at ACCEPT (the non-vacuous half)', () => {
    const accepted = cases.filter(
      (entry) => entry.kind === 'negative' && before.get(entry.id) === 'ACCEPT',
    );
    expect(accepted.length).toBeGreaterThanOrEqual(90);
    for (const entry of accepted) expect(after.get(entry.id), entry.id).toBe('ACCEPT');
  });
});
