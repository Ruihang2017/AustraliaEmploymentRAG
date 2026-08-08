/**
 * Shared loader for test/access/prd-38-1-matrix.json (FND-06 deliverable 8).
 *
 * Not a test file (vitest collects only `*.test.*`); it exists so every access suite reads the
 * fixture through one typed accessor instead of re-parsing it with its own ad-hoc shape — the same
 * shape `packages/contracts/test/enums/fixture.ts` set for `FND-03`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CellEffect, ConditionName, Intent, PrincipalKey } from '../../src/access/index.js';

export const TEST_ACCESS_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/domain */
export const PACKAGE_ROOT = join(TEST_ACCESS_DIR, '..', '..');
export const FIXTURE_RELATIVE_PATH = 'test/access/prd-38-1-matrix.json';

export interface FixtureCell {
  readonly prdText: string;
  readonly effect: CellEffect;
  readonly condition?: ConditionName;
  readonly maxIntent?: Intent;
}

export interface FixtureRow {
  readonly permission: string;
  readonly prdAction: string;
  readonly cells: Readonly<Record<string, FixtureCell>>;
}

export interface MatrixFixture {
  readonly $comment: readonly string[];
  readonly prdSource: string;
  readonly ownGloss: string;
  readonly closingRule: string;
  readonly principals: readonly string[];
  readonly prdPrincipalLabels: Readonly<Record<string, string>>;
  readonly rows: readonly FixtureRow[];
}

export function loadFixture(): MatrixFixture {
  return JSON.parse(
    readFileSync(join(PACKAGE_ROOT, FIXTURE_RELATIVE_PATH), 'utf8'),
  ) as MatrixFixture;
}

/** Every (row, principal) pair of the fixture, flattened — 84 of them. */
export function fixtureCells(
  fixture: MatrixFixture,
): readonly { row: FixtureRow; principal: PrincipalKey; cell: FixtureCell }[] {
  const flattened: { row: FixtureRow; principal: PrincipalKey; cell: FixtureCell }[] = [];
  for (const row of fixture.rows) {
    for (const principal of fixture.principals) {
      const cell = row.cells[principal];
      if (cell === undefined) {
        throw new Error(`${FIXTURE_RELATIVE_PATH}: ${row.permission} has no ${principal} cell`);
      }
      flattened.push({ row, principal: principal as PrincipalKey, cell });
    }
  }
  return flattened;
}
