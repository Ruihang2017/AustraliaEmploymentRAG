import { describe, expect, it } from 'vitest';

import {
  InvalidDateError,
  formatEffectiveInterval,
  formatLegalDate,
  isIsoDate,
} from '../src/format/date.js';

describe('formatLegalDate (PRD §41.1)', () => {
  it('renders the PRD example exactly', () => {
    expect(formatLegalDate('2026-08-03')).toBe('3 Aug 2026');
  });

  it('drops the leading zero on the day and keeps four digits of year', () => {
    expect(formatLegalDate('2026-01-01')).toBe('1 Jan 2026');
    expect(formatLegalDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it.each([
    ['2026-01-15', '15 Jan 2026'],
    ['2026-02-15', '15 Feb 2026'],
    ['2026-03-15', '15 Mar 2026'],
    ['2026-04-15', '15 Apr 2026'],
    ['2026-05-15', '15 May 2026'],
    ['2026-06-15', '15 Jun 2026'],
    ['2026-07-15', '15 Jul 2026'],
    ['2026-08-15', '15 Aug 2026'],
    ['2026-09-15', '15 Sep 2026'],
    ['2026-10-15', '15 Oct 2026'],
    ['2026-11-15', '15 Nov 2026'],
    ['2026-12-15', '15 Dec 2026'],
  ])('formats %s as %s', (iso, expected) => {
    expect(formatLegalDate(iso)).toBe(expected);
  });

  it('uses plain ASCII spaces, never a narrow no-break space', () => {
    const formatted = formatLegalDate('2026-08-03');
    expect(formatted).toBe(formatted.replace(/ | /g, ' '));
    expect([...formatted].map((c) => c.codePointAt(0))).toContain(0x20);
  });

  it('formats from UTC parts, so a date does not shift a day by time zone', () => {
    // Explicitly the near-midnight boundary: a local-time implementation renders "2 Aug 2026" west
    // of UTC for this value. The runner's TZ is whatever the machine has; both branches must agree.
    expect(formatLegalDate('2026-08-03T00:00:00Z')).toBe('3 Aug 2026');
    expect(formatLegalDate('2026-08-03T23:59:59Z')).toBe('3 Aug 2026');
  });

  it.each(['', 'not a date', '3 Aug 2026', '2026/08/03', '2026-13-01', '2026-02-30', '20260803'])(
    'throws InvalidDateError rather than rendering "Invalid Date" for %s',
    (value) => {
      expect(() => formatLegalDate(value)).toThrow(InvalidDateError);
    },
  );

  it('leaves the ISO input string untouched — it is display-only', () => {
    const iso = '2026-08-03';
    formatLegalDate(iso);
    expect(iso).toBe('2026-08-03');
  });
});

describe('isIsoDate', () => {
  it('accepts calendar dates and date-times', () => {
    expect(isIsoDate('2026-08-03')).toBe(true);
    expect(isIsoDate('2026-08-03T10:30:00Z')).toBe(true);
    expect(isIsoDate('2026-08-03T10:30:00.123+10:00')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
  });

  it('rejects everything else, so the accept case is not vacuous', () => {
    expect(isIsoDate('2023-02-29')).toBe(false);
    expect(isIsoDate('3 Aug 2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('formatEffectiveInterval', () => {
  it('renders a closed interval', () => {
    expect(formatEffectiveInterval('2026-08-03', '2027-01-01')).toBe('3 Aug 2026 – 1 Jan 2027');
  });

  it('renders an open-ended interval as "current"', () => {
    expect(formatEffectiveInterval('2026-08-03', null)).toBe('3 Aug 2026 – current');
    expect(formatEffectiveInterval('2026-08-03', undefined)).toBe('3 Aug 2026 – current');
  });
});
