/**
 * FND-06 acceptance item 7 (`[machine]`) — PRD §8.1: *"Developer MUST NOT automatically gain Research
 * Record content access."* and PRD §38.1's "— by default" cells.
 *
 * The ticket's Reviewer step 6 is the point of this file: the denial must be for the **absence of a
 * grant**, not for the Developer role as such. So every case is asserted in both directions — denied
 * without a grant, allowed with one.
 */
import { describe, expect, it } from 'vitest';

import type { Permission } from '../../../contracts/src/enums/index.js';
import { developerHasRecordAccess, evaluate, hasGrant } from '../../src/access/index.js';
import { ORGANIZATION_ID, PRINCIPAL_ID, principalFor } from './scenario.js';

const RECORD_ACTIONS: readonly Permission[] = [
  'RESEARCH_RECORD_READ_WRITE_OWN',
  'RESEARCH_RECORD_REVIEW_COMMENT',
  'EXPORT_CREATE',
];

const ownRecord = {
  organizationId: ORGANIZATION_ID,
  id: 'record-1',
  ownerId: PRINCIPAL_ID,
  sharedWith: [PRINCIPAL_ID],
  assignedReviewerId: PRINCIPAL_ID,
};

describe('Developer default (PRD §8.1)', () => {
  it.each(RECORD_ACTIONS)('denies a Developer with no grant: %s', (action) => {
    const decision = evaluate({
      principal: principalFor('DEVELOPER'),
      action,
      resource: ownRecord,
      context: { intent: 'READ' },
    });
    expect(decision.allowed).toBe(false);
  });

  it('denies answer creation to a Developer with no grant', () => {
    expect(
      evaluate({
        principal: principalFor('DEVELOPER'),
        action: 'ANSWER_CREATE',
        context: { intent: 'WRITE' },
      }),
    ).toEqual({
      allowed: false,
      reason: 'CONDITION_NOT_MET',
      condition: 'OFF_BY_DEFAULT_GRANTABLE',
    });
  });

  it('allows the same Developer once an explicit grant exists — the role was never the reason', () => {
    for (const action of ['RESEARCH_RECORD_READ_WRITE_OWN', 'ANSWER_CREATE'] as const) {
      expect(
        evaluate({
          principal: principalFor('DEVELOPER', { grants: [{ permission: action }] }),
          action,
          resource: action === 'ANSWER_CREATE' ? undefined : ownRecord,
          context: { intent: 'WRITE' },
        }),
      ).toEqual({ allowed: true, via: action });
    }
  });

  it('honours a resource-scoped grant only for that resource', () => {
    const principal = principalFor('DEVELOPER', {
      grants: [{ permission: 'RESEARCH_RECORD_READ_WRITE_OWN', resourceId: 'record-1' }],
    });
    expect(
      evaluate({
        principal,
        action: 'RESEARCH_RECORD_READ_WRITE_OWN',
        resource: ownRecord,
        context: { intent: 'WRITE' },
      }).allowed,
    ).toBe(true);
    expect(
      evaluate({
        principal,
        action: 'RESEARCH_RECORD_READ_WRITE_OWN',
        resource: { ...ownRecord, id: 'record-2' },
        context: { intent: 'WRITE' },
      }).allowed,
    ).toBe(false);
  });

  it('developerHasRecordAccess is false without a grant and true with one', () => {
    expect(developerHasRecordAccess([])).toBe(false);
    expect(developerHasRecordAccess([{ permission: 'CORPUS_SEARCH_READ' }])).toBe(false);
    expect(developerHasRecordAccess([{ permission: 'RESEARCH_RECORD_READ_WRITE_OWN' }])).toBe(true);
    expect(developerHasRecordAccess([{ permission: 'RESEARCH_RECORD_REVIEW_COMMENT' }])).toBe(true);
  });

  it('shares one grant lookup with the conditions (no second, drifting copy)', () => {
    const grants = [{ permission: 'RESEARCH_RECORD_READ_WRITE_OWN' as Permission }];
    expect(hasGrant(grants, 'RESEARCH_RECORD_READ_WRITE_OWN')).toBe(
      developerHasRecordAccess(grants),
    );
    expect(hasGrant([], 'RESEARCH_RECORD_READ_WRITE_OWN')).toBe(developerHasRecordAccess([]));
    // A resource-scoped grant matches nothing when the request names no identified resource.
    expect(
      hasGrant([{ permission: 'EXPORT_CREATE', resourceId: 'record-1' }], 'EXPORT_CREATE'),
    ).toBe(false);
  });

  it('denies "Manage service accounts" to a Developer without the developer permission grant', () => {
    expect(
      evaluate({
        principal: principalFor('DEVELOPER'),
        action: 'SERVICE_ACCOUNT_MANAGE',
        context: { intent: 'WRITE' },
      }),
    ).toEqual({
      allowed: false,
      reason: 'CONDITION_NOT_MET',
      condition: 'DEVELOPER_PERMISSION_GRANTED',
    });
  });
});
