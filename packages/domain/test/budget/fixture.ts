/**
 * Typed loaders for the two `test/budget/*.json` fixtures and for `docs/PRD.md` (FND-09 deliverable 13).
 *
 * Not a `*.test.*` file, so Vitest does not collect it. Paths are resolved from `import.meta.url`,
 * never from `process.cwd()`.
 *
 * Big integers are stored as JSON strings and parsed with `BigInt(...)`: `JSON.parse` routes numbers
 * through a double, which is exactly the floating-point money PRD §34.1 forbids.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_BUDGET_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/domain */
export const PACKAGE_ROOT = join(TEST_BUDGET_DIR, '..', '..');
/** the repository root */
export const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');

function read<T>(name: string): T {
  return JSON.parse(readFileSync(join(TEST_BUDGET_DIR, name), 'utf8')) as T;
}

export interface BudgetFixtureRow {
  readonly item: string;
  readonly label: string;
  readonly planningBudget: string;
  readonly lowMicroAud: string;
  readonly highMicroAud: string;
}

export interface BudgetFixtureReserveOrderEntry {
  readonly position: number;
  readonly reserveClass: string;
  readonly prdText: string;
}

export interface BudgetFixture {
  readonly $comment: readonly string[];
  readonly prdFile: string;
  readonly prdSection: string;
  readonly prdLines: string;
  readonly heading: string;
  readonly rows: readonly BudgetFixtureRow[];
  readonly closingRule: string;
  readonly derived: {
    readonly founderMonthlyCeilingMicroAud: string;
    readonly founderMonthlyCeilingDerivation: string;
    readonly hostedModelHardBudgetMicroAud: string;
    readonly hostedModelHardBudgetDerivation: string;
    readonly totalLowMicroAud: string;
    readonly totalHighMicroAud: string;
    readonly totalDerivation: string;
    readonly warningThresholdBasisPoints: string;
    readonly warningThresholdMicroAud: string;
    readonly warningThresholdDerivation: string;
  };
  readonly prd42_6: {
    readonly prdSection: string;
    readonly prdLines: string;
    readonly ceilingSentence: string;
    readonly reserveOrder: readonly BudgetFixtureReserveOrderEntry[];
    readonly failClosedSentence: string;
    readonly byokSentence: string;
  };
}

export interface LimitsFixtureBoundary {
  readonly key: string;
  readonly boundary: string;
  readonly trial: string;
  readonly paidPilot: string;
  readonly systemHardProtection: string;
}

export interface LimitsFixture {
  readonly $comment: readonly string[];
  readonly prdFile: string;
  readonly prdSection: string;
  readonly prdLines: string;
  readonly heading: string;
  readonly boundaries: readonly LimitsFixtureBoundary[];
  readonly closingLines: readonly string[];
  readonly closingRules: readonly string[];
  readonly quotaLedgerKinds: readonly string[];
  readonly section24_4: {
    readonly prdSection: string;
    readonly prdLines: string;
    readonly heading: string;
    readonly sentence: string;
    readonly fundingLedgerLines: readonly string[];
    readonly concurrency: Readonly<Record<string, string>>;
  };
  readonly section8_2: { readonly prdSection: string; readonly sentence: string };
}

export function loadBudgetFixture(): BudgetFixture {
  return read<BudgetFixture>('prd-24-1-budget.json');
}

export function loadLimitsFixture(): LimitsFixture {
  return read<LimitsFixture>('prd-38-5-limits.json');
}

/**
 * docs/PRD.md, with line endings normalised to LF (it is committed with CRLF and materialised with
 * CRLF on Windows). Only newlines are touched — no character of the prose, and no en dash, is changed.
 */
export function loadPrd(): string {
  return readFileSync(join(REPO_ROOT, 'docs', 'PRD.md'), 'utf8').replace(/\r\n/g, '\n');
}

/** A wrapped PRD paragraph as one line, so a wrapped source can be compared with an unwrapped constant. */
export function unwrap(lines: readonly string[]): string {
  return lines.join(' ');
}

/** JSON.stringify that survives bigint — used by the tenant-isolation scan. */
export function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    typeof entry === 'bigint' ? `${entry.toString()}n` : entry,
  );
}
