/**
 * FND-06 acceptance item 1 (`[fixture]`, requirement **AUTH-003** — "Permission matrix in §38
 * passes"): all **84** cells of `prd-38-1-matrix.json` asserted **individually**, one `it` per cell,
 * never one aggregate assertion.
 *
 * Each cell is checked twice over:
 *   - the fixture's reading of the PRD text equals `ROLE_MATRIX`'s, so the transcript and the code
 *     cannot drift apart in either direction; and
 *   - `evaluate()` behaves as the cell says — `ALLOW` allows under a satisfying context, `DENY`
 *     always denies, `CONDITIONAL` allows only when its named condition holds and otherwise denies
 *     with `CONDITION_NOT_MET` carrying that name.
 */
import { describe, expect, it } from 'vitest';

import type { Permission } from '../../../contracts/src/enums/index.js';
import { CONDITION_PREDICATES, ROLE_MATRIX, evaluate } from '../../src/access/index.js';
import { fixtureCells, loadFixture } from './fixture.js';
import { satisfyingInput, unsatisfyingInput } from './scenario.js';

const fixture = loadFixture();
const cells = fixtureCells(fixture);

describe('PRD §38.1 matrix replay', () => {
  it('replays exactly 84 cells (14 rows × 6 principals)', () => {
    expect(cells).toHaveLength(84);
  });

  it.each(cells.map((entry) => [`${entry.row.permission} × ${entry.principal}`, entry] as const))(
    '%s',
    (_title, entry) => {
      const action = entry.row.permission as Permission;
      const { principal, cell } = entry;

      // 1. The transcript and the implementation agree, field for field.
      const implemented = ROLE_MATRIX[action][principal];
      expect(implemented.prdText).toBe(cell.prdText);
      expect(implemented.effect).toBe(cell.effect);
      expect(implemented.condition).toBe(cell.condition);
      expect(implemented.maxIntent).toBe(cell.maxIntent);

      const satisfied = evaluate(satisfyingInput(action, principal));
      const unsatisfied = evaluate(unsatisfyingInput(action, principal));

      // 2. PRD §38.1's final row denies every principal before any cell is read (deliverable 3).
      if (action === 'INTERNAL_ADMIN') {
        expect(satisfied).toEqual({
          allowed: false,
          reason: 'SEPARATE_INTERNAL_IDENTITY_REQUIRED',
        });
        expect(unsatisfied).toEqual(satisfied);
        return;
      }

      if (cell.effect === 'ALLOW') {
        expect(satisfied).toEqual({ allowed: true, via: action });
        return;
      }

      if (cell.effect === 'DENY') {
        // A denied cell denies under every context, generous or not.
        expect(satisfied).toEqual({ allowed: false, reason: 'ROLE_LACKS_PERMISSION' });
        expect(unsatisfied).toEqual({ allowed: false, reason: 'ROLE_LACKS_PERMISSION' });
        return;
      }

      // 3. CONDITIONAL — the condition is a real predicate, and it decides the cell.
      const condition = cell.condition;
      if (condition === undefined) throw new Error(`${action} × ${principal} names no condition`);
      expect(typeof CONDITION_PREDICATES[condition]).toBe('function');

      if (condition === 'SEPARATE_INTERNAL_IDENTITY') {
        throw new Error('the internal-admin row is handled above and must not reach here');
      }

      expect(satisfied).toEqual({ allowed: true, via: action });

      // A service account is stopped by the universal scope gate first when it holds no scope; with
      // scopes it reaches — and fails — the cell's own condition.
      const expectedCondition =
        principal === 'SERVICE_ACCOUNT' ? 'SCOPED_CREDENTIAL_REQUIRED' : condition;
      expect(unsatisfied).toEqual({
        allowed: false,
        reason: 'CONDITION_NOT_MET',
        condition: expectedCondition,
      });

      if (principal === 'SERVICE_ACCOUNT' && condition !== 'SCOPED_CREDENTIAL_REQUIRED') {
        expect(evaluate(unsatisfyingInput(action, principal, { withScopes: true }))).toEqual({
          allowed: false,
          reason: 'CONDITION_NOT_MET',
          condition,
        });
      }

      // 4. The read-only cap two cells carry ("read shared", "read-only export if granted").
      if (cell.maxIntent === 'READ') {
        const write = satisfyingInput(action, principal);
        expect(evaluate({ ...write, context: { ...write.context, intent: 'WRITE' } })).toEqual({
          allowed: false,
          reason: 'WRITE_INTENT_NOT_PERMITTED',
        });
      }
    },
  );
});

describe('the internal-admin condition is a predicate, not a comment', () => {
  it('is constantly false', () => {
    const input = satisfyingInput('INTERNAL_ADMIN', 'SERVICE_ACCOUNT');
    expect(CONDITION_PREDICATES.SEPARATE_INTERNAL_IDENTITY(input)).toBe(false);
  });
});
