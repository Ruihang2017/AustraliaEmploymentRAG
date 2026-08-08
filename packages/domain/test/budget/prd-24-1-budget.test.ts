/**
 * FND-09 acceptance item 1 — `[fixture]` PRD §24.1 replay.
 *
 * Two halves, both required: the fixture is only a trustworthy assertion target if it really is what
 * docs/PRD.md says, so this suite reads the PRD (read-only; it is a frozen path) AND compares
 * `BUDGET_PROFILE_V1` against the fixture row for row.
 */
import { describe, expect, it } from 'vitest';

import {
  BUDGET_PROFILE_V1,
  FOUNDER_RESERVE_ORDER,
  FOUNDER_RESERVE_ORDER_PRD_TEXT,
  warningThresholdMicroAud,
} from '../../src/budget/index.js';
import { loadBudgetFixture, loadPrd } from './fixture.js';

const fixture = loadBudgetFixture();
const prd = loadPrd();

describe('the fixture is a faithful transcription of docs/PRD.md §24.1', () => {
  it('reads a PRD that actually contains §24.1 (non-vacuity)', () => {
    expect(prd).toContain(fixture.heading);
    expect(prd.length).toBeGreaterThan(10_000);
  });

  for (const row of fixture.rows) {
    it(`§24.1 row "${row.label}" is in the PRD with its planning budget`, () => {
      expect(prd).toContain(`| ${row.label} | ${row.planningBudget} |`);
    });
  }

  it('the en dashes are en dashes (U+2013), not hyphens', () => {
    const total = fixture.rows.find((row) => row.item === 'TOTAL');
    expect(total?.planningBudget).toBe('A$42–50');
    expect(total?.planningBudget).not.toContain('-');
  });

  it('§24.1 closing paragraph is transcribed verbatim', () => {
    expect(prd).toContain(fixture.closingRule);
    expect(fixture.closingRule).toContain('MUST stop before exceeding the founder-funded ceiling');
  });

  it('§42.6 corroborates the A$50 ceiling and states the reserve order verbatim', () => {
    expect(prd).toContain(fixture.prd42_6.ceilingSentence);
    for (const entry of fixture.prd42_6.reserveOrder) {
      expect(prd).toContain(`${String(entry.position)}. ${entry.prdText}`);
    }
    expect(prd).toContain(fixture.prd42_6.failClosedSentence);
    expect(prd).toContain(fixture.prd42_6.byokSentence);
  });
});

describe('BUDGET_PROFILE_V1 matches the fixture line for line', () => {
  it('carries exactly the §24.1 rows, in table order', () => {
    expect(BUDGET_PROFILE_V1.lineItems.map((row) => row.item)).toEqual(
      fixture.rows.map((row) => row.item),
    );
  });

  for (const [index, row] of fixture.rows.entries()) {
    it(`row ${String(index)} (${row.item}) matches label, PRD text and both bounds`, () => {
      const item = BUDGET_PROFILE_V1.lineItems[index];
      expect(item).toBeDefined();
      expect(item?.label).toBe(row.label);
      expect(item?.prdText).toBe(row.planningBudget);
      expect(item?.lowMicroAud).toBe(BigInt(row.lowMicroAud));
      expect(item?.highMicroAud).toBe(BigInt(row.highMicroAud));
    });
  }

  it('the derived micro-AUD integers match the fixture, including the A$50 ceiling', () => {
    const derived = fixture.derived;
    expect(BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud).toBe(
      BigInt(derived.founderMonthlyCeilingMicroAud),
    );
    expect(BUDGET_PROFILE_V1.hostedModelHardBudgetMicroAud).toBe(
      BigInt(derived.hostedModelHardBudgetMicroAud),
    );
    expect(BUDGET_PROFILE_V1.totalLowMicroAud).toBe(BigInt(derived.totalLowMicroAud));
    expect(BUDGET_PROFILE_V1.totalHighMicroAud).toBe(BigInt(derived.totalHighMicroAud));
    expect(BUDGET_PROFILE_V1.warningThresholdBasisPoints).toBe(
      BigInt(derived.warningThresholdBasisPoints),
    );
    expect(warningThresholdMicroAud(BUDGET_PROFILE_V1)).toBe(
      BigInt(derived.warningThresholdMicroAud),
    );
  });

  it('the ceiling is the upper bound of the Total row (the recorded derivation)', () => {
    const total = BUDGET_PROFILE_V1.lineItems.find((row) => row.item === 'TOTAL');
    expect(total?.highMicroAud).toBe(BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud);
    expect(fixture.derived.founderMonthlyCeilingDerivation).toContain('Total row');
  });

  it('every money field is a bigint, and the ratio is the only number', () => {
    for (const field of [
      BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud,
      BUDGET_PROFILE_V1.hostedModelHardBudgetMicroAud,
      BUDGET_PROFILE_V1.totalLowMicroAud,
      BUDGET_PROFILE_V1.totalHighMicroAud,
      BUDGET_PROFILE_V1.warningThresholdBasisPoints,
    ]) {
      expect(typeof field).toBe('bigint');
    }
    expect(typeof BUDGET_PROFILE_V1.warningThresholdRatio).toBe('number');
    expect(BUDGET_PROFILE_V1.warningThresholdRatio).toBe(0.9);
  });

  it('is versioned, so a change of default is explicit and auditable', () => {
    expect(BUDGET_PROFILE_V1.version).toBe('BUDGET_PROFILE_V1');
    expect(BUDGET_PROFILE_V1.closingRule).toBe(fixture.closingRule);
  });

  it('FOUNDER_RESERVE_ORDER is PRD §42.6 order, with its phrases', () => {
    expect([...FOUNDER_RESERVE_ORDER]).toEqual(
      fixture.prd42_6.reserveOrder.map((entry) => entry.reserveClass),
    );
    expect([...FOUNDER_RESERVE_ORDER_PRD_TEXT]).toEqual(
      fixture.prd42_6.reserveOrder.map((entry) => entry.prdText),
    );
  });
});
