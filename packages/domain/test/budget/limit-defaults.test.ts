/**
 * FND-09 acceptance item 2 `[fixture]` — PRD §38.5 replay across ALL THREE columns for all seven
 * boundaries, plus PRD §24.4's per-organisation concurrency defaults. One `it()` per boundary so a
 * failure names the row.
 */
import { describe, expect, it } from 'vitest';

import {
  LIMIT_DEFAULTS_V1,
  limitCellFor,
  limitRowFor,
  type LimitCell,
} from '../../src/budget/limit-defaults.js';
import { loadLimitsFixture, type LimitsFixtureCell } from './fixture.js';

const fixture = loadLimitsFixture();

function expectCell(actual: LimitCell | undefined, expected: LimitsFixtureCell): void {
  expect(actual).toBeDefined();
  if (!actual) return;
  expect(actual.text).toBe(expected.text);
  expect(actual.count).toBe(expected.count);
  expect(actual.perMinutes).toBe(expected.perMinutes);
  expect(actual.period).toBe(expected.period);
  expect(actual.scope).toBe(expected.scope);
  expect(Object.keys(actual).sort()).toEqual(['count', 'perMinutes', 'period', 'scope', 'text']);
}

describe('PRD §38.5 limit defaults', () => {
  it('is versioned and names its PRD section', () => {
    expect(LIMIT_DEFAULTS_V1.version).toBe('LIMIT_DEFAULTS_V1');
    expect(LIMIT_DEFAULTS_V1.prdSection).toBe('§38.5');
    expect(fixture.prdSection).toBe('§38.5');
    expect(fixture.prdLines).toBe('2585-2603');
  });

  it('has the seven PRD boundaries, in PRD order (non-vacuity)', () => {
    expect(fixture.rows).toHaveLength(7);
    expect(LIMIT_DEFAULTS_V1.rows.map((row) => row.boundary)).toEqual(
      fixture.rows.map((row) => row.boundary),
    );
    expect(LIMIT_DEFAULTS_V1.rows.map((row) => row.prdLabel)).toEqual(
      fixture.rows.map((row) => row.prdLabel),
    );
  });

  it.each(fixture.rows.map((row) => [row.boundary, row] as const))(
    'replays %s across trial, paid pilot and system hard protection',
    (_boundary, expected) => {
      const actual = LIMIT_DEFAULTS_V1.rows.find(
        (candidate) => candidate.boundary === expected.boundary,
      );
      expect(actual, `${expected.boundary} is missing from LIMIT_DEFAULTS_V1`).toBeDefined();
      if (!actual) return;
      expect(actual.prdLabel).toBe(expected.prdLabel);
      expectCell(actual.trial, expected.trial);
      expectCell(actual.paidPilot, expected.paidPilot);
      expectCell(actual.systemHardProtection, expected.systemHardProtection);
    },
  );

  it('keeps the prose cells verbatim rather than inventing a number for them', () => {
    const prose = LIMIT_DEFAULTS_V1.rows
      .filter((row) => row.systemHardProtection.count === null)
      .map((row) => row.systemHardProtection.text);
    expect(prose).toEqual([
      'token-bucket and request-size limits',
      'bounded by worker/provider',
      'delivery queue isolated from research',
      'abuse/IP/origin protection',
    ]);
  });

  it('carries PRD §24.4 concurrency defaults as a separate statement', () => {
    const defaults = LIMIT_DEFAULTS_V1.perOrganisationConcurrencyDefaults;
    expect(defaults.prdSection).toBe('§24.4');
    expect(defaults.quick).toBe(fixture.perOrganisationConcurrencyDefaults.quick);
    expect(defaults.deep).toBe(fixture.perOrganisationConcurrencyDefaults.deep);
    expect(defaults.export).toBe(fixture.perOrganisationConcurrencyDefaults.export);
    expect({ quick: defaults.quick, deep: defaults.deep, export: defaults.export }).toEqual({
      quick: 2,
      deep: 1,
      export: 1,
    });
  });

  it('does NOT reconcile §24.4 "two Quick" with the §38.5 trial column "1"', () => {
    const quick = limitRowFor('CONCURRENT_QUICK');
    expect(quick?.trial.count).toBe(1);
    expect(quick?.paidPilot.count).toBe(2);
    expect(LIMIT_DEFAULTS_V1.perOrganisationConcurrencyDefaults.quick).toBe(2);
  });

  it('exposes only the tenant-facing columns through limitCellFor', () => {
    expect(limitCellFor('SEARCH_BURST', 'TRIAL')?.text).toBe('20/min/organisation');
    expect(limitCellFor('SEARCH_BURST', 'PAID_PILOT')?.text).toBe('60/min/organisation');
    for (const row of LIMIT_DEFAULTS_V1.rows) {
      for (const tier of ['TRIAL', 'PAID_PILOT'] as const) {
        expect(limitCellFor(row.boundary, tier)?.text).not.toBe(row.systemHardProtection.text);
      }
    }
  });

  it('is deeply frozen', () => {
    expect(Object.isFrozen(LIMIT_DEFAULTS_V1)).toBe(true);
    expect(Object.isFrozen(LIMIT_DEFAULTS_V1.rows)).toBe(true);
    expect(Object.isFrozen(LIMIT_DEFAULTS_V1.perOrganisationConcurrencyDefaults)).toBe(true);
    for (const row of LIMIT_DEFAULTS_V1.rows) {
      expect(Object.isFrozen(row)).toBe(true);
      expect(Object.isFrozen(row.trial)).toBe(true);
      expect(Object.isFrozen(row.paidPilot)).toBe(true);
      expect(Object.isFrozen(row.systemHardProtection)).toBe(true);
    }
  });

  it('records its provenance in the fixture', () => {
    expect(fixture.$comment.join(' ')).toContain('docs/PRD.md');
    expect(fixture.perOrganisationConcurrencyDefaults.prdText).toContain(
      'two Quick, one Deep and one export',
    );
  });
});
