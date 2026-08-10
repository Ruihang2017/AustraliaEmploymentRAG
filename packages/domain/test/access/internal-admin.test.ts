/**
 * FND-06 acceptance item 8 — PRD §38.1's final row: internal source/release/incident administration is
 * "separate internal identity only". Every organisation principal, the Owner included, is denied with
 * `SEPARATE_INTERNAL_IDENTITY_REQUIRED`.
 *
 * The resource is same-organisation or absent on purpose: a cross-organisation resource would
 * legitimately return `CROSS_ORGANIZATION` from stage 1 and the test would pass without ever reaching
 * the row.
 */
import { describe, expect, it } from 'vitest';

import { API_SCOPE_VALUES, PERMISSION_VALUES } from '../../src/access/contracts.js';
import { evaluate } from '../../src/access/evaluate.js';
import { COLUMNS, principalFor, resourceFor } from './generators.js';

describe('no organisation principal is ever an internal administrator', () => {
  for (const column of COLUMNS) {
    it(`${column} is denied INTERNAL_ADMIN with SEPARATE_INTERNAL_IDENTITY_REQUIRED`, () => {
      const maximal = principalFor(column, [...PERMISSION_VALUES], [...API_SCOPE_VALUES]);
      for (const resource of [resourceFor(), undefined]) {
        const decision = evaluate({
          principal: maximal,
          action: 'INTERNAL_ADMIN',
          intent: 'READ',
          ...(resource === undefined ? {} : { resource }),
          context: { ownerCount: 5, targetRole: 'OWNER', auditScope: 'FULL', usageScope: 'OWN' },
        });
        expect(decision.allowed, column).toBe(false);
        if (!decision.allowed) {
          expect(decision.reason, column).toBe('SEPARATE_INTERNAL_IDENTITY_REQUIRED');
        }
      }
    });
  }

  it('the service-account cell denies through its named condition, not through a special case', () => {
    const decision = evaluate({
      principal: principalFor('SERVICE_ACCOUNT', [...PERMISSION_VALUES], [...API_SCOPE_VALUES]),
      action: 'INTERNAL_ADMIN',
      context: {},
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'SEPARATE_INTERNAL_IDENTITY_REQUIRED',
      condition: 'SEPARATE_INTERNAL_IDENTITY',
    });
  });

  it('INTERNAL_ADMIN is denied for every column under every grant and scope', () => {
    for (const column of COLUMNS) {
      for (const grants of [[], [...PERMISSION_VALUES]]) {
        for (const scopes of [[], [...API_SCOPE_VALUES]]) {
          const decision = evaluate({
            principal: principalFor(column, grants, scopes),
            action: 'INTERNAL_ADMIN',
          });
          expect(decision.allowed, `${column} ${String(grants.length)}/${String(scopes.length)}`).toBe(
            false,
          );
        }
      }
    }
  });
});
