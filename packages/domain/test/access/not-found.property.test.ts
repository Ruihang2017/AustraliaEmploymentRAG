/**
 * FND-06 acceptance item 4 (`[machine]`, deliverable 4; PRD §16.5 *"Other-tenant and absent opaque
 * IDs return the same not-found response."*).
 *
 * This is an information-leak control, not cosmetics: the assertion is **key-set equality**, not just
 * a boolean. Any extra field on one branch — a `via`, a `condition`, a resource id — is something
 * `RUNT-02` could render and a probing caller could use to distinguish "not yours" from "not there".
 */
import { describe, expect, it } from 'vitest';

import { evaluate, isIndistinguishableNotFound } from '../../src/access/index.js';
import {
  caseLabel,
  randomAction,
  randomContext,
  randomPrincipal,
  randomResource,
  rngFor,
} from './arbitrary.js';
import { ORGANIZATION_ID, OTHER_ORGANIZATION_ID } from './scenario.js';

const CASES = 10_000;

describe('not-found indistinguishability (PRD §16.5)', () => {
  it(`collapses cross-organisation and absent resources over ${CASES} generated cases`, () => {
    const rng = rngFor('not-found');
    for (let index = 0; index < CASES; index += 1) {
      const principal = randomPrincipal(rng, ORGANIZATION_ID);
      const action = randomAction(rng);
      const context = randomContext(rng);
      const crossOrganisation = evaluate({
        principal,
        action,
        resource: randomResource(rng, OTHER_ORGANIZATION_ID),
        context,
      });
      const absent = evaluate({ principal, action, resource: null, context });
      const label = caseLabel(index, { principal, action, context });

      expect(isIndistinguishableNotFound(crossOrganisation), label).toBe(true);
      expect(isIndistinguishableNotFound(absent), label).toBe(true);

      // The two decisions differ in exactly one field: the `reason` the caller audits.
      expect(Object.keys(crossOrganisation).sort(), label).toEqual(['allowed', 'reason']);
      expect(Object.keys(absent).sort(), label).toEqual(['allowed', 'reason']);
      expect(crossOrganisation).toEqual({ allowed: false, reason: 'CROSS_ORGANIZATION' });
      expect(absent).toEqual({ allowed: false, reason: 'RESOURCE_ABSENT' });
    }
  });

  it('is false for every other decision, allow or deny', () => {
    const rng = rngFor('not-found-negative');
    let sameOrganisationCases = 0;
    for (let index = 0; index < CASES; index += 1) {
      const principal = randomPrincipal(rng, ORGANIZATION_ID);
      const action = randomAction(rng);
      const decision = evaluate({
        principal,
        action,
        resource: randomResource(rng, ORGANIZATION_ID),
        context: randomContext(rng),
      });
      sameOrganisationCases += 1;
      expect(isIndistinguishableNotFound(decision), caseLabel(index, decision)).toBe(false);
    }
    expect(sameOrganisationCases).toBe(CASES);
  });

  it('is false for an allow', () => {
    const decision = evaluate({
      principal: {
        kind: 'USER',
        id: 'member-1',
        organizationId: ORGANIZATION_ID,
        role: 'OWNER',
        grants: [],
        scopes: [],
      },
      action: 'CORPUS_SEARCH_READ',
      context: { intent: 'READ' },
    });
    expect(decision.allowed).toBe(true);
    expect(isIndistinguishableNotFound(decision)).toBe(false);
  });
});
