/**
 * Shared typed loader for test/answers/prd-36-8-refusal.json (FND-07 deliverable 9).
 *
 * Not a `*.test.*` file, so Vitest does not collect it: every suite reads the fixture through this one
 * accessor instead of re-parsing it with an ad-hoc shape. The path is resolved from
 * `import.meta.url`, never from `process.cwd()`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AnswerSignals, AnswerStatus, RefusalConditionName } from '../../src/answers/index.js';

export const TEST_ANSWERS_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/domain */
export const PACKAGE_ROOT = join(TEST_ANSWERS_DIR, '..', '..');
/** the repository root */
export const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
export const FIXTURE_RELATIVE_PATH = 'test/answers/prd-36-8-refusal.json';

export interface FixtureStatusRow {
  readonly condition_text: string;
  readonly result: AnswerStatus;
  readonly condition: RefusalConditionName;
}

export interface FixtureNonStatusRow {
  readonly condition_text: string;
  readonly result_text: string;
  readonly kind: 'PRE_ADMISSION_REJECTION' | 'REFUSAL' | 'JOB_UNAVAILABLE';
  readonly error_code: string | null;
  readonly prd_basis: string;
}

export interface FixtureDecisionCase {
  readonly name: string;
  readonly signals: AnswerSignals;
  readonly expected_status: AnswerStatus;
  readonly expected_conditions: readonly RefusalConditionName[];
}

export interface FixtureDerivedCondition {
  readonly condition: RefusalConditionName;
  readonly status: AnswerStatus;
  readonly basis: string;
  readonly why: string;
  readonly cases: readonly FixtureDecisionCase[];
}

export interface FixtureSection {
  readonly ordinal: number;
  readonly prd_text: string;
  readonly id: string;
}

export interface FixturePositiveCase {
  readonly text: string;
  readonly kind: 'PROHIBITED_PHRASE' | 'MODEL_CONFIDENCE_PERCENTAGE';
  readonly pattern: string;
}

export interface RefusalFixture {
  readonly $comment: readonly string[];
  readonly prd_section: string;
  readonly prd_lines: string;
  readonly prd_36_8: {
    readonly status_rows: readonly FixtureStatusRow[];
    readonly non_status_rows: readonly FixtureNonStatusRow[];
    readonly closing_paragraph_lines: readonly string[];
  };
  readonly derived_conditions: readonly FixtureDerivedCondition[];
  readonly precedence: {
    readonly order: readonly AnswerStatus[];
    readonly basis: string;
    readonly cases: readonly FixtureDecisionCase[];
  };
  readonly answer_structure: {
    readonly prd_section: string;
    readonly sections: readonly FixtureSection[];
    readonly short_answer_values: readonly string[];
  };
  readonly claim_support: {
    readonly prd_section: string;
    readonly values: readonly string[];
    readonly citation_roles: readonly string[];
    readonly background_only_rule: string;
  };
  readonly definitive_claim: {
    readonly basis: string;
    readonly rule: string;
    readonly definitive_short_answers: readonly string[];
    readonly non_definitive_short_answers: readonly string[];
  };
  readonly prohibited_language: {
    readonly prd_section: string;
    readonly positive: readonly FixturePositiveCase[];
    readonly negative: readonly string[];
  };
}

export function loadFixture(): RefusalFixture {
  return JSON.parse(
    readFileSync(join(PACKAGE_ROOT, FIXTURE_RELATIVE_PATH), 'utf8'),
  ) as RefusalFixture;
}

/**
 * docs/PRD.md, read once so the transcription suite can prove the fixture matches the source.
 *
 * Line endings are normalised to LF: docs/PRD.md is committed with CRLF, and the fixture's
 * multi-line transcriptions are stored with LF. The normalisation is about newlines only — no
 * character of the prose, and none of its curly quotes, is touched.
 */
export function loadPrd(): string {
  return readFileSync(join(REPO_ROOT, 'docs', 'PRD.md'), 'utf8').replace(/\r\n/g, '\n');
}

/** The derived condition entry, looked up by name rather than by index. */
export function derivedCondition(
  fixture: RefusalFixture,
  condition: RefusalConditionName,
): FixtureDerivedCondition {
  const found = fixture.derived_conditions.find((entry) => entry.condition === condition);
  if (!found) throw new Error(`derived condition ${condition} is missing from ${FIXTURE_RELATIVE_PATH}`);
  return found;
}
