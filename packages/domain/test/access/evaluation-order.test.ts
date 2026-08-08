/**
 * FND-06 acceptance item 8 and deliverable 6 — the evaluation order is observable, not merely
 * documented (PRD §21.2 "Authorise before lookup", PRD §16.5's request flow).
 *
 * These are the tests that go red if the organisation check is moved after the permission lookup —
 * the ticket's Reviewer step 4. Each case is constructed so that **two** rules would fire and only
 * the earlier one may be reported.
 */
import { describe, expect, it } from 'vitest';

import { evaluate } from '../../src/access/index.js';
import { ORGANIZATION_ID, OTHER_ORGANIZATION_ID, principalFor } from './scenario.js';

const otherOrganisationRecord = {
  organizationId: OTHER_ORGANIZATION_ID,
  id: 'record-1',
  ownerId: 'member-1',
  sharedWith: ['member-1'],
  assignedReviewerId: 'member-1',
};

describe('evaluation order', () => {
  it('reports CROSS_ORGANIZATION when the role also lacks the permission', () => {
    expect(
      evaluate({
        principal: principalFor('VIEWER'),
        action: 'ORGANIZATION_RETENTION_CONFIGURE', // Viewer cell is `—`
        resource: otherOrganisationRecord,
        context: { intent: 'WRITE' },
      }),
    ).toEqual({ allowed: false, reason: 'CROSS_ORGANIZATION' });
  });

  it('reports CROSS_ORGANIZATION when the principal is not a member at all', () => {
    expect(
      evaluate({
        principal: { ...principalFor('VIEWER'), role: undefined },
        action: 'CORPUS_SEARCH_READ',
        resource: otherOrganisationRecord,
        context: { intent: 'READ' },
      }),
    ).toEqual({ allowed: false, reason: 'CROSS_ORGANIZATION' });
  });

  it('reports CROSS_ORGANIZATION when the resource is also not a record the principal belongs to', () => {
    expect(
      evaluate({
        principal: principalFor('OWNER'),
        action: 'RESEARCH_RECORD_READ_WRITE_OWN',
        resource: { organizationId: OTHER_ORGANIZATION_ID, id: 'record-1', ownerId: 'member-9' },
        context: { intent: 'WRITE' },
      }),
    ).toEqual({ allowed: false, reason: 'CROSS_ORGANIZATION' });
  });

  it('reports RESOURCE_ABSENT when the resource is null and the role also lacks the permission', () => {
    expect(
      evaluate({
        principal: principalFor('VIEWER'),
        action: 'ORGANIZATION_RETENTION_CONFIGURE',
        resource: null,
        context: { intent: 'WRITE' },
      }),
    ).toEqual({ allowed: false, reason: 'RESOURCE_ABSENT' });
  });

  it('reports NOT_A_MEMBER before the permission lookup, inside the same organisation', () => {
    expect(
      evaluate({
        principal: { ...principalFor('VIEWER'), role: undefined },
        action: 'INTERNAL_ADMIN',
        context: { intent: 'READ' },
      }),
    ).toEqual({ allowed: false, reason: 'NOT_A_MEMBER' });
  });

  it('rejects a service account that carries a role, rather than honouring the role', () => {
    expect(
      evaluate({
        principal: { ...principalFor('SERVICE_ACCOUNT'), role: 'OWNER' },
        action: 'MEMBERSHIP_MANAGE',
        context: { intent: 'WRITE' },
      }),
    ).toEqual({ allowed: false, reason: 'NOT_A_MEMBER' });
  });

  it('reports the condition before resource membership', () => {
    // Viewer × "Create/read own Research Records" is `read shared`; the record is neither shared
    // with nor owned by the principal, so both rules would fire. The condition is the earlier one.
    expect(
      evaluate({
        principal: principalFor('VIEWER'),
        action: 'RESEARCH_RECORD_READ_WRITE_OWN',
        resource: { organizationId: ORGANIZATION_ID, id: 'record-1', ownerId: 'member-9' },
        context: { intent: 'READ' },
      }),
    ).toEqual({
      allowed: false,
      reason: 'CONDITION_NOT_MET',
      condition: 'SHARED_WITH_MEMBER',
    });
  });

  it('still applies resource membership to an ALLOW cell (§38.1 closing rule)', () => {
    expect(
      evaluate({
        principal: principalFor('OWNER'),
        action: 'RESEARCH_RECORD_READ_WRITE_OWN',
        resource: { organizationId: ORGANIZATION_ID, id: 'record-1', ownerId: 'member-9' },
        context: { intent: 'WRITE' },
      }),
    ).toEqual({ allowed: false, reason: 'NOT_A_RESOURCE_MEMBER' });
  });

  it('throws on an action that is not a PRD §38.1 row (a wiring bug, never a silent deny)', () => {
    expect(() =>
      evaluate({
        principal: principalFor('OWNER'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately invalid input
        action: 'NOT_A_PERMISSION' as any,
        context: { intent: 'READ' },
      }),
    ).toThrow(/unknown action/);
  });
});
