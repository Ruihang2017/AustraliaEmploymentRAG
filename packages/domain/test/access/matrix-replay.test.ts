/**
 * FND-06 acceptance item 1 — the 84-cell replay (AUTH-003: "Permission matrix in §38 passes").
 *
 * ONE `it()` PER CELL, not one aggregate assertion: the ticket's Reviewer step 2 counts them, and an
 * aggregate loop inside a single test reports one failure however many cells regressed.
 */
import { describe, expect, it } from 'vitest';

import type { ConditionName } from '../../src/access/conditions.js';
import type { Permission } from '../../src/access/contracts.js';
import { evaluate } from '../../src/access/evaluate.js';
import { ROLE_MATRIX, cell } from '../../src/access/matrix.js';
import type { PrincipalColumn } from '../../src/access/principal.js';
import { cellOf, loadMatrixFixture } from './fixture.js';
import { denyProbes, satisfiedInput, unsatisfiedInput } from './generators.js';

const fixture = loadMatrixFixture();

describe('the implementation agrees with the fixture, cell for cell', () => {
  for (const row of fixture.rows) {
    const action = row.permission as Permission;
    for (const column of fixture.columns as readonly PrincipalColumn[]) {
      const expected = cellOf(row, column);
      it(`${row.permission} / ${column} is ${expected.kind} ("${expected.prdText}")`, () => {
        const actual = cell(action, column);
        expect(actual.kind).toBe(expected.kind);
        expect(actual.prdText).toBe(expected.prdText);
        if (actual.kind === 'CONDITIONAL') expect(actual.condition).toBe(expected.condition);
        if (actual.kind === 'DENY') expect(actual.reason).toBe(expected.reason);
      });
    }
  }

  it('the matrix carries exactly the fixture rows and columns (nothing extra)', () => {
    expect(Object.keys(ROLE_MATRIX)).toEqual(fixture.rows.map((entry) => entry.permission));
    for (const row of fixture.rows) {
      expect(Object.keys(ROLE_MATRIX[row.permission as Permission])).toEqual([...fixture.columns]);
    }
  });
});

describe('evaluate() replays every cell of PRD §38.1', () => {
  for (const row of fixture.rows) {
    const action = row.permission as Permission;
    for (const column of fixture.columns as readonly PrincipalColumn[]) {
      const expected = cellOf(row, column);
      const label = `${row.permission} / ${column} ("${expected.prdText}")`;

      if (expected.kind === 'ALLOW') {
        it(`ALLOW  ${label}`, () => {
          const decision = evaluate(satisfiedInput(action, column));
          expect(decision, label).toEqual({ allowed: true, via: action });
        });
        continue;
      }

      if (expected.kind === 'DENY') {
        it(`DENY   ${label}`, () => {
          for (const input of denyProbes(action, column)) {
            const decision = evaluate(input);
            expect(decision.allowed, label).toBe(false);
            if (decision.allowed) continue;
            expect(decision.reason, label).toBe(expected.reason ?? 'ROLE_LACKS_PERMISSION');
          }
        });
        continue;
      }

      const condition = expected.condition as ConditionName;
      it(`COND   ${label} -> ${String(condition)}`, () => {
        // Denied when the condition does not hold.
        const denied = evaluate(unsatisfiedInput(action, column));
        expect(denied.allowed, label).toBe(false);
        if (!denied.allowed) {
          const reason =
            condition === 'SEPARATE_INTERNAL_IDENTITY'
              ? 'SEPARATE_INTERNAL_IDENTITY_REQUIRED'
              : 'CONDITION_NOT_MET';
          expect(denied.reason, label).toBe(reason);
          expect(denied.condition, label).toBe(condition);
        }

        if (condition === 'SEPARATE_INTERNAL_IDENTITY') {
          // PRD §38.1's last row is never satisfiable by an organisation principal — there is no
          // "allowed" half to assert, and inventing one would be inventing a rule.
          const stillDenied = evaluate(satisfiedInput(action, column, condition));
          expect(stillDenied.allowed, label).toBe(false);
          return;
        }

        // Allowed when it does.
        const allowed = evaluate(satisfiedInput(action, column, condition));
        expect(allowed, label).toEqual({ allowed: true, via: action });
      });
    }
  }
});
