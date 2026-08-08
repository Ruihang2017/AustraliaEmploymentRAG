/**
 * FND-06 — the untrusted-input surface.
 *
 * `RUNT-02` calls `evaluate()` with data built from an HTTP request, so the action is a caller-chosen
 * string until it is validated. `'__proto__'`, `'constructor'` and `'toString'` all resolve to
 * something on `Object.prototype`; a lookup that reached one of them would be an authorisation bypass.
 *
 * The second half asserts the fail-closed direction of every optional field sub-PRD D35 added: absent
 * means the condition does NOT hold. The dangerous inversion is `intent`.
 */
import { describe, expect, it } from 'vitest';

import type { Permission } from '../../src/access/contracts.js';
import { evaluate } from '../../src/access/evaluate.js';
import { MatrixLookupError, cell } from '../../src/access/matrix.js';
import type { PrincipalColumn } from '../../src/access/principal.js';
import { PERMISSION_REQUIRED_SCOPES, serviceAccountHasScope } from '../../src/access/scopes.js';
import { PRINCIPAL_ID, principalFor, resourceFor } from './generators.js';

const HOSTILE = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', ''] as const;

describe('a hostile action never resolves through the prototype chain', () => {
  for (const action of HOSTILE) {
    it(`action "${action}" is UNKNOWN_ACTION, never allowed`, () => {
      const decision = evaluate({
        principal: principalFor('OWNER'),
        action: action as unknown as Permission,
        resource: resourceFor(),
        context: {},
      });
      expect(decision).toEqual({ allowed: false, reason: 'UNKNOWN_ACTION' });
    });
  }

  it('cell() throws a named error rather than returning an inherited member', () => {
    for (const action of HOSTILE) {
      expect(() => cell(action as unknown as Permission, 'OWNER')).toThrow(MatrixLookupError);
    }
    expect(() => cell('CORPUS_SEARCH_READ', '__proto__' as unknown as PrincipalColumn)).toThrow(
      MatrixLookupError,
    );
  });

  it('the scope map is not reachable through the prototype chain either', () => {
    for (const action of HOSTILE) {
      expect(
        serviceAccountHasScope(
          principalFor('SERVICE_ACCOUNT', [], ['search:read']),
          action as unknown as Permission,
        ),
      ).toBe(false);
    }
    expect(Object.hasOwn(PERMISSION_REQUIRED_SCOPES, '__proto__')).toBe(false);
  });

  it('a hostile principal shape is NOT_A_MEMBER, never allowed', () => {
    for (const principal of [
      { kind: 'USER', id: PRINCIPAL_ID, organizationId: 'org_1', grants: [], scopes: [] },
      { kind: 'USER', id: PRINCIPAL_ID, organizationId: 'org_1', role: 'ROOT', grants: [], scopes: [] },
      { kind: 'SERVICE_ACCOUNT', id: PRINCIPAL_ID, organizationId: 'org_1', role: 'OWNER', grants: [], scopes: [] },
      { kind: 'USER', id: '', organizationId: 'org_1', role: 'OWNER', grants: [], scopes: [] },
      { kind: 'USER', id: PRINCIPAL_ID, organizationId: '', role: 'OWNER', grants: [], scopes: [] },
      { kind: 'ROBOT', id: PRINCIPAL_ID, organizationId: 'org_1', grants: [], scopes: [] },
    ]) {
      const decision = evaluate({
        principal: principal as never,
        action: 'CORPUS_SEARCH_READ',
        context: {},
      });
      expect(decision, JSON.stringify(principal)).toEqual({
        allowed: false,
        reason: 'NOT_A_MEMBER',
      });
    }
  });
});

