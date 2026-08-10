/**
 * FND-06 acceptance item 9 and deliverable 6 — PRD §21.2 *"Authorise before lookup"*.
 *
 * The organisation check runs FIRST. Each case below stacks a second, different failure on top of a
 * cross-organisation resource: whichever failure would win tells you which stage ran first. Move the
 * organisation check after the permission lookup on a scratch branch and every case here fails —
 * that is the ticket's Reviewer step 4.
 */
import { describe, expect, it } from 'vitest';

import { EVALUATION_ORDER, evaluate } from '../../src/access/evaluate.js';
import type { Permission } from '../../src/access/contracts.js';
import { OTHER_ORGANIZATION_ID, principalFor, strangerResource } from './generators.js';

const foreign = strangerResource(OTHER_ORGANIZATION_ID);

describe('the ordering guarantee is data, not prose', () => {
  it('EVALUATION_ORDER mirrors PRD §16.5’s request flow', () => {
    expect([...EVALUATION_ORDER]).toEqual([
      'ORGANIZATION_MATCH',
      'PRINCIPAL_VALIDITY',
      'PERMISSION_LOOKUP',
      'CONDITION',
      'RESOURCE_MEMBERSHIP',
    ]);
    expect(Object.isFrozen(EVALUATION_ORDER)).toBe(true);
  });
});

describe('stage 1 beats every later stage', () => {
  it('cross-organisation + a permission the role lacks -> CROSS_ORGANIZATION', () => {
    const decision = evaluate({
      principal: principalFor('VIEWER'),
      action: 'ORGANIZATION_RETENTION_CONFIGURE',
      resource: foreign,
      context: {},
    });
    expect(decision).toEqual({ allowed: false, reason: 'CROSS_ORGANIZATION' });
  });

  it('cross-organisation + an unknown action -> CROSS_ORGANIZATION', () => {
    const decision = evaluate({
      principal: principalFor('OWNER'),
      action: 'NOT_A_PERMISSION' as Permission,
      resource: foreign,
      context: {},
    });
    expect(decision).toEqual({ allowed: false, reason: 'CROSS_ORGANIZATION' });
  });

  it('cross-organisation + a principal who is not a member -> CROSS_ORGANIZATION', () => {
    const decision = evaluate({
      principal: { kind: 'USER', id: 'prn_x', organizationId: 'org_x', grants: [], scopes: [] },
      action: 'CORPUS_SEARCH_READ',
      resource: foreign,
      context: {},
    });
    expect(decision).toEqual({ allowed: false, reason: 'CROSS_ORGANIZATION' });
  });

  it('cross-organisation + an unmet condition -> CROSS_ORGANIZATION', () => {
    const decision = evaluate({
      principal: principalFor('DEVELOPER'),
      action: 'ANSWER_CREATE',
      resource: foreign,
      context: {},
    });
    expect(decision).toEqual({ allowed: false, reason: 'CROSS_ORGANIZATION' });
  });

  it('cross-organisation + a resource the principal is no member of -> CROSS_ORGANIZATION', () => {
    const decision = evaluate({
      principal: principalFor('OWNER'),
      action: 'RESEARCH_RECORD_READ_WRITE_OWN',
      resource: foreign,
      context: {},
    });
    expect(decision).toEqual({ allowed: false, reason: 'CROSS_ORGANIZATION' });
  });
});

describe('the later stages keep their own order (each case is reachable)', () => {
  it('stage 2 beats stage 3: an invalid principal outranks a missing permission', () => {
    const decision = evaluate({
      principal: { kind: 'USER', id: 'prn_x', organizationId: 'org_x', grants: [], scopes: [] },
      action: 'ORGANIZATION_RETENTION_CONFIGURE',
      context: {},
    });
    expect(decision).toEqual({ allowed: false, reason: 'NOT_A_MEMBER' });
  });

  it('stage 2 beats stage 3 for an unknown action too', () => {
    const decision = evaluate({
      principal: principalFor('OWNER'),
      action: 'NOT_A_PERMISSION' as Permission,
      context: {},
    });
    expect(decision).toEqual({ allowed: false, reason: 'UNKNOWN_ACTION' });
  });

  it('stage 3 beats stage 4: a DENY cell outranks any condition', () => {
    const decision = evaluate({
      principal: principalFor('VIEWER'),
      action: 'WATCHLIST_CREATE',
      context: { usageScope: 'OWN', auditScope: 'LIMITED' },
    });
    expect(decision).toEqual({ allowed: false, reason: 'ROLE_LACKS_PERMISSION' });
  });

  it('stage 4 beats stage 5: an unmet condition outranks a missing resource', () => {
    const decision = evaluate({
      principal: principalFor('VIEWER'),
      action: 'RESEARCH_RECORD_READ_WRITE_OWN',
      context: {},
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'CONDITION_NOT_MET',
      condition: 'SHARED_WITH_MEMBER',
    });
  });

  it('stage 5 applies to the Owner as well — permission PLUS resource membership', () => {
    const decision = evaluate({
      principal: principalFor('OWNER'),
      action: 'RESEARCH_RECORD_READ_WRITE_OWN',
      resource: strangerResource(),
      context: {},
    });
    expect(decision).toEqual({ allowed: false, reason: 'NOT_A_RESOURCE_MEMBER' });
  });
});
