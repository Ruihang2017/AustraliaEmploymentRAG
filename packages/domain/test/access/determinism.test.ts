/**
 * FND-06 acceptance item 12 — determinism and immutability (PRD §45.2, §39.1).
 *
 * `ROLE_MATRIX`, `PERMISSION_REQUIRED_SCOPES`, `CONDITION_PREDICATES` and `EVALUATION_ORDER` are
 * process-lifetime singletons read by every concurrent request in `apps/api`. `Object.freeze` is
 * SHALLOW, so this suite WALKS each of them and asserts frozen at every level: one caller mutating a
 * row would otherwise change an authorisation answer for every other request for the life of the
 * process — a privilege-escalation bug, not a hygiene one.
 */
import { describe, expect, it } from 'vitest';

import {
  CONDITION_DENY_REASON,
  CONDITION_PREDICATES,
  CONDITION_VALUES,
} from '../../src/access/conditions.js';
import { DENY_REASON_VALUES, EVALUATION_ORDER, evaluate } from '../../src/access/evaluate.js';
import { ROLE_MATRIX, MATRIX_ACTIONS, MATRIX_COLUMNS } from '../../src/access/matrix.js';
import { INDISTINGUISHABLE_NOT_FOUND_REASONS } from '../../src/access/not-found.js';
import { PRINCIPAL_COLUMN_VALUES, PRINCIPAL_KIND_VALUES } from '../../src/access/principal.js';
import {
  PERMISSION_RESOURCE_REQUIREMENT,
  RESOURCE_REQUIREMENT_VALUES,
} from '../../src/access/resource.js';
import { PERMISSION_REQUIRED_SCOPES } from '../../src/access/scopes.js';
import { ORGANIZATION_ID, randomInput, resourceFor, principalFor } from './generators.js';
import { Rng, forEachDraw } from './rng.js';

function unfrozen(value: unknown, path: string, found: string[] = []): string[] {
  if (value === null || typeof value !== 'object') return found;
  if (!Object.isFrozen(value)) found.push(path);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    unfrozen(child, `${path}.${key}`, found);
  }
  return found;
}

const EXPORTED_CONSTANTS: Readonly<Record<string, unknown>> = {
  ROLE_MATRIX,
  MATRIX_ACTIONS,
  MATRIX_COLUMNS,
  CONDITION_VALUES,
  CONDITION_PREDICATES,
  CONDITION_DENY_REASON,
  EVALUATION_ORDER,
  DENY_REASON_VALUES,
  PERMISSION_REQUIRED_SCOPES,
  PERMISSION_RESOURCE_REQUIREMENT,
  RESOURCE_REQUIREMENT_VALUES,
  PRINCIPAL_COLUMN_VALUES,
  PRINCIPAL_KIND_VALUES,
  INDISTINGUISHABLE_NOT_FOUND_REASONS,
};

describe('every exported constant is frozen at every level', () => {
  for (const [name, value] of Object.entries(EXPORTED_CONSTANTS)) {
    it(`${name} is deep-frozen`, () => {
      expect(unfrozen(value, name)).toEqual([]);
    });
  }

  it('the walker really finds a shallow freeze (positive control)', () => {
    const shallow = Object.freeze({ row: { cell: 'ALLOW' } });
    expect(unfrozen(shallow, 'shallow')).toEqual(['shallow.row']);
  });

  it('a write to a matrix cell does not take (frozen, not merely typed readonly)', () => {
    const before = ROLE_MATRIX.CORPUS_SEARCH_READ.OWNER.kind;
    try {
      (ROLE_MATRIX.CORPUS_SEARCH_READ.OWNER as { kind: string }).kind = 'DENY';
    } catch {
      // strict mode throws; either way the value must be unchanged
    }
    expect(ROLE_MATRIX.CORPUS_SEARCH_READ.OWNER.kind).toBe(before);
  });
});

describe('evaluate() is a pure function', () => {
  it('gives the same answer 1,000 times for the same input', () => {
    const input = {
      principal: principalFor('VIEWER', ['EXPORT_CREATE']),
      action: 'EXPORT_CREATE',
      intent: 'READ',
      resource: resourceFor(),
      context: { ownerCount: 3, targetRole: 'RESEARCHER' },
    } as const;
    const first = evaluate(input);
    for (let i = 0; i < 1_000; i += 1) expect(evaluate(input)).toEqual(first);
  });

  it('gives the same answer for two independent draws of the same seeds', () => {
    const runA: unknown[] = [];
    const runB: unknown[] = [];
    forEachDraw(2_000, (rng) => runA.push(evaluate(randomInput(rng, ORGANIZATION_ID))));
    forEachDraw(2_000, (rng) => runB.push(evaluate(randomInput(rng, ORGANIZATION_ID))));
    expect(runA).toEqual(runB);
    expect(runA.length).toBe(2_000);
  });

  it('the generator itself is deterministic (non-vacuity)', () => {
    const a = new Rng(0x1a2b3c4d);
    const b = new Rng(0x1a2b3c4d);
    expect([a.float(), a.int(10), a.bool()]).toEqual([b.float(), b.int(10), b.bool()]);
  });

  it('mutating the input object after the call does not change the decision', () => {
    const mutable: {
      principal: ReturnType<typeof principalFor>;
      action: 'CORPUS_SEARCH_READ';
      context: { ownerCount?: number };
    } = {
      principal: principalFor('OWNER'),
      action: 'CORPUS_SEARCH_READ',
      context: { ownerCount: 2 },
    };
    const decision = evaluate(mutable);
    mutable.context.ownerCount = 1;
    expect(decision).toEqual({ allowed: true, via: 'CORPUS_SEARCH_READ' });
  });

  it('the returned decision is frozen — a caller cannot rewrite an answer', () => {
    const decision = evaluate({ principal: principalFor('OWNER'), action: 'CORPUS_SEARCH_READ' });
    expect(Object.isFrozen(decision)).toBe(true);
    try {
      (decision as { allowed: boolean }).allowed = false;
    } catch {
      // strict mode throws
    }
    expect(decision.allowed).toBe(true);
  });
});
