/**
 * EVID-02 acceptance item 4 — necessary role/duty/location facts are NOT blocked.
 *
 * PRD §10.1: *"necessary role/duty/location facts MAY be accepted"*, and PRD §32.2's Ask form is
 * meant to carry exactly these. A detector that blocks them does not make the product safer; it
 * makes it useless and teaches customers to paraphrase around the boundary, which is worse than
 * either outcome.
 *
 * Every case replays `ACCEPT` through the whole pipeline, and every declared rule is exercised by at
 * least one case — an unexercised negative rule is a rule nobody can trust.
 */
import { describe, expect, it } from 'vitest';

import { admit } from '../../src/contract/pipeline.js';
import { PII_STAGES } from '../../src/context/stages.js';
import { normaliseForScan } from '../../src/deterministic/normalise.js';
import {
  NECESSARY_FACT_RULES,
  NECESSARY_FACT_RULE_NAMES,
  isNecessaryFactSpan,
  necessaryFactSpans,
} from '../../src/context/necessaryFacts.js';
import { loadNecessaryFacts } from '../entity/fixture.js';

const cases = loadNecessaryFacts();

describe('the negative rule set', () => {
  it('declares a PRD row and a pattern for every named rule', () => {
    expect(NECESSARY_FACT_RULES.map((rule) => rule.name).sort()).toEqual(
      [...NECESSARY_FACT_RULE_NAMES].sort(),
    );
    for (const rule of NECESSARY_FACT_RULES) {
      expect(rule.prdAllowedRow.length, rule.name).toBeGreaterThan(10);
      expect(rule.pattern.length, rule.name).toBeGreaterThan(10);
    }
  });

  it('is exercised by the corpus — every rule has at least one case', () => {
    const covered = new Set(cases.map((entry) => entry.rule));
    expect([...covered].sort()).toEqual([...NECESSARY_FACT_RULE_NAMES].sort());
  });
});

describe('every necessary-fact case replays ACCEPT', () => {
  it.each(cases.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    const result = admit({ freeText: [{ field: entry.field, value: entry.value }] }, PII_STAGES);
    expect(
      result.decision,
      `${entry.id} (${entry.prdAllowedRow}) was blocked: ${result.findings
        .map((finding) => finding.category)
        .join(', ')}`,
    ).toBe('ACCEPT');
  });
});

describe('each case matches the rule it is filed under', () => {
  it.each(cases.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    const view = normaliseForScan(entry.field, entry.value);
    const rules = new Set(necessaryFactSpans(view).map((span) => span.rule));
    expect([...rules], entry.id).toContain(entry.rule);
  });
});

describe('the span test itself', () => {
  it('reports a span inside a necessary-fact phrase, and not one outside it', () => {
    const view = normaliseForScan('question', 'The role requires a Certificate III and a licence.');
    const at = view.scan.indexOf('Certificate III');
    expect(isNecessaryFactSpan(view, at, at + 'Certificate III'.length)).toBe(true);
    const outside = view.scan.indexOf('licence');
    expect(isNecessaryFactSpan(view, outside, outside + 7)).toBe(false);
  });

  it('is not vacuous — a sentence with no necessary fact yields no span', () => {
    const view = normaliseForScan('question', 'Hi Marta Kowalski, about tomorrow.');
    expect(necessaryFactSpans(view)).toEqual([]);
  });
});
