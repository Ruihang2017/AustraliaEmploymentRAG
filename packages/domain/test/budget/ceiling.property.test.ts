/**
 * FND-09 acceptance item 3 — the ceiling property, and OPS-003's 100% hard stop.
 *
 * >= 10,000 generated reserve/settle sequences, interleaved and including cancellations: cumulative
 * founder-funded debit never exceeds the ceiling, outstanding holds are counted against it, and no
 * admission is granted whose amount exceeds what its reserve class had available.
 *
 * The suite is non-vacuous by construction and by machine check:
 *  - the corpus is asserted to contain both admissions and denials, and to drive committed spend to
 *    within a whisker of the ceiling — a generator that never pressures the ceiling proves nothing;
 *  - the same harness is run against a deliberately WRONG admit (one that ignores outstanding holds)
 *    and is asserted to REPORT a violation. If that ever goes green the whole property is worthless.
 */
import { describe, expect, it } from 'vitest';

import { BUDGET_PROFILE_V1, fromWholeAud, microAud } from '../../src/budget/index.js';
import { admitIgnoringHolds, correctAdmit, runSequence } from './harness.js';
import { Rng, SEEDS, forEachDraw } from './rng.js';

const SEQUENCES = 10_000;

/**
 * A deliberately SMALL ceiling (A$0.30–A$3.30 in micro-AUD) against token draws that cost roughly
 * A$0.05–A$0.60 per call, so most sequences actually reach the ceiling and are denied. Running only
 * against the real A$50 ceiling with small calls would make the property pass by never getting close;
 * the real ceiling is exercised separately below.
 */
function ceilingFor(rng: Rng): ReturnType<typeof microAud> {
  return microAud(300_000n + BigInt(rng.int(30)) * 100_000n);
}

describe('ceiling property: cumulative founder-funded debit never exceeds the ceiling', () => {
  it(`holds over ${String(SEQUENCES)} interleaved reserve/settle/cancel sequences`, () => {
    const violations: string[] = [];
    let admitted = 0;
    let denied = 0;
    let settlements = 0;
    let cancellations = 0;
    let closestToCeiling = 0n;

    forEachDraw(SEQUENCES, (rng, index, seed) => {
      const ceilingMicroAud = ceilingFor(rng);
      const result = runSequence(correctAdmit, rng, {
        ceilingMicroAud,
        byokOnly: false,
        operations: 5 + rng.int(16),
        maxInputTokens: 100_000n,
        maxOutputTokens: 20_000n,
      });
      if (result.violations.length > 0) {
        violations.push(`seed 0x${seed.toString(16)} case ${String(index)}: ${result.violations[0] ?? ''}`);
      }
      admitted += result.admitted;
      denied += result.denied;
      settlements += result.settlements;
      cancellations += result.cancellations;
      const headroom = ceilingMicroAud - result.peakCommittedMicroAud;
      if (result.peakCommittedMicroAud > 0n && (closestToCeiling === 0n || headroom < closestToCeiling)) {
        closestToCeiling = headroom;
      }
    });

    expect(violations.slice(0, 5), violations.join('\n')).toEqual([]);

    // Non-vacuity of the corpus itself.
    expect(admitted).toBeGreaterThan(1_000);
    expect(denied).toBeGreaterThan(1_000);
    expect(settlements).toBeGreaterThan(1_000);
    expect(cancellations).toBeGreaterThan(1_000);
    expect(closestToCeiling).toBeLessThan(200_000n);
  });

  it('holds against the real A$50 profile ceiling with large calls', () => {
    const violations: string[] = [];
    forEachDraw(1_000, (rng, index, seed) => {
      const result = runSequence(correctAdmit, rng, {
        ceilingMicroAud: BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud,
        byokOnly: false,
        operations: 5 + rng.int(16),
        maxInputTokens: 4_000_000n,
        maxOutputTokens: 1_000_000n,
      });
      if (result.violations.length > 0) {
        violations.push(`seed 0x${seed.toString(16)} case ${String(index)}: ${result.violations[0] ?? ''}`);
      }
      expect(result.settledMicroAud).toBeLessThanOrEqual(fromWholeAud(50n));
    });
    expect(violations.slice(0, 5), violations.join('\n')).toEqual([]);
  });

  it('the harness REPORTS a violation for an admit that ignores outstanding holds (non-vacuity)', () => {
    let sequencesWithViolations = 0;
    let doubleSpendSeen = false;
    for (const seed of SEEDS) {
      const rng = new Rng(seed);
      for (let i = 0; i < 50; i += 1) {
        const result = runSequence(admitIgnoringHolds, rng, {
          ceilingMicroAud: microAud(1_000_000n),
          byokOnly: false,
          operations: 20,
          maxInputTokens: 100_000n,
          maxOutputTokens: 20_000n,
        });
        if (result.violations.length > 0) {
          sequencesWithViolations += 1;
          if (result.violations.some((entry) => entry.includes('invariant 2'))) doubleSpendSeen = true;
        }
      }
    }
    expect(sequencesWithViolations).toBeGreaterThan(0);
    expect(doubleSpendSeen, 'the double-spend invariant must be the one that fires').toBe(true);
  });
});
