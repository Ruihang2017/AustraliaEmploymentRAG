/**
 * FND-07 acceptance item 4 — `[machine]` property test.
 *
 * Two layers. The exhaustive truth table is strictly stronger than sampling for a six-boolean input
 * (2^6 = 64 cases, all of them), and the >= 10,000-case property run is the acceptance item as written,
 * drawn from fixed seeds so a failure is reproducible and the suite cannot flake.
 */
import { describe, expect, it } from 'vitest';

import {
  DERIVED_CONDITIONS,
  REFUSAL_TABLE,
  STATUS_PRECEDENCE,
  decideAnswerStatus,
  statusOfCondition,
} from '../../src/answers/index.js';
import type { AnswerSignals, RefusalConditionName } from '../../src/answers/index.js';
import { ANSWER_STATUS_VALUES } from '../../../contracts/src/enums/index.js';
import { SEEDS, forEachDraw } from './arbitrary.js';

const DECLARED_CONDITIONS = new Set<RefusalConditionName>([
  ...REFUSAL_TABLE.map((row) => row.condition),
  ...DERIVED_CONDITIONS.map((entry) => entry.condition),
]);

const SIGNAL_KEYS = [
  'outOfScope',
  'sourceStaleOrUnavailableAndMaterial',
  'unreconciledAuthorityConflict',
  'sufficientApplicableEvidence',
  'allMaterialClaimsSupported',
  'materialFactUnknown',
] as const;

function signalsFromBits(bits: number): AnswerSignals {
  return {
    outOfScope: (bits & 1) !== 0,
    sourceStaleOrUnavailableAndMaterial: (bits & 2) !== 0,
    unreconciledAuthorityConflict: (bits & 4) !== 0,
    sufficientApplicableEvidence: (bits & 8) !== 0,
    allMaterialClaimsSupported: (bits & 16) !== 0,
    materialFactUnknown: (bits & 32) !== 0,
  };
}

/** Any condition that is restrictive, i.e. produces a status other than `SUPPORTED`. */
function anyRestrictiveConditionHolds(signals: AnswerSignals): boolean {
  return (
    signals.outOfScope ||
    signals.sourceStaleOrUnavailableAndMaterial ||
    signals.unreconciledAuthorityConflict ||
    !signals.sufficientApplicableEvidence ||
    signals.materialFactUnknown ||
    !signals.allMaterialClaimsSupported
  );
}

/** Every invariant the acceptance item names, checked on one decision. */
function assertInvariants(signals: AnswerSignals, label: string): void {
  const decision = decideAnswerStatus(signals);

  expect(ANSWER_STATUS_VALUES as readonly string[], label).toContain(decision.status);

  // Never a status whose condition is absent from the signal set (D13a counts MATERIAL_CLAIMS_
  // UNSUPPORTED as INSUFFICIENT_EVIDENCE's trigger).
  expect(decision.firedConditions.length, `${label}: no condition fired`).toBeGreaterThan(0);
  for (const condition of decision.firedConditions) {
    expect(DECLARED_CONDITIONS.has(condition), `${label}: undeclared condition ${condition}`).toBe(
      true,
    );
  }
  expect(new Set(decision.firedConditions).size, `${label}: duplicate conditions`).toBe(
    decision.firedConditions.length,
  );

  // The status IS the status of the first (most restrictive) fired condition.
  const winner = decision.firedConditions[0];
  expect(winner).toBeDefined();
  if (winner !== undefined) expect(statusOfCondition(winner), label).toBe(decision.status);

  // The fired list is in precedence order and nothing more permissive than the winner is chosen.
  const ranks = decision.firedConditions.map((condition) =>
    STATUS_PRECEDENCE.indexOf(statusOfCondition(condition)),
  );
  expect([...ranks].sort((a, b) => a - b), `${label}: fired conditions out of precedence order`).toEqual(
    ranks,
  );

  // Never SUPPORTED while a restrictive condition holds.
  if (anyRestrictiveConditionHolds(signals)) {
    expect(decision.status, `${label}: SUPPORTED despite a restrictive condition`).not.toBe(
      'SUPPORTED',
    );
  } else {
    expect(decision.status, label).toBe('SUPPORTED');
  }
}

