/**
 * FND-06 acceptance item 4 and deliverable 4 — PRD §16.5: *"Other-tenant and absent opaque IDs return
 * the same not-found response."*
 *
 * The equivalence is asserted three ways: the predicate is true for both, the boundary projection is
 * deep-equal (and identical by reference), and the serialised decision leaks no identifier of the
 * resource or of the other organisation.
 */
import { describe, expect, it } from 'vitest';

import { evaluate } from '../../src/access/evaluate.js';
import {
  describeForBoundary,
  isIndistinguishableNotFound,
} from '../../src/access/not-found.js';
import {
  ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
  PRINCIPAL_ID,
  STRANGER_ID,
  principalFor,
  randomInput,
} from './generators.js';
import { forEachDraw } from './rng.js';

const CASES = 10_000;

/** Actions PRD §38.1 evaluates against a record — the ones a missing resource can be absent from. */
const RECORD_ACTIONS = [
  'RESEARCH_RECORD_READ_WRITE_OWN',
  'RESEARCH_RECORD_REVIEW_COMMENT',
  'EXPORT_CREATE',
] as const;

describe('every cross-organisation decision is in the not-found class', () => {
  it(`holds for ${String(CASES)} generated cases`, () => {
    forEachDraw(CASES, (rng, index, seed) => {
      const decision = evaluate(randomInput(rng, OTHER_ORGANIZATION_ID));
      const where = `seed 0x${seed.toString(16)} case ${String(index)}`;
      expect(isIndistinguishableNotFound(decision), where).toBe(true);
      expect(describeForBoundary(decision), where).toEqual({ outcome: 'NOT_FOUND' });
    });
  });
});

describe('a missing resource is in the same class', () => {
  for (const action of RECORD_ACTIONS) {
    it(`${action} with no resource is NOT_FOUND, not a distinguishable denial`, () => {
      const decision = evaluate({
        principal: principalFor('OWNER'),
        action,
        context: {},
      });
      expect(decision).toEqual({ allowed: false, reason: 'RESOURCE_ABSENT' });
      expect(isIndistinguishableNotFound(decision)).toBe(true);
      expect(describeForBoundary(decision)).toEqual({ outcome: 'NOT_FOUND' });
    });
  }

  it('the two produce identical caller-visible information — deep-equal AND same reference', () => {
    const crossOrganisation = evaluate({
      principal: principalFor('OWNER'),
      action: 'RESEARCH_RECORD_READ_WRITE_OWN',
      resource: { organizationId: OTHER_ORGANIZATION_ID, ownerId: STRANGER_ID },
      context: {},
    });
    const absent = evaluate({
      principal: principalFor('OWNER'),
      action: 'RESEARCH_RECORD_READ_WRITE_OWN',
      context: {},
    });
    expect(crossOrganisation).toEqual({ allowed: false, reason: 'CROSS_ORGANIZATION' });
    expect(absent).toEqual({ allowed: false, reason: 'RESOURCE_ABSENT' });
    expect(describeForBoundary(crossOrganisation)).toEqual(describeForBoundary(absent));
    expect(describeForBoundary(crossOrganisation)).toBe(describeForBoundary(absent));
  });
});

describe('no decision leaks an identifier (PRD §16.5, §21.2)', () => {
  const SECRETS = [OTHER_ORGANIZATION_ID, ORGANIZATION_ID, PRINCIPAL_ID, STRANGER_ID, 'rec_secret'];

  it('a cross-organisation denial serialises without any id or cell text', () => {
    const decision = evaluate({
      principal: principalFor('RESEARCHER'),
      action: 'RESEARCH_RECORD_READ_WRITE_OWN',
      resource: {
        organizationId: OTHER_ORGANIZATION_ID,
        ownerId: 'rec_secret',
        sharedWith: ['rec_secret'],
        assignedReviewerId: 'rec_secret',
      },
      context: {},
    });
    const serialised = JSON.stringify(decision);
    for (const secret of SECRETS) expect(serialised, secret).not.toContain(secret);
    expect(serialised).not.toContain('✓');
    expect(serialised).toBe('{"allowed":false,"reason":"CROSS_ORGANIZATION"}');
  });

  it('the leak scan would fire if a decision did carry an id (positive control)', () => {
    expect(JSON.stringify({ reason: 'X', organizationId: OTHER_ORGANIZATION_ID })).toContain(
      OTHER_ORGANIZATION_ID,
    );
  });
});

describe('the class is not everything (positive control)', () => {
  it('a role-lacks-permission denial is NOT not-found', () => {
    const decision = evaluate({
      principal: principalFor('VIEWER'),
      action: 'ORGANIZATION_RETENTION_CONFIGURE',
      context: {},
    });
    expect(decision).toEqual({ allowed: false, reason: 'ROLE_LACKS_PERMISSION' });
    expect(isIndistinguishableNotFound(decision)).toBe(false);
    expect(describeForBoundary(decision)).toEqual({
      outcome: 'DENIED',
      reason: 'ROLE_LACKS_PERMISSION',
    });
  });

  it('a condition denial is NOT not-found', () => {
    const decision = evaluate({
      principal: principalFor('DEVELOPER'),
      action: 'ANSWER_CREATE',
      context: {},
    });
    expect(decision.allowed).toBe(false);
    expect(isIndistinguishableNotFound(decision)).toBe(false);
  });

  it('an allowed decision is NOT not-found', () => {
    const decision = evaluate({ principal: principalFor('OWNER'), action: 'CORPUS_SEARCH_READ' });
    expect(decision).toEqual({ allowed: true, via: 'CORPUS_SEARCH_READ' });
    expect(isIndistinguishableNotFound(decision)).toBe(false);
    expect(describeForBoundary(decision)).toEqual({
      outcome: 'ALLOWED',
      via: 'CORPUS_SEARCH_READ',
    });
  });
});
