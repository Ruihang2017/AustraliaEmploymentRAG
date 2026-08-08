/**
 * FND-06 acceptance item 7 — PRD §8.1: *"Developer MUST NOT automatically gain Research Record
 * content access."*, PRD §38.1's "— by default".
 *
 * The converse is asserted too (ticket Reviewer step 6): with an explicit grant the SAME Developer is
 * allowed. The denial must be for the missing grant, not for the role.
 */
import { describe, expect, it } from 'vitest';

import { evaluate } from '../../src/access/evaluate.js';
import { developerHasRecordAccess } from '../../src/access/membership.js';
import { principalFor, resourceFor } from './generators.js';

const GRANTABLE_RECORD_ACTIONS = [
  'ANSWER_CREATE',
  'RESEARCH_RECORD_READ_WRITE_OWN',
] as const;

const UNGRANTABLE_RECORD_ACTIONS = ['RESEARCH_RECORD_REVIEW_COMMENT', 'EXPORT_CREATE'] as const;

describe('a Developer with no grant', () => {
  for (const action of [...GRANTABLE_RECORD_ACTIONS, ...UNGRANTABLE_RECORD_ACTIONS]) {
    it(`is denied ${action}`, () => {
      const decision = evaluate({
        principal: principalFor('DEVELOPER'),
        action,
        intent: 'READ',
        resource: resourceFor(),
        context: {},
      });
      expect(decision.allowed).toBe(false);
    });
  }

  it('developerHasRecordAccess([]) is false — the invariant itself', () => {
    expect(developerHasRecordAccess([])).toBe(false);
    expect(developerHasRecordAccess(['CORPUS_SEARCH_READ'])).toBe(false);
  });
});

describe('the denial is for the missing grant, not for the Developer role', () => {
  for (const action of GRANTABLE_RECORD_ACTIONS) {
    it(`the same Developer WITH the grant is allowed ${action}`, () => {
      const decision = evaluate({
        principal: principalFor('DEVELOPER', [action]),
        action,
        intent: 'READ',
        resource: resourceFor(),
        context: {},
      });
      expect(decision).toEqual({ allowed: true, via: action });
    });
  }

  it('developerHasRecordAccess is true with the explicit record grant', () => {
    expect(developerHasRecordAccess(['RESEARCH_RECORD_READ_WRITE_OWN'])).toBe(true);
  });

  it('the two §38.1 Developer cells that are a flat "—" stay denied even with a grant', () => {
    for (const action of UNGRANTABLE_RECORD_ACTIONS) {
      const decision = evaluate({
        principal: principalFor('DEVELOPER', [action]),
        action,
        intent: 'READ',
        resource: resourceFor(),
        context: {},
      });
      expect(decision, action).toEqual({ allowed: false, reason: 'ROLE_LACKS_PERMISSION' });
    }
  });
});
