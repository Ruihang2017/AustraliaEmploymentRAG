/**
 * EVID-02 acceptance items 5 and 7 — the identifying-combination rule.
 *
 * Three things are proved here:
 *
 * 1. every at/above-threshold case produces exactly one `BLOCKING` `IDENTIFYING_COMBINATION`
 *    finding, and `evaluateCombination(...).fired` names the dimensions the corpus authored;
 * 2. every near-miss case produces none — including the two shapes that a naive threshold would get
 *    wrong: a personal event with an exact date and nothing narrowing, and a narrowing dimension
 *    with no personal event;
 * 3. the threshold is walked EXPLICITLY, dimension by dimension, so the rule's shape is asserted
 *    rather than inferred from the corpus.
 *
 * The fired list is checked to contain NAMES ONLY (sub-PRD D3): every member must be in
 * `COMBINATION_DIMENSION_NAMES`, which no field text can ever be.
 */
import { describe, expect, it } from 'vitest';

import type { PiiFinding } from '../../src/contract/finding.js';
import type { PiiAdmissionRequest, StageInput } from '../../src/contract/pipeline.js';
import { admit } from '../../src/contract/pipeline.js';
import { buildScanViews } from '../../src/deterministic/detect.js';
import { PII_STAGES } from '../../src/context/stages.js';
import {
  COMBINATION_RULE_V1,
  applyCombinationRules,
  evaluateCombination,
} from '../../src/context/combination.js';
import { COMBINATION_DIMENSION_NAMES, DIMENSION_RULES } from '../../src/context/dimensions.js';
import { PII_PLACEHOLDERS } from '../../src/deterministic/placeholders.js';
import { loadCombinationCorpus } from '../entity/fixture.js';

const corpus = loadCombinationCorpus();

function assess(value: string, findings: readonly PiiFinding[] = []) {
  const request: PiiAdmissionRequest = { freeText: [{ field: 'question', value }] };
  const input: StageInput = { request, views: buildScanViews(request) };
  return evaluateCombination(input, findings);
}

function combinationFindings(value: string): readonly PiiFinding[] {
  return admit({ freeText: [{ field: 'question', value }] }, PII_STAGES).findings.filter(
    (finding) => finding.category === 'IDENTIFYING_COMBINATION',
  );
}

describe('the rule is versioned frozen DATA, not a magic number in a condition', () => {
  it('carries its version, threshold and dimension sets as values', () => {
    expect(COMBINATION_RULE_V1.rule).toBe('COMBINATION_RULE_V1');
    expect(COMBINATION_RULE_V1.version).toBe(1);
    expect(COMBINATION_RULE_V1.threshold).toBe(2);
    expect([...COMBINATION_RULE_V1.required]).toEqual(['PERSONAL_EVENT']);
    expect([...COMBINATION_RULE_V1.narrowing]).toEqual([
      'ROLE_SPECIFICITY',
      'SMALL_WORKPLACE',
      'RESIDUAL_IDENTIFIER',
    ]);
    expect(Object.isFrozen(COMBINATION_RULE_V1)).toBe(true);
  });

  it('names all five dimensions, each with a documented rule', () => {
    expect([...COMBINATION_RULE_V1.dimensions]).toEqual([...COMBINATION_DIMENSION_NAMES]);
    expect(DIMENSION_RULES.map((entry) => entry.dimension).sort()).toEqual(
      [...COMBINATION_DIMENSION_NAMES].sort(),
    );
    for (const entry of DIMENSION_RULES) expect(entry.describes.length).toBeGreaterThan(20);
  });
});

describe('the corpus', () => {
  it('has at least twenty cases on each side, all synthetic', () => {
    expect(corpus.blocked.length).toBeGreaterThanOrEqual(20);
    expect(corpus.nearMisses.length).toBeGreaterThanOrEqual(20);
    for (const entry of [...corpus.blocked, ...corpus.nearMisses]) {
      expect(entry.synthetic, entry.id).toBe(true);
    }
  });

  it('names expected dimensions on every blocked case, from the frozen vocabulary', () => {
    for (const entry of corpus.blocked) {
      expect(entry.expectedDimensions.length, entry.id).toBeGreaterThanOrEqual(2);
      for (const dimension of entry.expectedDimensions) {
        expect(COMBINATION_DIMENSION_NAMES as readonly string[], entry.id).toContain(dimension);
      }
    }
  });
});

describe('at and above the threshold', () => {
  it.each(corpus.blocked.map((entry) => [entry.id, entry] as const))(
    '%s produces one BLOCKING finding naming its dimensions',
    (_id, entry) => {
      const findings = combinationFindings(entry.value);
      expect(findings.length, entry.note).toBe(1);
      expect(findings[0]?.severity).toBe('BLOCKING');
      expect(findings[0]?.suggestedPlaceholder).toBe(PII_PLACEHOLDERS.IDENTIFYING_COMBINATION);
      expect(findings[0]?.end).toBeGreaterThan(findings[0]?.start ?? 0);

      const assessment = assess(entry.value);
      expect(assessment.blocked).toBe(true);
      expect([...assessment.fired].sort()).toEqual([...entry.expectedDimensions].sort());
    },
  );
});

