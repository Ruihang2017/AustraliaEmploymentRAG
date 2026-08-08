/**
 * FND-06 acceptance item 9 (`[machine]`) — PRD §38.1's final row: *"Internal source/release/incident
 * admin | — | — | — | — | — | separate internal identity only"*.
 *
 * Every organisation principal, Owner included, is denied with
 * `SEPARATE_INTERNAL_IDENTITY_REQUIRED`, under every context this leaf can be handed. That identity
 * belongs to `22-internal-admin` and is deliberately unreachable from here.
 */
import { describe, expect, it } from 'vitest';

import { API_SCOPE_VALUES, PERMISSION_VALUES } from '../../../contracts/src/enums/index.js';
import { ACTION_SPECS, PRINCIPAL_KEYS, evaluate } from '../../src/access/index.js';
import { caseLabel, randomContext, randomResource, rngFor } from './arbitrary.js';
import { ORGANIZATION_ID, principalFor } from './scenario.js';

const expectedDenial = { allowed: false, reason: 'SEPARATE_INTERNAL_IDENTITY_REQUIRED' };

describe('internal-admin row', () => {
  it('marks exactly one action internal-identity-only', () => {
    const flagged = PERMISSION_VALUES.filter((action) => ACTION_SPECS[action].internalIdentityOnly);
    expect(flagged).toEqual(['INTERNAL_ADMIN']);
  });

  it.each([...PRINCIPAL_KEYS])('denies %s, however privileged and however scoped', (principalKey) => {
    const principal = principalFor(principalKey, {
      grants: [{ permission: 'INTERNAL_ADMIN' }],
      scopes: [...API_SCOPE_VALUES],
    });
    expect(
      evaluate({ principal, action: 'INTERNAL_ADMIN', context: { intent: 'WRITE' } }),
    ).toEqual(expectedDenial);
  });

  it('denies under 1,000 generated contexts and resources', () => {
    const rng = rngFor('internal-admin');
    for (let index = 0; index < 1_000; index += 1) {
      for (const principalKey of PRINCIPAL_KEYS) {
        const context = randomContext(rng);
        const resource = randomResource(rng, ORGANIZATION_ID);
        expect(
          evaluate({
            principal: principalFor(principalKey, {
              grants: [{ permission: 'INTERNAL_ADMIN' }],
              scopes: [...API_SCOPE_VALUES],
            }),
            action: 'INTERNAL_ADMIN',
            resource,
            context,
          }),
          caseLabel(index, { principalKey, context, resource }),
        ).toEqual(expectedDenial);
      }
    }
  });
});