describe('decideAnswerStatus — exhaustive truth table (all 2^6 signal records)', () => {
  it('covers all 64 combinations, and each of the six fields varies (non-vacuity)', () => {
    const all = Array.from({ length: 64 }, (_, bits) => signalsFromBits(bits));
    expect(new Set(all.map((signals) => JSON.stringify(signals))).size).toBe(64);
    for (const key of SIGNAL_KEYS) {
      expect(all.some((signals) => signals[key])).toBe(true);
      expect(all.some((signals) => !signals[key])).toBe(true);
    }
  });

  it('is total: every combination returns a status, none throws', () => {
    for (let bits = 0; bits < 64; bits += 1) {
      assertInvariants(signalsFromBits(bits), `bits=${bits}`);
    }
  });

  it('the one D13a combination returns INSUFFICIENT_EVIDENCE via the derived condition', () => {
    let seen = 0;
    for (let bits = 0; bits < 64; bits += 1) {
      const signals = signalsFromBits(bits);
      const noTabledRow =
        !signals.outOfScope &&
        !signals.sourceStaleOrUnavailableAndMaterial &&
        !signals.unreconciledAuthorityConflict &&
        signals.sufficientApplicableEvidence &&
        !signals.materialFactUnknown &&
        !signals.allMaterialClaimsSupported;
      if (!noTabledRow) continue;
      seen += 1;
      const decision = decideAnswerStatus(signals);
      expect(decision.status).toBe('INSUFFICIENT_EVIDENCE');
      expect(decision.firedConditions).toEqual(['MATERIAL_CLAIMS_UNSUPPORTED']);
    }
    // One combination of the six booleans is fully determined here, so exactly one bit pattern.
    expect(seen).toBe(1);
  });
});

const CASES = 10_000;

describe(`decideAnswerStatus — property run (${CASES} cases, fixed seeds ${SEEDS.length})`, () => {
  it(`holds every invariant over ${CASES} generated signal records`, () => {
    let drawn = 0;
    forEachDraw(CASES, (rng, index, seed) => {
      drawn += 1;
      const signals: AnswerSignals = {
        outOfScope: rng.bool(),
        sourceStaleOrUnavailableAndMaterial: rng.bool(),
        unreconciledAuthorityConflict: rng.bool(),
        sufficientApplicableEvidence: rng.bool(),
        allMaterialClaimsSupported: rng.bool(),
        materialFactUnknown: rng.bool(),
      };
      assertInvariants(signals, `seed=0x${seed.toString(16)} case=${index}`);
    });
    expect(drawn).toBe(CASES);
  });

  it('is deterministic: the same seeds produce the same decisions twice', () => {
    const run = (): string[] => {
      const results: string[] = [];
      forEachDraw(500, (rng) => {
        const decision = decideAnswerStatus({
          outOfScope: rng.bool(),
          sourceStaleOrUnavailableAndMaterial: rng.bool(),
          unreconciledAuthorityConflict: rng.bool(),
          sufficientApplicableEvidence: rng.bool(),
          allMaterialClaimsSupported: rng.bool(),
          materialFactUnknown: rng.bool(),
        });
        results.push(`${decision.status}:${decision.firedConditions.join(',')}`);
      });
      return results;
    };
    expect(run()).toEqual(run());
  });

  it('returns a fresh array each call — no shared mutable result between callers', () => {
    const signals: AnswerSignals = {
      outOfScope: true,
      sourceStaleOrUnavailableAndMaterial: false,
      unreconciledAuthorityConflict: false,
      sufficientApplicableEvidence: true,
      allMaterialClaimsSupported: true,
      materialFactUnknown: false,
    };
    const first = decideAnswerStatus(signals);
    const second = decideAnswerStatus(signals);
    expect(first.firedConditions).not.toBe(second.firedConditions);
    expect(first.firedConditions).toEqual(second.firedConditions);
  });
});
