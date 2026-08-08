/**
 * FND-06 acceptance item 5 (`[machine]`) — Owner dominance, derived from the shape of the PRD §38.1
 * table: for every action and every context, `allowed(Owner) ⊇ allowed(R)` for
 * R ∈ {Admin, Researcher, Viewer, Developer}, under an **identical** input (same id, same grants,
 * same scopes, same resource, same context).
 *
 * If this ever fails for a real cell, that is a ticket amendment plus a README entry
 * (Feedback obligation 3) — never a deleted test.
 */
import { describe, expect, it } from 'vitest';

import { PERMISSION_VALUES } from '../../../contracts/src/enums/index.js';
import type { Role } from '../../../contracts/src/enums/index.js';
import { evaluate } from '../../src/access/index.js';
import {
  caseLabel,
  randomContext,
  randomGrants,
  randomResource,
  randomScopes,
  rngFor,
} from './arbitrary.js';
import { ORGANIZATION_ID, principalFor } from './scenario.js';

const SUBORDINATE_ROLES: readonly Role[] = ['ADMIN', 'RESEARCHER', 'VIEWER', 'DEVELOPER'];
const CASES = 500;

describe('Owner dominance', () => {
  it.each(SUBORDINATE_ROLES)('allowed(Owner) ⊇ allowed(%s) for every action', (role) => {
    const rng = rngFor(`dominance-${role}`);
    let dominated = 0;
    for (let index = 0; index < CASES; index += 1) {
      const grants = randomGrants(rng);
      const scopes = randomScopes(rng);
      const context = randomContext(rng);
      const resource = rng() < 0.7 ? randomResource(rng, ORGANIZATION_ID) : undefined;
      for (const action of PERMISSION_VALUES) {
        const shared = { action, context, ...(resource === undefined ? {} : { resource }) };
        const subordinate = evaluate({
          ...shared,
          principal: principalFor(role, { grants, scopes }),
        });
        if (!subordinate.allowed) continue;
        dominated += 1;
        const owner = evaluate({ ...shared, principal: principalFor('OWNER', { grants, scopes }) });
        expect(
          owner.allowed,
          caseLabel(index, { role, action, context, resource, grants, scopes }),
        ).toBe(true);
      }
    }
    // Non-vacuity: the subordinate role really was allowed sometimes.
    expect(dominated, `${role} was never allowed — the dominance check proved nothing`).toBeGreaterThan(
      0,
    );
  });
});