describe('every optional field is fail-closed when absent', () => {
  it('intent absent means WRITE — a Viewer is denied the "read shared" cell', () => {
    const shared = {
      principal: principalFor('VIEWER'),
      action: 'RESEARCH_RECORD_READ_WRITE_OWN',
      resource: resourceFor(),
      context: {},
    } as const;
    expect(evaluate(shared)).toEqual({
      allowed: false,
      reason: 'CONDITION_NOT_MET',
      condition: 'SHARED_WITH_MEMBER',
    });
    expect(evaluate({ ...shared, intent: 'WRITE' })).toEqual({
      allowed: false,
      reason: 'CONDITION_NOT_MET',
      condition: 'SHARED_WITH_MEMBER',
    });
    expect(evaluate({ ...shared, intent: 'READ' })).toEqual({
      allowed: true,
      via: 'RESEARCH_RECORD_READ_WRITE_OWN',
    });
  });

  it('targetRole absent denies both Owner-constraint cells', () => {
    expect(
      evaluate({ principal: principalFor('ADMIN'), action: 'MEMBERSHIP_MANAGE', context: {} }),
    ).toEqual({ allowed: false, reason: 'CONDITION_NOT_MET', condition: 'OWNER_CONSTRAINTS' });
    expect(
      evaluate({
        principal: principalFor('ADMIN'),
        action: 'MEMBERSHIP_ROLE_CHANGE',
        context: { ownerCount: 9 },
      }),
    ).toEqual({ allowed: false, reason: 'CONDITION_NOT_MET', condition: 'LAST_OWNER_IMMUTABLE' });
  });

  it('an absent context denies every context-reading cell', () => {
    for (const [action, column, condition] of [
      ['MEMBERSHIP_MANAGE', 'ADMIN', 'OWNER_CONSTRAINTS'],
      ['MEMBERSHIP_ROLE_CHANGE', 'ADMIN', 'LAST_OWNER_IMMUTABLE'],
      ['USAGE_VIEW', 'RESEARCHER', 'OWN_RESOURCE_ONLY'],
      ['USAGE_VIEW', 'DEVELOPER', 'USAGE_SUBSET'],
      ['AUDIT_EVENT_VIEW', 'ADMIN', 'LIMITED_SUBSET'],
      ['AUDIT_EVENT_VIEW', 'DEVELOPER', 'CREDENTIAL_EVENTS_ONLY'],
    ] as const) {
      const decision = evaluate({
        principal: principalFor(column),
        action,
      });
      expect(decision, `${action} / ${column}`).toEqual({
        allowed: false,
        reason: 'CONDITION_NOT_MET',
        condition,
      });
    }
  });

  it('an empty grant set denies every "if granted" cell', () => {
    for (const [action, column, condition] of [
      ['ANSWER_CREATE', 'DEVELOPER', 'OFF_BY_DEFAULT_GRANTABLE'],
      ['RESEARCH_RECORD_REVIEW_COMMENT', 'VIEWER', 'GRANT_REQUIRED'],
      ['EXPORT_CREATE', 'VIEWER', 'GRANT_REQUIRED'],
      ['SERVICE_ACCOUNT_MANAGE', 'DEVELOPER', 'DEVELOPER_PERMISSION_GRANTED'],
    ] as const) {
      const decision = evaluate({
        principal: principalFor(column),
        action,
        intent: 'READ',
        resource: resourceFor(),
        context: {},
      });
      expect(decision, `${action} / ${column}`).toEqual({
        allowed: false,
        reason: 'CONDITION_NOT_MET',
        condition,
      });
    }
  });

  it('an empty scope set denies every "scoped" cell, grants or no grants', () => {
    for (const action of [
      'CORPUS_SEARCH_READ',
      'ANSWER_CREATE',
      'RESEARCH_RECORD_READ_WRITE_OWN',
      'EXPORT_CREATE',
      'WATCHLIST_CREATE',
    ] as const) {
      const decision = evaluate({
        principal: principalFor('SERVICE_ACCOUNT', [action], []),
        action,
        intent: 'READ',
        resource: resourceFor(),
        context: {},
      });
      expect(decision, action).toEqual({
        allowed: false,
        reason: 'CONDITION_NOT_MET',
        condition: 'SCOPE_GRANTED',
      });
    }
  });

  it('"scoped if granted" needs BOTH the grant and the scope', () => {
    const base = {
      action: 'RESEARCH_RECORD_REVIEW_COMMENT',
      intent: 'READ',
      resource: resourceFor(),
      context: {},
    } as const;
    expect(
      evaluate({ ...base, principal: principalFor('SERVICE_ACCOUNT', [base.action], []) }).allowed,
    ).toBe(false);
    expect(
      evaluate({ ...base, principal: principalFor('SERVICE_ACCOUNT', [], ['records:write']) })
        .allowed,
    ).toBe(false);
    expect(
      evaluate({
        ...base,
        principal: principalFor('SERVICE_ACCOUNT', [base.action], ['records:write']),
      }),
    ).toEqual({ allowed: true, via: base.action });
  });
});
