/**
 * FND-06 acceptance item 6 (`[machine]`) and deliverable 5 — PRD §8.1: *"The last Owner MUST NOT be
 * removable."*, and PRD §38.1 rows 7 and 8.
 *
 * The invariant is asserted **twice**, through `evaluate()` and through the standalone predicates, so
 * a caller cannot reach a different answer by picking the other door.
 */
import { describe, expect, it } from 'vitest';

import { ROLE_VALUES } from '../../../contracts/src/enums/index.js';
import {
  canChangeRole,
  canRemoveMember,
  evaluate,
  isLastOwnerTarget,
} from '../../src/access/index.js';
import { principalFor } from './scenario.js';

const lastOwnerTarget = { memberId: 'member-2', role: 'OWNER' } as const;

describe('last-Owner invariant via evaluate()', () => {
  it.each([...ROLE_VALUES])('denies %s removing the last Owner', (role) => {
    expect(
      evaluate({
        principal: principalFor(role),
        action: 'MEMBERSHIP_ROLE_CHANGE',
        context: { intent: 'WRITE', ownerCount: 1, target: lastOwnerTarget },
      }).allowed,
    ).toBe(false);
  });

  it('denies an Owner — the most privileged principal there is — with LAST_OWNER_IMMUTABLE', () => {
    expect(
      evaluate({
        principal: principalFor('OWNER'),
        action: 'MEMBERSHIP_ROLE_CHANGE',
        context: { intent: 'WRITE', ownerCount: 1, target: lastOwnerTarget },
      }),
    ).toEqual({
      allowed: false,
      reason: 'CONDITION_NOT_MET',
      condition: 'LAST_OWNER_IMMUTABLE',
    });
  });

  it('denies an Owner demoting themselves while they are the last Owner', () => {
    expect(
      evaluate({
        principal: principalFor('OWNER'),
        action: 'MEMBERSHIP_ROLE_CHANGE',
        context: {
          intent: 'WRITE',
          ownerCount: 1,
          target: { memberId: 'member-1', role: 'OWNER' },
        },
      }).allowed,
    ).toBe(false);
  });

  it('permits an Owner to demote another Owner once there are two', () => {
    expect(
      evaluate({
        principal: principalFor('OWNER'),
        action: 'MEMBERSHIP_ROLE_CHANGE',
        context: { intent: 'WRITE', ownerCount: 2, target: lastOwnerTarget },
      }),
    ).toEqual({ allowed: true, via: 'MEMBERSHIP_ROLE_CHANGE' });
  });

  it('treats an unknown ownerCount as "could be the last one" (fail-closed)', () => {
    expect(
      evaluate({
        principal: principalFor('OWNER'),
        action: 'MEMBERSHIP_ROLE_CHANGE',
        context: { intent: 'WRITE', target: lastOwnerTarget },
      }).allowed,
    ).toBe(false);
  });

  it('applies the invariant to member management as well as to role change', () => {
    expect(
      evaluate({
        principal: principalFor('OWNER'),
        action: 'MEMBERSHIP_MANAGE',
        context: { intent: 'WRITE', ownerCount: 1, target: lastOwnerTarget },
      }).allowed,
    ).toBe(false);
  });

  it('blocks an Admin from any Owner target when managing members (§38.1 row 7 as written)', () => {
    expect(
      evaluate({
        principal: principalFor('ADMIN'),
        action: 'MEMBERSHIP_MANAGE',
        context: { intent: 'WRITE', ownerCount: 5, target: { memberId: 'member-2', role: 'OWNER' } },
      }),
    ).toEqual({
      allowed: false,
      reason: 'CONDITION_NOT_MET',
      condition: 'OWNER_CONSTRAINTS',
    });
  });
});

describe('membership predicates', () => {
  it.each([...ROLE_VALUES])('canRemoveMember denies %s against the last Owner', (actorRole) => {
    expect(canRemoveMember({ actorRole, targetRole: 'OWNER', ownerCount: 1 })).toBe(false);
    expect(canChangeRole({ actorRole, targetRole: 'OWNER', targetIsLastOwner: true })).toBe(false);
  });

  it('permits Owner and Admin, and only them, once the target is not the last Owner', () => {
    expect(canRemoveMember({ actorRole: 'OWNER', targetRole: 'OWNER', ownerCount: 2 })).toBe(true);
    expect(canRemoveMember({ actorRole: 'ADMIN', targetRole: 'VIEWER', ownerCount: 2 })).toBe(true);
    for (const actorRole of ['RESEARCHER', 'VIEWER', 'DEVELOPER'] as const) {
      expect(canRemoveMember({ actorRole, targetRole: 'VIEWER', ownerCount: 2 })).toBe(false);
      expect(canChangeRole({ actorRole, targetRole: 'VIEWER', targetIsLastOwner: false })).toBe(
        false,
      );
    }
  });

  it('isLastOwnerTarget is false with no target and fail-closed with an unknown ownerCount', () => {
    expect(isLastOwnerTarget({ intent: 'WRITE' })).toBe(false);
    expect(isLastOwnerTarget({ intent: 'WRITE', target: lastOwnerTarget })).toBe(true);
    expect(
      isLastOwnerTarget({ intent: 'WRITE', ownerCount: 4, target: lastOwnerTarget }),
    ).toBe(false);
    expect(
      isLastOwnerTarget({
        intent: 'WRITE',
        ownerCount: 1,
        target: { memberId: 'member-2', role: 'ADMIN' },
      }),
    ).toBe(false);
  });
});
