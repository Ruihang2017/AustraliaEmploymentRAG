/**
 * Shared loaders for the four `test/legal/*.json` fixtures (FND-10 deliverable 10).
 *
 * Not a test file (vitest collects only `*.test.*`); it exists so every legal suite reads the fixtures
 * through one typed accessor instead of re-parsing them with its own ad-hoc shape.
 *
 * Lookups fail by naming what is missing rather than by returning `undefined`: with
 * `noUncheckedIndexedAccess` on, a blanket `!` would hide exactly the "row missing from the fixture"
 * case the replay tests exist to catch.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_LEGAL_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/domain */
export const PACKAGE_ROOT = join(TEST_LEGAL_DIR, '..', '..');

function read<T>(name: string): T {
  return JSON.parse(readFileSync(join(TEST_LEGAL_DIR, name), 'utf8')) as T;
}

/* ---------------------------------------------------------------- §36.2 truth table ------------ */

export type ConjunctOutcome = 'PASS' | 'FAIL';

export interface TruthTableRow {
  readonly n: number;
  readonly date: ConjunctOutcome;
  readonly jurisdiction: ConjunctOutcome;
  readonly status: ConjunctOutcome;
  readonly licence: ConjunctOutcome;
  readonly release: ConjunctOutcome;
  readonly eligible: boolean;
  readonly failures: readonly string[];
}

export interface TruthTableFixture {
  readonly $comment: readonly string[];
  readonly prdFile: string;
  readonly prdSection: string;
  readonly prdLines: string;
  readonly conjuncts: readonly string[];
  readonly failureNames: readonly string[];
  readonly basis: {
    readonly candidate: {
      readonly effective_from: string;
      readonly effective_to: string;
      readonly jurisdictions: readonly string[];
      readonly corpus_release_id: Readonly<Record<ConjunctOutcome, string>>;
      readonly legal_status: Readonly<Record<ConjunctOutcome, string>>;
      readonly licence_state: Readonly<Record<ConjunctOutcome, string>>;
    };
    readonly request: {
      readonly legal_as_at: Readonly<Record<ConjunctOutcome, string>>;
      readonly jurisdictions: Readonly<Record<ConjunctOutcome, readonly string[]>>;
      readonly request_mode: string;
      readonly corpus_release_id: string;
      readonly use: string;
    };
  };
  readonly rows: readonly TruthTableRow[];
}

export function loadTruthTable(): TruthTableFixture {
  return read<TruthTableFixture>('prd-36-2-eligibility.json');
}

export function truthTableRow(fixture: TruthTableFixture, n: number): TruthTableRow {
  const found = fixture.rows.find((row) => row.n === n);
  if (!found) throw new Error(`§36.2 truth-table row ${String(n)} is missing from prd-36-2-eligibility.json`);
  return found;
}

/* ---------------------------------------------------------------- §9.1 hierarchy --------------- */

export interface HierarchyRow {
  readonly rank: number;
  readonly level: string;
  readonly prdText: string;
}

export interface HierarchyFixture {
  readonly prdFile: string;
  readonly prdSection: string;
  readonly prdLines: string;
  readonly closingRule: string;
  readonly levels: readonly HierarchyRow[];
}

export function loadHierarchy(): HierarchyFixture {
  return read<HierarchyFixture>('prd-9-1-hierarchy.json');
}

/* ---------------------------------------------------------------- §36.3 feature order ---------- */

export interface FeatureRow {
  readonly position: number;
  readonly feature: string;
  readonly prdText: string;
}

export interface FeatureFixture {
  readonly prdFile: string;
  readonly prdSection: string;
  readonly prdLines: string;
  readonly preamble: string;
  readonly closingRule: string;
  readonly features: readonly FeatureRow[];
}

export function loadFeatures(): FeatureFixture {
  return read<FeatureFixture>('prd-36-3-features.json');
}

/* ---------------------------------------------------------------- boundary dates --------------- */

export interface IntervalLiteral {
  readonly effective_from: string;
  readonly effective_to: string | null;
}

export interface ContainmentCase {
  readonly case: string;
  readonly interval: IntervalLiteral;
  readonly date: string;
  readonly contains: boolean;
}

export interface NonOverlapCase {
  readonly case: string;
  readonly versions: readonly IntervalLiteral[];
  readonly expected: readonly { readonly left: number; readonly right: number; readonly reason: string }[];
}

export interface BoundaryFixture {
  readonly prdFile: string;
  readonly prdSections: readonly string[];
  readonly containment: readonly ContainmentCase[];
  readonly adjacentVersions: {
    readonly versions: readonly IntervalLiteral[];
    readonly dates: readonly string[];
  };
  readonly nonOverlap: readonly NonOverlapCase[];
  readonly financialYears: readonly { readonly date: string; readonly financialYear: string }[];
  readonly malformedDates: readonly string[];
  readonly wellFormedDates: readonly string[];
}

export function loadBoundaryDates(): BoundaryFixture {
  return read<BoundaryFixture>('boundary-dates.json');
}
