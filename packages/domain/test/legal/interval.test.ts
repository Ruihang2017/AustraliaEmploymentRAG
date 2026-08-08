/**
 * FND-10 acceptance items "boundary dates" and "assertNonOverlapping" — sub-PRD D12 / open question
 * Q-F4, PRD §35.2.
 */
import { describe, expect, it } from 'vitest';

import {
  assertNonOverlapping,
  effectiveIntervalContains,
  isLegalDate,
  compareLegalDate,
  isIsoTimestamp,
  type EffectiveInterval,
} from '../../src/legal/index.js';
import { loadBoundaryDates } from './fixture.js';

const fixture = loadBoundaryDates();

const asInterval = (literal: { effective_from: string; effective_to: string | null }): EffectiveInterval => ({
  effective_from: literal.effective_from,
  effective_to: literal.effective_to,
});

describe('closed inclusive containment (sub-PRD D12)', () => {
  it('replays every fixture containment case', () => {
    expect(fixture.containment.length).toBeGreaterThanOrEqual(9);
    for (const testCase of fixture.containment) {
      expect(
        effectiveIntervalContains(asInterval(testCase.interval), testCase.date),
        testCase.case,
      ).toBe(testCase.contains);
    }
  });

  it('the ticket literals: [2024-07-01, 2025-06-30] contains both bounds and excludes 2025-07-01', () => {
    const interval: EffectiveInterval = { effective_from: '2024-07-01', effective_to: '2025-06-30' };
    expect(effectiveIntervalContains(interval, '2024-07-01')).toBe(true);
    expect(effectiveIntervalContains(interval, '2025-06-30')).toBe(true);
    expect(effectiveIntervalContains(interval, '2025-07-01')).toBe(false);
    expect(effectiveIntervalContains(interval, '2024-06-30')).toBe(false);
  });

  it('an open-ended interval contains every date on or after effective_from', () => {
    const interval: EffectiveInterval = { effective_from: '2026-07-01', effective_to: null };
    for (const date of ['2026-07-01', '2026-07-02', '2030-01-01', '2099-12-31']) {
      expect(effectiveIntervalContains(interval, date), date).toBe(true);
    }
    expect(effectiveIntervalContains(interval, '2026-06-30')).toBe(false);
  });

  it('two correctly adjacent consolidated versions never both contain one date', () => {
    const versions = fixture.adjacentVersions.versions.map(asInterval);
    expect(versions).toHaveLength(2);
    let containedSomewhere = 0;
    for (const date of fixture.adjacentVersions.dates) {
      const hits = versions.filter((interval) => effectiveIntervalContains(interval, date));
      expect(hits.length, `${date} is in ${String(hits.length)} versions`).toBeLessThanOrEqual(1);
      if (hits.length === 1) containedSomewhere += 1;
    }
    // Non-vacuity: the date list must actually exercise both versions, not miss them all.
    expect(containedSomewhere).toBeGreaterThan(0);
    expect(assertNonOverlapping(versions)).toEqual([]);
  });

  it('is total — malformed input on either side is false, never a throw', () => {
    const interval: EffectiveInterval = { effective_from: '2024-07-01', effective_to: '2025-06-30' };
    for (const bad of ['2025-02-30', '2026-13-01', 'not-a-date', '', '2024-7-1']) {
      expect(() => effectiveIntervalContains(interval, bad)).not.toThrow();
      expect(effectiveIntervalContains(interval, bad), bad).toBe(false);
    }
    expect(effectiveIntervalContains({ effective_from: 'x', effective_to: null }, '2024-07-01')).toBe(false);
    expect(
      effectiveIntervalContains({ effective_from: '2024-07-01', effective_to: 'x' }, '2024-07-01'),
    ).toBe(false);
    expect(
      effectiveIntervalContains(null as unknown as EffectiveInterval, '2024-07-01'),
    ).toBe(false);
  });

  it('an inverted interval contains nothing', () => {
    const inverted: EffectiveInterval = { effective_from: '2025-06-30', effective_to: '2024-07-01' };
    for (const date of ['2024-07-01', '2025-01-01', '2025-06-30']) {
      expect(effectiveIntervalContains(inverted, date), date).toBe(false);
    }
  });
});

