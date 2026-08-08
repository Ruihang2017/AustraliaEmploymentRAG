/**
 * FND-06 acceptance item 6 — PRD §8.1: *"The last Owner MUST NOT be removable."*
 *
 * Sub-PRD **D37a**: this MUST is a stage of `evaluate()` and overrides even an ALLOW cell, so it binds
 * the Owner too — §38.1 spells it only in the Admin cell, but §8.1 states it of the organisation.
 * `canRemoveMember` / `canChangeRole` must give the same answers as `evaluate()`; both are asserted.
 */
import { describe, expect, it } from 'vitest';

import { ROLE_VALUES } from '../../src/access/contracts.js';
import { evaluate } from '../../src/access/evaluate.js';
import { canChangeRole, canRemoveMember } from '../../src/access/membership.js';
import { COLUMNS, principalFor } from './generators.js';

const MEMBERSHIP_ACTIONS = ['MEMBERSHIP_MANAGE', 'MEMBERSHIP_ROLE_CHANGE'] as const;

describe('ownerCount === 1: nobody may touch that Owner', () => {
  for (const action of MEMBERSHIP_ACTIONS) {
    for (const column of COLUMNS) {
      it(`${column} may not ${action} the last Owner`, () => {
        const decision = evaluate({
          principal: principalFor(column),
          action,
          context: { ownerCount: 1, targetRole: 'OWNER' },
        });
        expect(decision.allowed).toBe(false);
        if (decision.allowed) return;
        if (column === 'OWNER' || column === 'ADMIN') {
          expect(decision.reason).toBe('CONDITION_NOT_MET');
          expect(decision.condition).toBe('LAST_OWNER_IMMUTABLE');
        }
      });
    }
  }

  it('an Owner cannot demote themselves while they are the last Owner', () => {
    const decision = evaluate({
      principal: principalFor('OWNER'),
      action: 'MEMBERSHIP_ROLE_CHANGE',
      context: { ownerCount: 1, targetRole: 'OWNER' },
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'CONDITION_NOT_MET',
      condition: 'LAST_OWNER_IMMUTABLE',
    });
  });

  it('an absent ownerCount is treated as the last Owner (fail-closed)', () => {
    const decision = evaluate({
      principal: principalFor('OWNER'),
      action: 'MEMBERSHIP_ROLE_CHANGE',
      context: { targetRole: 'OWNER' },
    });
    expect(decision.allowed).toBe(false);
  });
});

describe('ownerCount === 2: the Owner may act, the Admin may not (D37b)', () => {
  it('an Owner may change a non-last Owner’s role', () => {
    const decision = evaluate({
      principal: principalFor('OWNER'),
      action: 'MEMBERSHIP_ROLE_CHANGE',
      context: { ownerCount: 2, targetRole: 'OWNER' },
    });
    expect(decision).toEqual({ allowed: true, via: 'MEMBERSHIP_ROLE_CHANGE' });
  });

  it('an Admin may change a non-last Owner’s role (§38.1 row 8 names only the last Owner)', () => {
    const decision = evaluate({
      principal: principalFor('ADMIN'),
      action: 'MEMBERSHIP_ROLE_CHANGE',
      context: { ownerCount: 2, targetRole: 'OWNER' },
    });
    expect(decision).toEqual({ allowed: true, via: 'MEMBERSHIP_ROLE_CHANGE' });
  });

  it('an Admin may NOT manage an Owner’s membership at all (§38.1 row 7, D37b)', () => {
    const decision = evaluate({
      principal: principalFor('ADMIN'),
      action: 'MEMBERSHIP_MANAGE',
      context: { ownerCount: 2, targetRole: 'OWNER' },
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'CONDITION_NOT_MET',
      condition: 'OWNER_CONSTRAINTS',
    });
  });

  it('an Admin may manage a non-Owner member', () => {
    const decision = evaluate({
      principal: principalFor('ADMIN'),
      action: 'MEMBERSHIP_MANAGE',
      context: { ownerCount: 2, targetRole: 'RESEARCHER' },
    });
    expect(decision).toEqual({ allowed: true, via: 'MEMBERSHIP_MANAGE' });
  });
});

describe('the standalone predicates agree with evaluate()', () => {
  for (const actorRole of ROLE_VALUES) {
    it(`${actorRole} cannot remove or demote the last Owner`, () => {
      expect(canRemoveMember({ actorRole, targetRole: 'OWNER', ownerCount: 1 })).toBe(false);
      expect(canChangeRole({ actorRole, targetRole: 'OWNER', targetIsLastOwner: true })).toBe(false);
    });
  }

  it('Owner and Admin may act on a non-last Owner; nobody else may act at all', () => {
    expect(canRemoveMember({ actorRole: 'OWNER', targetRole: 'OWNER', ownerCount: 2 })).toBe(true);
    expect(canRemoveMember({ actorRole: 'ADMIN', targetRole: 'OWNER', ownerCount: 2 })).toBe(true);
    for (const actorRole of ['RESEARCHER', 'VIEWER', 'DEVELOPER'] as const) {
      expect(canRemoveMember({ actorRole, targetRole: 'RESEARCHER', ownerCount: 5 })).toBe(false);
      expect(canChangeRole({ actorRole, targetRole: 'RESEARCHER', targetIsLastOwner: false })).toBe(
        false,
      );
    }
  });

  it('an absent ownerCount is fail-closed for canRemoveMember too', () => {
    expect(canRemoveMember({ actorRole: 'OWNER', targetRole: 'OWNER' })).toBe(false);
  });
});
