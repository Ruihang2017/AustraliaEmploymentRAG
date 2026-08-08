/**
 * Shared loader for test/workflow/prd-32-6-transitions.json (FND-08 deliverable 8).
 *
 * Not a test file (vitest collects only `*.test.*`); it exists so every workflow suite reads the
 * fixture through one typed accessor instead of re-parsing it with its own ad-hoc shape.
 *
 * Lookups fail by naming what is missing rather than by returning `undefined` — with
 * `noUncheckedIndexedAccess` on, a blanket `!` would hide exactly the "row missing from the fixture"
 * case the replay test exists to catch.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_WORKFLOW_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/domain */
export const PACKAGE_ROOT = join(TEST_WORKFLOW_DIR, '..', '..');
export const FIXTURE_RELATIVE_PATH = 'test/workflow/prd-32-6-transitions.json';

export interface FixtureRow {
  readonly row: number;
  readonly fromCell: string;
  readonly toCell: string;
  readonly actorCell: string;
  readonly conditionCell: string;
  readonly actors: readonly string[];
  readonly conditions: readonly string[];
  readonly expandsTo: readonly (readonly string[])[];
  readonly expansionNote: string;
}

export interface FixtureExpansionEntry {
  readonly n: number;
  readonly from: string;
  readonly to: string;
  readonly row: number;
}

export interface TransitionFixture {
  readonly $comment: readonly string[];
  readonly prdSection: string;
  readonly prdFile: string;
  readonly prdLines: string;
  readonly states: readonly string[];
  readonly rows: readonly FixtureRow[];
  readonly expansion: readonly FixtureExpansionEntry[];
  readonly conditionVocabulary: Readonly<Record<string, string>>;
  readonly materialTriggerVocabulary: Readonly<Record<string, string>>;
  readonly actorVocabulary: Readonly<Record<string, string>>;
}

export function loadFixture(): TransitionFixture {
  return JSON.parse(
    readFileSync(join(PACKAGE_ROOT, FIXTURE_RELATIVE_PATH), 'utf8'),
  ) as TransitionFixture;
}

/** The fixture row with that §32.6 row number, or a failure that names the missing row. */
export function rowOf(fixture: TransitionFixture, row: number): FixtureRow {
  const found = fixture.rows.find((candidate) => candidate.row === row);
  if (!found) throw new Error(`§32.6 row ${row} is missing from ${FIXTURE_RELATIVE_PATH}`);
  return found;
}
