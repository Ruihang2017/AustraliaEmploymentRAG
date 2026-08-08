/**
 * FND-09 acceptance item 2 — `[fixture]` PRD §38.5 replay across ALL THREE columns, plus §24.4's
 * per-organisation concurrency defaults.
 *
 * The "System hard protection" column is asserted explicitly for every boundary: dropping it is the
 * defect the ticket's Reviewer step 1 names.
 */
import { describe, expect, it } from 'vitest';

import {
  LIMIT_DEFAULTS_V1,
  ORGANISATION_CONCURRENCY_DEFAULTS,
  ORGANISATION_CONCURRENCY_PRD_TEXT,
  QUOTA_LEDGER_KINDS,
  limitRow,
  type LimitBoundary,
  type LimitValue,
} from '../../src/budget/index.js';
import { loadLimitsFixture, loadPrd, unwrap } from './fixture.js';

const fixture = loadLimitsFixture();
const prd = loadPrd();

const textOf = (value: LimitValue): string => value.prdText;

describe('the fixture is a faithful transcription of docs/PRD.md §38.5', () => {
  it('reads a PRD that actually contains §38.5 (non-vacuity)', () => {
    expect(prd).toContain(fixture.heading);
    expect(prd.length).toBeGreaterThan(10_000);
  });

  for (const row of fixture.boundaries) {
    it(`§38.5 row "${row.boundary}" is in the PRD with all three columns`, () => {
      expect(prd).toContain(
        `| ${row.boundary} | ${row.trial} | ${row.paidPilot} | ${row.systemHardProtection} |`,
      );
    });
  }

  it('§38.5 closing paragraph is transcribed verbatim (wrapped and unwrapped agree)', () => {
    expect(prd).toContain(fixture.closingLines.join('\n'));
    expect(unwrap(fixture.closingLines)).toBe(fixture.closingRules.join(' '));
  });

  it('§24.4 and §8.2 are transcribed verbatim', () => {
    expect(prd).toContain(fixture.section24_4.heading);
    expect(prd).toContain(fixture.section24_4.sentence);
    for (const line of fixture.section24_4.fundingLedgerLines) expect(prd).toContain(line);
    expect(prd).toContain(fixture.section8_2.sentence);
  });
});

describe('LIMIT_DEFAULTS_V1 matches the fixture for all seven boundaries', () => {
  it('carries exactly the §38.5 boundaries, in table order', () => {
    expect(LIMIT_DEFAULTS_V1.rows.map((row) => row.boundary)).toEqual(
      fixture.boundaries.map((row) => row.key),
    );
    expect(LIMIT_DEFAULTS_V1.rows).toHaveLength(7);
  });

  for (const row of fixture.boundaries) {
    it(`${row.key}: trial, paid pilot AND system hard protection all match`, () => {
      const actual = limitRow(LIMIT_DEFAULTS_V1, row.key as LimitBoundary);
      expect(actual.label).toBe(row.boundary);
      expect(textOf(actual.trial)).toBe(row.trial);
      expect(textOf(actual.paidPilot)).toBe(row.paidPilot);
      expect(textOf(actual.systemHardProtection)).toBe(row.systemHardProtection);
    });
  }

  it('models the prose cells as prose, never as an invented number', () => {
    expect(limitRow(LIMIT_DEFAULTS_V1, 'CONCURRENT_QUICK').systemHardProtection.kind).toBe(
      'QUALITATIVE',
    );
    expect(limitRow(LIMIT_DEFAULTS_V1, 'API_CALLS').systemHardProtection.kind).toBe('QUALITATIVE');
    expect(limitRow(LIMIT_DEFAULTS_V1, 'WIDGET_SESSION_CREATION').systemHardProtection.kind).toBe(
      'QUALITATIVE',
    );
  });

  it('every numeric cell carries a bigint count and the right scope', () => {
    const search = limitRow(LIMIT_DEFAULTS_V1, 'SEARCH_BURST');
    expect(search.trial).toEqual({
      kind: 'PER_MINUTE',
      count: 20n,
      scope: 'ORGANISATION',
      prdText: '20/min/organisation',
    });
    expect(search.paidPilot).toEqual({
      kind: 'PER_MINUTE',
      count: 60n,
      scope: 'ORGANISATION',
      prdText: '60/min/organisation',
    });
    expect(search.systemHardProtection).toEqual({
      kind: 'PER_MINUTE',
      count: 100n,
      scope: 'GLOBAL',
      prdText: '100/min global initial',
    });
    const api = limitRow(LIMIT_DEFAULTS_V1, 'API_CALLS');
    expect(api.trial).toEqual({ kind: 'PER_TRIAL', count: 500n, prdText: '500/trial' });
    expect(api.paidPilot).toEqual({ kind: 'PER_MONTH', count: 10_000n, prdText: '10,000/month' });
    const widget = limitRow(LIMIT_DEFAULTS_V1, 'WIDGET_SESSION_CREATION');
    expect(widget.trial).toEqual({
      kind: 'PER_MINUTE',
      count: 30n,
      scope: 'SERVICE_ACCOUNT',
      prdText: '30/min/service account',
    });
  });

  it('carries §38.5 closing rules and is versioned', () => {
    expect([...LIMIT_DEFAULTS_V1.closingRules]).toEqual([...fixture.closingRules]);
    expect(LIMIT_DEFAULTS_V1.version).toBe('LIMIT_DEFAULTS_V1');
  });

  it('a missing boundary fails by name rather than returning undefined', () => {
    expect(() => limitRow(LIMIT_DEFAULTS_V1, 'NOT_A_BOUNDARY' as LimitBoundary)).toThrow(
      /NOT_A_BOUNDARY/,
    );
  });
});

describe('PRD §24.4 per-organisation concurrency defaults', () => {
  it('is two Quick, one Deep and one export', () => {
    expect(ORGANISATION_CONCURRENCY_DEFAULTS.QUICK).toBe(BigInt(fixture.section24_4.concurrency.QUICK ?? ''));
    expect(ORGANISATION_CONCURRENCY_DEFAULTS.DEEP).toBe(BigInt(fixture.section24_4.concurrency.DEEP ?? ''));
    expect(ORGANISATION_CONCURRENCY_DEFAULTS.EXPORT).toBe(BigInt(fixture.section24_4.concurrency.EXPORT ?? ''));
    expect(ORGANISATION_CONCURRENCY_PRD_TEXT).toBe(fixture.section24_4.sentence);
  });

  it('records the §24.4 / §38.5 difference instead of averaging it away (plan OQ-4)', () => {
    // §24.4 says two Quick per organisation; §38.5's TRIAL column says one. Both are transcribed.
    expect(ORGANISATION_CONCURRENCY_DEFAULTS.QUICK).toBe(2n);
    expect(limitRow(LIMIT_DEFAULTS_V1, 'CONCURRENT_QUICK').trial).toMatchObject({ count: 1n });
    expect(limitRow(LIMIT_DEFAULTS_V1, 'CONCURRENT_QUICK').paidPilot).toMatchObject({ count: 2n });
  });
});

describe('the five separate ledgers of PRD §38.5', () => {
  it('are exactly the five that sentence names, in order', () => {
    expect([...QUOTA_LEDGER_KINDS]).toEqual([...fixture.quotaLedgerKinds]);
  });
});