describe('assertNonOverlapping (PRD §35.2)', () => {
  it('replays every fixture non-overlap case', () => {
    for (const testCase of fixture.nonOverlap) {
      const found = assertNonOverlapping(testCase.versions.map(asInterval));
      expect(
        found.map(({ left, right, reason }) => ({ left, right, reason })),
        testCase.case,
      ).toEqual(testCase.expected.map(({ left, right, reason }) => ({ left, right, reason })));
    }
  });

  it('the ticket literals: a shared boundary date is an overlap, one clear day is not', () => {
    const offending = assertNonOverlapping([
      { effective_from: '2024-07-01', effective_to: '2025-06-30' },
      { effective_from: '2025-06-30', effective_to: null },
    ]);
    expect(offending).toHaveLength(1);
    expect(offending[0]?.left).toBe(0);
    expect(offending[0]?.right).toBe(1);
    expect(offending[0]?.reason).toBe('OVERLAP');

    expect(
      assertNonOverlapping([
        { effective_from: '2024-07-01', effective_to: '2025-06-29' },
        { effective_from: '2025-06-30', effective_to: null },
      ]),
    ).toEqual([]);
  });

  it('checks ALL pairs — a sorted-adjacent-only implementation would miss (0,2)', () => {
    const found = assertNonOverlapping([
      { effective_from: '2024-01-01', effective_to: null },
      { effective_from: '2024-02-01', effective_to: '2024-03-01' },
      { effective_from: '2024-04-01', effective_to: null },
    ]);
    // (1,2) is NOT an overlap: [2024-02-01,2024-03-01] ends before [2024-04-01,null] starts. The
    // finding that only all-pairs checking produces is (0,2), through the open-ended first interval.
    expect(found.map((entry) => `${String(entry.left)},${String(entry.right)}`)).toEqual([
      '0,1',
      '0,2',
    ]);
  });

  it('reports two open-ended intervals as overlapping', () => {
    const found = assertNonOverlapping([
      { effective_from: '2024-01-01', effective_to: null },
      { effective_from: '2030-01-01', effective_to: null },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toBe('OVERLAP');
  });

  it('never throws and never mutates the caller array', () => {
    const versions: EffectiveInterval[] = [
      { effective_from: '2025-06-30', effective_to: null },
      { effective_from: '2024-01-01', effective_to: '2024-12-31' },
      { effective_from: 'garbage', effective_to: null },
    ];
    const snapshot = versions.map((interval) => ({ ...interval }));
    expect(() => assertNonOverlapping(versions)).not.toThrow();
    assertNonOverlapping(versions);
    expect(versions).toEqual(snapshot);
  });

  it('emits results in (left, right) ascending order', () => {
    const found = assertNonOverlapping([
      { effective_from: '2024-01-01', effective_to: null },
      { effective_from: 'garbage', effective_to: null },
      { effective_from: '2024-06-01', effective_to: null },
      { effective_from: '2024-07-01', effective_to: null },
    ]);
    const keys = found.map((entry) => entry.left * 10 + entry.right);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
    expect(found.some((entry) => entry.reason === 'MALFORMED_DATE')).toBe(true);
    // The malformed row is skipped in pair checks, so nothing pairs with index 1.
    expect(found.filter((entry) => entry.reason === 'OVERLAP').map((entry) => [entry.left, entry.right])).toEqual([
      [0, 2],
      [0, 3],
      [2, 3],
    ]);
  });

  it('an empty version list has no findings', () => {
    expect(assertNonOverlapping([])).toEqual([]);
    expect(assertNonOverlapping([{ effective_from: '2024-07-01', effective_to: null }])).toEqual([]);
  });
});

describe('legal dates are calendar days, never Date objects', () => {
  it('accepts every well-formed fixture date and rejects every malformed one', () => {
    for (const date of fixture.wellFormedDates) expect(isLegalDate(date), date).toBe(true);
    for (const date of fixture.malformedDates) expect(isLegalDate(date), date).toBe(false);
  });

  it('leap day: 2024-02-29 is real, 2025-02-29 and 2025-02-30 are not', () => {
    expect(isLegalDate('2024-02-29')).toBe(true);
    expect(isLegalDate('2000-02-29')).toBe(true);
    expect(isLegalDate('1900-02-29')).toBe(false);
    expect(isLegalDate('2025-02-29')).toBe(false);
    expect(isLegalDate('2025-02-30')).toBe(false);
  });

  it('rejects non-strings of every shape without throwing', () => {
    for (const value of [null, undefined, 0, {}, [], new Map()]) {
      expect(() => isLegalDate(value)).not.toThrow();
      expect(isLegalDate(value)).toBe(false);
    }
  });

  it('compareLegalDate orders lexicographically, which is calendar order for YYYY-MM-DD', () => {
    expect(compareLegalDate('2024-07-01', '2025-06-30')).toBe(-1);
    expect(compareLegalDate('2025-06-30', '2024-07-01')).toBe(1);
    expect(compareLegalDate('2024-07-01', '2024-07-01')).toBe(0);
    expect(compareLegalDate('2024-09-30', '2024-10-01')).toBe(-1);
  });

  it('isIsoTimestamp accepts §35.1 UTC ISO text and rejects a legal date', () => {
    expect(isIsoTimestamp('2026-08-03T12:00:00Z')).toBe(true);
    expect(isIsoTimestamp('2026-08-03T12:00:00.123Z')).toBe(true);
    expect(isIsoTimestamp('2026-08-03T12:00:00+10:00')).toBe(true);
    expect(isIsoTimestamp('2026-08-03')).toBe(false);
    expect(isIsoTimestamp(null)).toBe(false);
  });
});
