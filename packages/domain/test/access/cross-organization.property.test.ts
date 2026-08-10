/**
 * FND-06 acceptance item 3 — SEC-001, PRD §21.2, PRD §38.1.
 *
 * >= 10,000 generated cases over VALID principals (real columns, real grants, real scopes, real
 * contexts) and all fourteen actions. Validity is the whole point: a generator that produced
 * malformed principals would be stopped by the membership stage and the property would hold
 * vacuously, proving nothing. The non-vacuity control below equalises the organisation ids over the
 * same draws and requires that some of them are allowed.
 */
import { describe, expect, it } from 'vitest';

import { evaluate } from '../../src/access/evaluate.js';
import { ORGANIZATION_ID, OTHER_ORGANIZATION_ID, randomInput } from './generators.js';
import { SEEDS, forEachDraw } from './rng.js';

const CASES = 10_000;

describe('a cross-organisation resource is never authorised', () => {
  it(`denies with CROSS_ORGANIZATION for ${String(CASES)} generated cases`, () => {
    let checked = 0;
    forEachDraw(CASES, (rng, index, seed) => {
      const input = randomInput(rng, OTHER_ORGANIZATION_ID);
      const decision = evaluate(input);
      const where = `seed 0x${seed.toString(16)} case ${String(index)} ${input.action} ${
        input.principal.role ?? input.principal.kind
      }`;
      expect(decision.allowed, where).toBe(false);
      if (!decision.allowed) expect(decision.reason, where).toBe('CROSS_ORGANIZATION');
      checked += 1;
    });
    expect(checked).toBe(CASES);
  });

  it('the same draws with matching organisations DO allow some (non-vacuity)', () => {
    let allowed = 0;
    let denied = 0;
    forEachDraw(CASES, (rng) => {
      const decision = evaluate(randomInput(rng, ORGANIZATION_ID));
      if (decision.allowed) allowed += 1;
      else denied += 1;
    });
    expect(allowed, 'every same-organisation draw was denied — the generator is degenerate').
      toBeGreaterThan(0);
    expect(denied).toBeGreaterThan(0);
  });

  it('the generator really produces valid, varied principals (non-vacuity)', () => {
    const columns = new Set<string>();
    const actions = new Set<string>();
    let withGrants = 0;
    let withScopes = 0;
    forEachDraw(2_000, (rng) => {
      const input = randomInput(rng, OTHER_ORGANIZATION_ID);
      columns.add(input.principal.role ?? input.principal.kind);
      actions.add(input.action);
      if (input.principal.grants.length > 0) withGrants += 1;
      if (input.principal.scopes.length > 0) withScopes += 1;
    });
    expect(columns.size).toBe(6);
    expect(actions.size).toBe(14);
    expect(withGrants).toBeGreaterThan(100);
    expect(withScopes).toBeGreaterThan(100);
  });

  it('draws from every fixed seed, so a failure is reproducible', () => {
    const seen = new Set<number>();
    forEachDraw(CASES, (_rng, _index, seed) => seen.add(seed));
    expect(seen.size).toBe(SEEDS.length);
  });
});
