/**
 * FND-08 acceptance item 5 — `[machine]` property test, 10,000 cases:
 * *a transition computed against a stale ETag is never applicable*, for any state pair, actor and
 * condition set.
 *
 * The generator is a hand-rolled deterministic LCG with a fixed seed rather than a property-testing
 * library, because no member `package.json` in this workspace may declare a dependency of any kind
 * (FND-01's skeleton assertions) — the same route FND-03 took for its 10,000-id monotonicity test.
 * A deterministic seed also means a failure reproduces exactly; `Math.random` is banned in this leaf
 * by the determinism test.
 *
 * Per-outcome counters are asserted at the end: without them the property would be vacuously true if
 * the generator happened to produce only rejections.
 */
import { describe, expect, it } from 'vitest';

import { WORKFLOW_ACTOR_VALUES } from '../../src/workflow/actors.js';
import { MATERIAL_TRIGGER_VALUES } from '../../src/workflow/conditions.js';
import { RECORD_WORKFLOW_STATE_VALUES } from '../../src/workflow/contracts.js';
import {
  applyTransition,
  type RecordWorkflowSnapshot,
  type TransitionRequest,
} from '../../src/workflow/apply-transition.js';
import { computeETag } from '../../src/workflow/etag.js';
import { TRANSITION_INDEX, transitionKey } from '../../src/workflow/transitions.js';

const SEED = 0x5eed_08_08;
const CASES = 10_000;
const RESOURCE_IDS = ['rec_a', 'rec_b', 'rec_0193f2c1', 'rec_.dotted', 'rec_1'];
const IF_MATCH_KINDS = ['fresh', 'wrong-version', 'wrong-resource', 'absent', 'garbage'] as const;
type IfMatchKind = (typeof IF_MATCH_KINDS)[number];

/** A 32-bit LCG (Numerical Recipes constants). Deterministic, no clock, no `Math.random`. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

describe('property: a stale ETag never applies a transition', () => {
  it(`holds over ${CASES} generated cases (seed ${SEED})`, () => {
    const next = makeRandom(SEED);
    const pick = <T>(values: readonly T[]): T => {
      const value = values[next() % values.length];
      if (value === undefined) throw new Error('empty generator pool');
      return value;
    };

    const counts: Record<string, number> = {
      ok: 0,
      STALE: 0,
      MISSING: 0,
      INVALID_TRANSITION: 0,
      ACTOR_NOT_PERMITTED: 0,
      CONDITION_NOT_MET: 0,
    };

    for (let index = 0; index < CASES; index += 1) {
      const id = pick(RESOURCE_IDS);
      const rowVersion = next() % 1_000_001;
      const record: RecordWorkflowSnapshot = {
        id,
        state: pick(RECORD_WORKFLOW_STATE_VALUES),
        rowVersion,
        reviewerAssigned: next() % 2 === 0,
        savedAnswerCount: next() % 3,
      };

      const kind: IfMatchKind = pick(IF_MATCH_KINDS);
      const correct = computeETag(rowVersion, id);
      const ifMatch =
        kind === 'fresh'
          ? correct
          : kind === 'wrong-version'
            ? computeETag(rowVersion === 0 ? 1 : rowVersion - 1, id)
            : kind === 'wrong-resource'
              ? computeETag(rowVersion, pick(RESOURCE_IDS.filter((other) => other !== id)))
              : kind === 'garbage'
                ? `w1.${next() % 97}.garbage_${next() % 13}`
                : undefined;

      const request: TransitionRequest = {
        to: pick(RECORD_WORKFLOW_STATE_VALUES),
        actor: pick(WORKFLOW_ACTOR_VALUES),
        ifMatch,
        reason: next() % 2 === 0 ? 'a reason' : undefined,
        trigger: next() % 2 === 0 ? pick(MATERIAL_TRIGGER_VALUES) : undefined,
        replacementRef: next() % 2 === 0 ? 'ans_1' : undefined,
        disclaimerAcknowledged: next() % 2 === 0,
        confirmed: next() % 2 === 0,
      };

      const where = `seed=${SEED} case=${index} kind=${kind} ${record.state}->${String(request.to)} actor=${String(request.actor)} rowVersion=${rowVersion} id=${id}`;
      const outcome = applyTransition(record, request);

      if (outcome.ok) {
        counts.ok = (counts.ok ?? 0) + 1;
        // The property, stated as an implication: applicable ⇒ the caller held the current token.
        expect(ifMatch, `applied with a non-fresh ETag — ${where}`).toBe(correct);
        expect(kind, `applied with kind=${kind} — ${where}`).toBe('fresh');
        expect(
          TRANSITION_INDEX.has(transitionKey(record.state, String(request.to))),
          `applied a pair outside PRD §32.6 — ${where}`,
        ).toBe(true);
        expect(outcome.next.rowVersion, `row_version did not increment — ${where}`).toBe(
          rowVersion + 1,
        );
        expect(outcome.next.rowVersion, `row_version not increasing — ${where}`).toBeGreaterThan(
          rowVersion,
        );
        expect(outcome.next.etag, `etag not recomputed — ${where}`).toBe(
          computeETag(rowVersion + 1, id),
        );
        expect(outcome.next.etag, `etag unchanged after a write — ${where}`).not.toBe(correct);
      } else {
        counts[outcome.reason] = (counts[outcome.reason] ?? 0) + 1;
        if (kind === 'absent') {
          expect(outcome.reason, `absent If-Match must be MISSING — ${where}`).toBe('MISSING');
        } else if (kind !== 'fresh') {
          expect(outcome.reason, `non-fresh If-Match must be STALE — ${where}`).toBe('STALE');
        } else {
          expect(
            ['INVALID_TRANSITION', 'ACTOR_NOT_PERMITTED', 'CONDITION_NOT_MET'],
            `a fresh ETag must not be rejected as stale — ${where}`,
          ).toContain(outcome.reason);
        }
      }
    }

    for (const [outcome, count] of Object.entries(counts)) {
      expect(count, `the generator never produced outcome ${outcome} — the property is vacuous`)
        .toBeGreaterThan(0);
    }
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(CASES);
  });

  it('is reproducible — the same seed produces the same draw sequence', () => {
    const a = makeRandom(SEED);
    const b = makeRandom(SEED);
    const drawsA = Array.from({ length: 50 }, () => a());
    const drawsB = Array.from({ length: 50 }, () => b());
    expect(drawsA).toEqual(drawsB);
    expect(new Set(drawsA).size, 'the generator is degenerate').toBeGreaterThan(40);
  });

  it('includes the fresh (equal) case as well as mismatches', () => {
    expect(IF_MATCH_KINDS).toContain('fresh');
    expect(IF_MATCH_KINDS).toContain('wrong-version');
    expect(IF_MATCH_KINDS).toContain('wrong-resource');
  });
});
