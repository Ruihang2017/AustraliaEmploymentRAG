/**
 * FND-09 acceptance item 1 `[fixture]` — PRD §24.1 replay.
 *
 * `BUDGET_PROFILE_V1` matches `prd-24-1-budget.json` line for line, in BOTH directions (no fixture
 * row missing from the profile, no profile row absent from the fixture), including the A$42–50 total,
 * the approximately-A$12 hosted-model hard budget and the A$50 ceiling.
 */
import { describe, expect, it } from 'vitest';

import { BUDGET_PROFILE_V1 } from '../../src/budget/budget-profile.js';
import { loadBudgetFixture } from './fixture.js';

const fixture = loadBudgetFixture();

describe('PRD §24.1 budget profile', () => {
  it('is versioned and names its PRD section', () => {
    expect(BUDGET_PROFILE_V1.version).toBe('BUDGET_PROFILE_V1');
    expect(BUDGET_PROFILE_V1.prdSection).toBe('§24.1');
    expect(fixture.prdSection).toBe('§24.1');
  });

  it('has the seven PRD rows, in PRD order (non-vacuity)', () => {
    expect(fixture.lineItems).toHaveLength(7);
    expect(BUDGET_PROFILE_V1.lineItems).toHaveLength(fixture.lineItems.length);
    expect(BUDGET_PROFILE_V1.lineItems.map((row) => row.item)).toEqual(
      fixture.lineItems.map((row) => row.item),
    );
  });

  it.each(fixture.lineItems.map((row, index) => [index, row.item] as const))(
    'replays row %i (%s) cell for cell',
    (index, item) => {
      const expected = fixture.lineItems[index];
      const actual = BUDGET_PROFILE_V1.lineItems[index];
      expect(expected).toBeDefined();
      expect(actual).toBeDefined();
      if (!expected || !actual) return;
      expect(actual.item).toBe(item);
      expect(actual.planningBudget).toBe(expected.planningBudget);
      expect(actual.minMicroAud).toBe(BigInt(expected.minMicroAud));
      expect(actual.maxMicroAud).toBe(BigInt(expected.maxMicroAud));
      expect(actual.approximate).toBe(expected.approximate);
      expect(typeof actual.minMicroAud).toBe('bigint');
      expect(typeof actual.maxMicroAud).toBe('bigint');
    },
  );

  it('keeps the en dash the PRD uses in its ranges', () => {
    const dashed = BUDGET_PROFILE_V1.lineItems.filter((row) => row.planningBudget.includes('–'));
    expect(dashed.map((row) => row.planningBudget)).toEqual([
      'A$14–15',
      'A$4–5',
      'A$3–4',
      'A$1–2',
      'A$8–12',
    ]);
    expect(fixture.total.planningBudget).toBe('A$42–50');
  });

  it('adds up: the row minima are A$42 and the row maxima are A$50', () => {
    let minSum = 0n;
    let maxSum = 0n;
    for (const row of BUDGET_PROFILE_V1.lineItems) {
      minSum += row.minMicroAud;
      maxSum += row.maxMicroAud;
    }
    expect(minSum).toBe(42_000_000n);
    expect(maxSum).toBe(50_000_000n);
    expect(minSum).toBe(BUDGET_PROFILE_V1.totalMinMicroAud);
    expect(maxSum).toBe(BUDGET_PROFILE_V1.totalMaxMicroAud);
    expect(BUDGET_PROFILE_V1.totalMinMicroAud).toBe(BigInt(fixture.total.minMicroAud));
    expect(BUDGET_PROFILE_V1.totalMaxMicroAud).toBe(BigInt(fixture.total.maxMicroAud));
  });

  it('encodes the A$50 founder monthly ceiling and the approximately-A$12 hosted-model budget', () => {
    expect(BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud).toBe(50_000_000n);
    expect(BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud).toBe(
      BigInt(fixture.founderMonthlyCeilingMicroAud),
    );
    expect(BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud).toBe(
      BUDGET_PROFILE_V1.totalMaxMicroAud,
    );
    expect(BUDGET_PROFILE_V1.hostedModelHardBudgetMicroAud).toBe(12_000_000n);
    expect(BUDGET_PROFILE_V1.hostedModelHardBudgetMicroAud).toBe(
      BigInt(fixture.hostedModelHardBudgetMicroAud),
    );
    const hosted = BUDGET_PROFILE_V1.lineItems.find(
      (row) => row.item === 'Hosted model hard budget',
    );
    expect(hosted?.approximate).toBe(true);
    expect(hosted?.planningBudget).toBe('approximately A$12');
    expect(
      BUDGET_PROFILE_V1.lineItems.filter((row) => row.approximate).map((row) => row.item),
    ).toEqual(['Hosted model hard budget']);
  });

  it('states the 90% warning threshold once, in basis points and declaratively', () => {
    expect(BUDGET_PROFILE_V1.warningThresholdBasisPoints).toBe(9_000n);
    expect(BUDGET_PROFILE_V1.warningThresholdBasisPoints).toBe(
      BigInt(fixture.warningThresholdBasisPoints),
    );
    expect(BUDGET_PROFILE_V1.warningThresholdRatio).toBe(0.9);
    expect(BUDGET_PROFILE_V1.warningThresholdRatio).toBe(fixture.warningThresholdRatio);
    // The two must agree. This division lives in the TEST, never in `src`.
    expect(Number(BUDGET_PROFILE_V1.warningThresholdBasisPoints) / 10_000).toBe(
      BUDGET_PROFILE_V1.warningThresholdRatio,
    );
  });

  it('carries no profile field the fixture does not account for, and vice versa', () => {
    expect(Object.keys(BUDGET_PROFILE_V1).sort()).toEqual([
      'founderMonthlyCeilingMicroAud',
      'hostedModelHardBudgetMicroAud',
      'lineItems',
      'prdSection',
      'totalMaxMicroAud',
      'totalMinMicroAud',
      'version',
      'warningThresholdBasisPoints',
      'warningThresholdRatio',
    ]);
    for (const row of BUDGET_PROFILE_V1.lineItems) {
      expect(Object.keys(row).sort()).toEqual([
        'approximate',
        'item',
        'maxMicroAud',
        'minMicroAud',
        'planningBudget',
      ]);
    }
    for (const row of fixture.lineItems) {
      expect(
        BUDGET_PROFILE_V1.lineItems.some((candidate) => candidate.item === row.item),
        `${row.item} is in the fixture but not in the profile`,
      ).toBe(true);
    }
  });

  it('is deeply frozen, so no caller can move the ceiling at runtime', () => {
    expect(Object.isFrozen(BUDGET_PROFILE_V1)).toBe(true);
    expect(Object.isFrozen(BUDGET_PROFILE_V1.lineItems)).toBe(true);
    for (const row of BUDGET_PROFILE_V1.lineItems) expect(Object.isFrozen(row)).toBe(true);
  });

  it('records its provenance in the fixture (the reviewer reads it against docs/PRD.md)', () => {
    expect(fixture.$comment.join(' ')).toContain('docs/PRD.md');
    expect(fixture.prdLines).toBe('1271-1285');
  });
});
