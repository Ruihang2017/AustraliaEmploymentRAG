/**
 * FND-06 acceptance item 2 — fixture completeness. A deleted cell fails; a deleted row fails; a cell
 * naming a condition nobody implements fails; and a condition nobody uses fails too, because an
 * unused predicate is a rule that silently stopped applying.
 */
import { describe, expect, it } from 'vitest';

import { CONDITION_VALUES } from '../../src/access/conditions.js';
import { PERMISSION_VALUES, ROLE_VALUES } from '../../src/access/contracts.js';
import { PRINCIPAL_COLUMN_VALUES } from '../../src/access/principal.js';
import { cellOf, loadMatrixFixture } from './fixture.js';

const fixture = loadMatrixFixture();

describe('shape', () => {
  it('has exactly 14 action rows', () => {
    expect(fixture.rows.length).toBe(14);
  });

  it('has exactly 6 principal columns and 84 cells, none null or absent', () => {
    let cells = 0;
    for (const row of fixture.rows) {
      expect(Object.keys(row.cells).length, row.permission).toBe(6);
      for (const column of fixture.columns) {
        const cell = cellOf(row, column);
        expect(cell, `${row.permission} / ${column}`).not.toBeNull();
        expect(typeof cell.prdText).toBe('string');
        expect(cell.prdText.length).toBeGreaterThan(0);
        expect(['ALLOW', 'DENY', 'CONDITIONAL']).toContain(cell.kind);
        cells += 1;
      }
    }
    expect(cells).toBe(84);
  });
});

describe('vocabulary (FND-03 owns the words; this ticket owns the matrix)', () => {
  it('lists the actions in PERMISSION_VALUES order', () => {
    expect(fixture.rows.map((row) => row.permission)).toEqual([...PERMISSION_VALUES]);
  });

  it('lists the columns as the five roles then the service account', () => {
    expect([...fixture.columns]).toEqual([...ROLE_VALUES, 'SERVICE_ACCOUNT']);
    expect([...fixture.columns]).toEqual([...PRINCIPAL_COLUMN_VALUES]);
  });
});

describe('conditions', () => {
  const used = new Set<string>();
  for (const row of fixture.rows) {
    for (const column of fixture.columns) {
      const cell = cellOf(row, column);
      if (cell.kind === 'CONDITIONAL' && cell.condition !== undefined) used.add(cell.condition);
    }
  }

  it('every CONDITIONAL cell names a condition, and only implemented ones', () => {
    for (const row of fixture.rows) {
      for (const column of fixture.columns) {
        const cell = cellOf(row, column);
        if (cell.kind !== 'CONDITIONAL') continue;
        expect(cell.condition, `${row.permission} / ${column}`).toBeDefined();
        expect(CONDITION_VALUES, `${row.permission} / ${column}`).toContain(cell.condition);
      }
    }
  });

  it('every implemented condition is used by at least one cell', () => {
    const unused = CONDITION_VALUES.filter((name) => !used.has(name));
    expect(unused, `conditions no §38.1 cell uses: ${unused.join(', ')}`).toEqual([]);
  });

  it('non-CONDITIONAL cells carry no condition', () => {
    for (const row of fixture.rows) {
      for (const column of fixture.columns) {
        const cell = cellOf(row, column);
        if (cell.kind === 'CONDITIONAL') continue;
        expect(cell.condition, `${row.permission} / ${column}`).toBeUndefined();
      }
    }
  });
});