describe('near misses produce nothing', () => {
  it.each(corpus.nearMisses.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    expect(combinationFindings(entry.value), `${entry.id}: ${entry.note}`).toEqual([]);
    expect(assess(entry.value).blocked).toBe(false);
  });
});

describe('walking the threshold explicitly', () => {
  const PERSONAL_EVENT_ONLY = 'A cleaner at a large national retailer took personal leave.';
  const REQUIRED_PLUS_ONE_NARROWING = 'The only night baker at the site had a stroke.';
  const REQUIRED_PLUS_TWO_NARROWING =
    'The only night baker at our three-person bakery had a stroke.';
  const REQUIRED_PLUS_TIME_ONLY = 'The dismissal took effect on 12/03/2024 after the meeting.';
  const NARROWING_ONLY = 'The only night baker at our three-person bakery starts at 4am.';

  it('the required dimension alone does not fire', () => {
    const assessment = assess(PERSONAL_EVENT_ONLY);
    expect(assessment.fired).toContain('PERSONAL_EVENT');
    expect(assessment.blocked).toBe(false);
  });

  it('a narrowing dimension alone does not fire', () => {
    const assessment = assess(NARROWING_ONLY);
    expect(assessment.fired).not.toContain('PERSONAL_EVENT');
    expect(assessment.blocked).toBe(false);
  });

  it('required + one narrowing FIRES (the threshold)', () => {
    expect(assess(REQUIRED_PLUS_ONE_NARROWING).blocked).toBe(true);
  });

  it('required + two narrowing FIRES (above the threshold)', () => {
    const assessment = assess(REQUIRED_PLUS_TWO_NARROWING);
    expect(assessment.blocked).toBe(true);
    expect(assessment.fired.length).toBeGreaterThanOrEqual(3);
  });

  it('required + a precise time or place ONLY does NOT fire — a date narrows nobody', () => {
    const assessment = assess(REQUIRED_PLUS_TIME_ONLY);
    expect([...assessment.fired].sort()).toEqual(['PERSONAL_EVENT', 'PRECISE_TIME_OR_PLACE']);
    expect(assessment.fired.length).toBeGreaterThanOrEqual(COMBINATION_RULE_V1.threshold);
    expect(
      assessment.blocked,
      'reaching the count is not enough: one partner must be identity-narrowing',
    ).toBe(false);
  });
});

describe('the RESIDUAL_IDENTIFIER dimension', () => {
  const value = 'A cleaner at a large national retailer took personal leave.';

  it('is reachable: an ADVISORY finding from an earlier stage narrows the combination', () => {
    const advisory: PiiFinding = {
      field: 'question',
      start: 2,
      end: 9,
      category: 'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME',
      severity: 'ADVISORY',
      suggestedPlaceholder: 'Employee A',
    };
    expect(assess(value).blocked).toBe(false);
    const withAdvisory = assess(value, [advisory]);
    expect(withAdvisory.fired).toContain('RESIDUAL_IDENTIFIER');
    expect(withAdvisory.blocked).toBe(true);
  });

  it('a BLOCKING finding is not a residual identifier', () => {
    const blocking: PiiFinding = {
      field: 'question',
      start: 2,
      end: 9,
      category: 'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME',
      severity: 'BLOCKING',
      suggestedPlaceholder: 'Employee A',
    };
    expect(assess(value, [blocking]).fired).not.toContain('RESIDUAL_IDENTIFIER');
  });
});

describe('the stage itself', () => {
  const request: PiiAdmissionRequest = {
    freeText: [{ field: 'question', value: 'The only night baker at the site had a stroke.' }],
  };
  const input: StageInput = { request, views: buildScanViews(request) };

  it('appends exactly one finding and returns the originals untouched', () => {
    const existing: readonly PiiFinding[] = [
      {
        field: 'question',
        start: 0,
        end: 3,
        category: 'TAX_FILE_NUMBER',
        severity: 'BLOCKING',
        suggestedPlaceholder: '[TFN REMOVED]',
      },
    ];
    const after = applyCombinationRules(input, existing);
    expect(after.length).toBe(existing.length + 1);
    expect(after[0]).toBe(existing[0]);
  });

  it('returns the same array when nothing fires', () => {
    const quiet: PiiAdmissionRequest = {
      freeText: [{ field: 'question', value: 'The worker asked about the Sunday penalty rate.' }],
    };
    const quietInput: StageInput = { request: quiet, views: buildScanViews(quiet) };
    const existing: readonly PiiFinding[] = [];
    expect(applyCombinationRules(quietInput, existing)).toBe(existing);
  });

  it('attaches the finding to the field where the personal event fired', () => {
    const multi: PiiAdmissionRequest = {
      freeText: [
        { field: 'background', value: 'The employer operates in VIC and QLD.' },
        { field: 'question', value: 'The only night baker at the site had a stroke.' },
      ],
    };
    const multiInput: StageInput = { request: multi, views: buildScanViews(multi) };
    const assessment = evaluateCombination(multiInput, []);
    expect(assessment.field).toBe('question');
    const findings = applyCombinationRules(multiInput, []);
    expect(findings[0]?.field).toBe('question');
  });
});
