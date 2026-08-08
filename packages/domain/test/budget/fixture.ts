/**
 * FND-09 — shared loader for the two PRD fixtures (deliverable 13).
 *
 * Not a test file (vitest collects only `*.test.*`). The JSON is READ AND PARSED rather than
 * `import`ed: `resolveJsonModule` is not set in `tsconfig.base.json` and this ticket may not change
 * it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_BUDGET_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/domain */
export const PACKAGE_ROOT = join(TEST_BUDGET_DIR, '..', '..');

export const BUDGET_FIXTURE_RELATIVE_PATH = 'test/budget/prd-24-1-budget.json';
export const LIMITS_FIXTURE_RELATIVE_PATH = 'test/budget/prd-38-5-limits.json';

export interface BudgetFixtureLineItem {
  readonly item: string;
  readonly planningBudget: string;
  readonly minMicroAud: string;
  readonly maxMicroAud: string;
  readonly approximate: boolean;
}

export interface BudgetFixture {
  readonly $comment: readonly string[];
  readonly prdSection: string;
  readonly prdLines: string;
  readonly lineItems: readonly BudgetFixtureLineItem[];
  readonly total: {
    readonly item: string;
    readonly planningBudget: string;
    readonly minMicroAud: string;
    readonly maxMicroAud: string;
  };
  readonly hostedModelHardBudgetMicroAud: string;
  readonly founderMonthlyCeilingMicroAud: string;
  readonly warningThresholdRatio: number;
  readonly warningThresholdBasisPoints: string;
}

export interface LimitsFixtureCell {
  readonly text: string;
  readonly count: number | null;
  readonly perMinutes: number | null;
  readonly period: string | null;
  readonly scope: string | null;
}

export interface LimitsFixtureRow {
  readonly boundary: string;
  readonly prdLabel: string;
  readonly trial: LimitsFixtureCell;
  readonly paidPilot: LimitsFixtureCell;
  readonly systemHardProtection: LimitsFixtureCell;
}

export interface LimitsFixture {
  readonly $comment: readonly string[];
  readonly prdSection: string;
  readonly prdLines: string;
  readonly rows: readonly LimitsFixtureRow[];
  readonly perOrganisationConcurrencyDefaults: {
    readonly prdSection: string;
    readonly prdLines: string;
    readonly prdText: string;
    readonly quick: number;
    readonly deep: number;
    readonly export: number;
  };
}

export function loadBudgetFixture(): BudgetFixture {
  return JSON.parse(
    readFileSync(join(PACKAGE_ROOT, BUDGET_FIXTURE_RELATIVE_PATH), 'utf8'),
  ) as BudgetFixture;
}

export function loadLimitsFixture(): LimitsFixture {
  return JSON.parse(
    readFileSync(join(PACKAGE_ROOT, LIMITS_FIXTURE_RELATIVE_PATH), 'utf8'),
  ) as LimitsFixture;
}
