/**
 * FND-06 acceptance item 2 (`[machine]`) — the fixture has exactly 14 actions × 6 principals and no
 * cell is `null` or absent. A deleted cell, a reordered row or an orphaned condition fails here.
 *
 * Row order matters: `PERMISSION_VALUES` is "one per action row of the PRD §38.1 role matrix, in
 * matrix row order" (`FND-03`), so row *n* of the printed table must be `PERMISSION_VALUES[n - 1]`.
 */
import { describe, expect, it } from 'vitest';

import { PERMISSION_VALUES, ROLE_VALUES } from '../../../contracts/src/enums/index.js';
import {
  ACTION_SPECS,
  CONDITION_NAMES,
  PRINCIPAL_KEYS,
  ROLE_MATRIX,
  isConditionName,
} from '../../src/access/index.js';
import { fixtureCells, loadFixture } from './fixture.js';

const fixture = loadFixture();
const cells = fixtureCells(fixture);

describe('fixture completeness', () => {
  it('carries its provenance and the PRD gloss and closing rule', () => {
    expect(fixture.prdSource).toContain('docs/PRD.md');
    expect(fixture.ownGloss).toContain('owned by or explicitly shared with the member');
    expect(fixture.closingRule).toContain(
      'a role alone never authorises a record from another organisation',
    );
    expect(fixture.$comment.length).toBeGreaterThan(3);
  });

  it('has 14 rows in PERMISSION_VALUES order', () => {
    expect(fixture.rows).toHaveLength(14);
    expect(fixture.rows.map((row) => row.permission)).toEqual([...PERMISSION_VALUES]);
  });

  it('has the 6 PRD §38.1 columns, the five roles then the service account', () => {
    expect(fixture.principals).toEqual([...ROLE_VALUES, 'SERVICE_ACCOUNT']);
    expect(fixture.principals).toEqual([...PRINCIPAL_KEYS]);
    expect(Object.keys(fixture.prdPrincipalLabels).sort()).toEqual([...fixture.principals].sort());
  });

  it('has 84 cells, none null, none absent, each with a non-empty PRD text', () => {
    expect(cells).toHaveLength(84);
    for (const { row, principal, cell } of cells) {
      expect(cell, `${row.permission} × ${principal}`).not.toBeNull();
      expect(cell.prdText.length, `${row.permission} × ${principal}`).toBeGreaterThan(0);
      expect(['ALLOW', 'DENY', 'CONDITIONAL']).toContain(cell.effect);
    }
  });

  it('names a condition on exactly the CONDITIONAL cells, and only known conditions', () => {
    for (const { row, principal, cell } of cells) {
      const label = `${row.permission} × ${principal}`;
      if (cell.effect === 'CONDITIONAL') {
        expect(isConditionName(cell.condition), `${label} names ${String(cell.condition)}`).toBe(
          true,
        );
      } else {
        expect(cell.condition, label).toBeUndefined();
      }
    }
  });

  it('uses every declared condition at least once (an orphan condition is a deleted rule)', () => {
    const used = new Set(cells.map(({ cell }) => cell.condition).filter(Boolean));
    expect([...CONDITION_NAMES].filter((name) => !used.has(name))).toEqual([]);
    expect(used.size).toBe(CONDITION_NAMES.length);
  });

  it('matches ROLE_MATRIX and ACTION_SPECS row for row', () => {
    expect(Object.keys(ROLE_MATRIX)).toEqual([...PERMISSION_VALUES]);
    expect(Object.keys(ACTION_SPECS)).toEqual([...PERMISSION_VALUES]);
    for (const row of fixture.rows) {
      expect(Object.keys(ROLE_MATRIX[row.permission as keyof typeof ROLE_MATRIX])).toEqual([
        ...fixture.principals,
      ]);
      expect(ACTION_SPECS[row.permission as keyof typeof ACTION_SPECS].prdAction).toBe(
        row.prdAction,
      );
    }
  });

  it('freezes the matrix, the specs and the predicates against runtime mutation', () => {
    expect(Object.isFrozen(ROLE_MATRIX)).toBe(true);
    expect(Object.isFrozen(ROLE_MATRIX.CORPUS_SEARCH_READ)).toBe(true);
    expect(Object.isFrozen(ROLE_MATRIX.CORPUS_SEARCH_READ.OWNER)).toBe(true);
    expect(Object.isFrozen(ACTION_SPECS)).toBe(true);
    expect(Object.isFrozen(ACTION_SPECS.CORPUS_SEARCH_READ)).toBe(true);
  });
});
