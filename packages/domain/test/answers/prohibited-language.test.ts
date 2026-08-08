/**
 * FND-07 acceptance item 7 — the PRD §36.8 prohibited-certainty detector, positive AND negative cases.
 *
 * The negative cases matter as much as the positive ones (ticket test plan step 6): a blunt keyword
 * filter that flags every "risk" or every percentage would degrade real legal answers.
 */
import { describe, expect, it } from 'vitest';

import { MAX_MATCH_TEXT, containsProhibitedCertainty } from '../../src/answers/index.js';
import { loadFixture } from './fixture.js';

const fixture = loadFixture();

describe('containsProhibitedCertainty — positive cases (PRD §36.8)', () => {
  it('has cases to run (non-vacuity)', () => {
    expect(fixture.prohibited_language.positive.length).toBeGreaterThanOrEqual(4);
    expect(fixture.prohibited_language.negative.length).toBeGreaterThanOrEqual(4);
  });

  for (const testCase of fixture.prohibited_language.positive) {
    it(`flags: ${testCase.text}`, () => {
      const matches = containsProhibitedCertainty(testCase.text);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.map((match) => match.kind)).toContain(testCase.kind);
      expect(matches.map((match) => match.pattern)).toContain(testCase.pattern);
    });

    it(`offsets slice back to the matched text: ${testCase.text}`, () => {
      for (const match of containsProhibitedCertainty(testCase.text)) {
        expect(match.truncated).toBe(false);
        expect(testCase.text.slice(match.start, match.end)).toBe(match.text);
      }
    });
  }
});

describe('containsProhibitedCertainty — negative cases', () => {
  for (const text of fixture.prohibited_language.negative) {
    it(`does not flag: ${JSON.stringify(text)}`, () => {
      expect(containsProhibitedCertainty(text)).toEqual([]);
    });
  }
});

describe('containsProhibitedCertainty — edge cases', () => {
  it('is case-insensitive and whitespace-tolerant, including across a line break', () => {
    expect(containsProhibitedCertainty('It is DEFINITELY\n  COMPLIANT.')).toHaveLength(1);
    expect(containsProhibitedCertainty('There is Zero  Risk here.')).toHaveLength(1);
  });

  it('is word-bounded: "guarantee" and "guarantees" are ordinary statutory prose', () => {
    expect(containsProhibitedCertainty('the superannuation guarantee charge')).toEqual([]);
    expect(containsProhibitedCertainty('the clause guarantees a minimum')).toEqual([]);
    expect(containsProhibitedCertainty('coverage is guaranteed')).toHaveLength(1);
  });

  it('reports every occurrence, with distinct offsets', () => {
    const text = 'It is guaranteed. It is guaranteed again.';
    const matches = containsProhibitedCertainty(text);
    expect(matches).toHaveLength(2);
    expect(matches[0]?.start).toBeLessThan(matches[1]?.start ?? -1);
    for (const match of matches) expect(text.slice(match.start, match.end)).toBe('guaranteed');
  });

  it('returns matches ordered by offset even when different rules fire', () => {
    const text = 'There is zero risk and 99% confidence in the outcome.';
    const matches = containsProhibitedCertainty(text);
    expect(matches.map((match) => match.kind)).toEqual([
      'PROHIBITED_PHRASE',
      'MODEL_CONFIDENCE_PERCENTAGE',
    ]);
  });

  it('handles empty and whitespace-only input', () => {
    expect(containsProhibitedCertainty('')).toEqual([]);
    expect(containsProhibitedCertainty('   \n\t ')).toEqual([]);
  });

  it('handles a percentage at index 0 and at the very end of the string', () => {
    expect(containsProhibitedCertainty('50% confidence')).toHaveLength(1);
    expect(containsProhibitedCertainty('our confidence is 50%')).toHaveLength(1);
  });

  it('does not cross a sentence boundary to find a confidence word', () => {
    expect(containsProhibitedCertainty('The rate is 12%. We are confident of nothing else.')).toEqual(
      [],
    );
  });

  it('never rewrites its input and returns a fresh array', () => {
    const text = 'It is guaranteed.';
    const first = containsProhibitedCertainty(text);
    const second = containsProhibitedCertainty(text);
    expect(first).not.toBe(second);
    expect(text).toBe('It is guaranteed.');
  });

  it('has no shared regex state: repeated calls give identical results', () => {
    const text = 'zero risk, guaranteed, 90% certainty';
    const runs = [0, 1, 2, 3].map(() => containsProhibitedCertainty(text));
    for (const run of runs) expect(run).toEqual(runs[0]);
    expect(runs[0]?.length).toBe(3);
  });

  it('bounds the returned span so a huge match cannot be duplicated into a log line', () => {
    const text = `definitely${' '.repeat(500)}compliant`;
    const matches = containsProhibitedCertainty(text);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.text.length).toBe(MAX_MATCH_TEXT);
    expect(matches[0]?.truncated).toBe(true);
    expect(matches[0]?.end).toBe(text.length);
  });
});

describe('containsProhibitedCertainty — bounded runtime on adversarial input (ReDoS guard)', () => {
  it('completes on a 1 MB digit run', () => {
    const text = `${'9'.repeat(500_000)}% `;
    const started = Date.now();
    containsProhibitedCertainty(text);
    expect(Date.now() - started, 'catastrophic backtracking').toBeLessThan(5_000);
  });

  it('completes on a long whitespace run between the two halves of a phrase', () => {
    const text = `definitely${' '.repeat(500_000)}not compliant`;
    const started = Date.now();
    expect(containsProhibitedCertainty(text)).toEqual([]);
    expect(Date.now() - started, 'catastrophic backtracking').toBeLessThan(5_000);
  });

  it('completes on a long run of percentages with no confidence word', () => {
    const text = '12% '.repeat(100_000);
    const started = Date.now();
    expect(containsProhibitedCertainty(text)).toEqual([]);
    expect(Date.now() - started, 'catastrophic backtracking').toBeLessThan(5_000);
  });
});
