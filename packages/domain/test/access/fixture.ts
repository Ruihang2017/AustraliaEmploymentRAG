/**
 * Typed loaders for `test/access/prd-38-1-matrix.json` and for `docs/PRD.md` (FND-06 deliverable 8).
 *
 * Not a `*.test.*` file, so Vitest does not collect it. Paths are resolved from `import.meta.url`,
 * never from `process.cwd()`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_ACCESS_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/domain */
export const PACKAGE_ROOT = join(TEST_ACCESS_DIR, '..', '..');
/** the repository root */
export const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');

export type FixtureKind = 'ALLOW' | 'DENY' | 'CONDITIONAL';

export interface FixtureCell {
  readonly prdText: string;
  readonly kind: FixtureKind;
  readonly condition?: string;
  readonly reason?: string;
}

export interface FixtureRow {
  readonly permission: string;
  readonly prdAction: string;
  readonly prdRowLine: string;
  readonly cells: Readonly<Record<string, FixtureCell>>;
}

export interface MatrixFixture {
  readonly $comment: readonly string[];
  readonly prdFile: string;
  readonly prdSection: string;
  readonly heading: string;
  readonly ownParagraphLines: readonly string[];
  readonly headerLine: string;
  readonly separatorLine: string;
  readonly columns: readonly string[];
  readonly prdColumnLabels: readonly string[];
  readonly rows: readonly FixtureRow[];
  readonly closingRuleLines: readonly string[];
}

export function loadMatrixFixture(): MatrixFixture {
  return JSON.parse(
    readFileSync(join(TEST_ACCESS_DIR, 'prd-38-1-matrix.json'), 'utf8'),
  ) as MatrixFixture;
}

/**
 * docs/PRD.md, with line endings normalised to LF (it is committed with CRLF and materialised with
 * CRLF on Windows). Only newlines are touched — no character of the prose, and no dash, is changed.
 */
export function loadPrd(): string {
  return readFileSync(join(REPO_ROOT, 'docs', 'PRD.md'), 'utf8').replace(/\r\n/g, '\n');
}

/** A wrapped PRD paragraph as one line, so a wrapped source can be compared with one constant. */
export function unwrap(lines: readonly string[]): string {
  return lines.join(' ');
}

/** Named lookup that throws instead of returning `undefined` — `test/**` is not typechecked. */
export function rowOf(fixture: MatrixFixture, permission: string): FixtureRow {
  const row = fixture.rows.find((candidate) => candidate.permission === permission);
  if (row === undefined) throw new Error(`no fixture row for ${permission}`);
  return row;
}

export function cellOf(row: FixtureRow, column: string): FixtureCell {
  const cell = row.cells[column];
  if (cell === undefined) throw new Error(`no fixture cell ${row.permission} / ${column}`);
  return cell;
}

/** The markdown row line this fixture row describes, rebuilt from its own parts. */
export function rebuildRowLine(fixture: MatrixFixture, row: FixtureRow): string {
  const cells = fixture.columns.map((column) => cellOf(row, column).prdText);
  return `| ${row.prdAction} | ${cells.join(' | ')} |`;
}
