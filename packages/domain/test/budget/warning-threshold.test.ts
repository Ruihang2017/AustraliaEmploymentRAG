/**
 * FND-09 acceptance item 4 — OPS-003's 90% warning: `crossesWarningThreshold` fires exactly once as
 * spend crosses 0.9 × ceiling, and never again for the same period.
 *
 * "Never again" is only true of a monotonic non-decreasing series, because settlement RELEASES the
 * unused remainder and instantaneous spend therefore goes down as well as up. The contract is the
 * period's high-water mark (`nextHighWaterMark`); this suite proves the firing count is exactly one
 * over random series that contain releases.
 */
import { describe, expect, it } from 'vitest';

import {
  BUDGET_PROFILE_V1,
  crossesWarningThreshold,
  microAud,
  nextHighWaterMark,
  reachedCeiling,
  warningThresholdMicroAud,
  ZERO_MICRO_AUD,
} from '../../src/budget/index.js';
import { forEachDraw } from './rng.js';

const THRESHOLD = warningThresholdMicroAud(BUDGET_PROFILE_V1);
const CEILING = BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud;

describe('the threshold itself', () => {
  it('is exactly 45,000,000 micro-AUD for the A$50 ceiling', () => {
    expect(THRESHOLD).toBe(45_000_000n);
    expect(typeof THRESHOLD).toBe('bigint');
  });

  it('is computed from basis points, not from the documentation-only ratio', () => {
    expect(BUDGET_PROFILE_V1.warningThresholdBasisPoints).toBe(9_000n);
    expect(THRESHOLD).toBe((CEILING * 9_000n) / 10_000n);
  });
});

describe('exact crossing boundaries', () => {
  const cases: readonly { readonly name: string; readonly before: bigint; readonly after: bigint; readonly fires: boolean }[] = [
    { name: 'T-1 -> T fires', before: THRESHOLD - 1n, after: THRESHOLD, fires: true },
    { name: 'T -> T+1 does not fire again', before: THRESHOLD, after: THRESHOLD + 1n, fires: false },
    { name: 'T-2 -> T-1 does not fire', before: THRESHOLD - 2n, after: THRESHOLD - 1n, fires: false },
    { name: '0 -> ceiling fires (a single jump still fires)', before: 0n, after: CEILING, fires: true },
    { name: 'T+1 -> ceiling does not fire', before: THRESHOLD + 1n, after: CEILING, fires: false },
    { name: 'no movement at T does not fire', before: THRESHOLD, after: THRESHOLD, fires: false },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(
        crossesWarningThreshold(microAud(testCase.before), microAud(testCase.after), BUDGET_PROFILE_V1),
      ).toBe(testCase.fires);
    });
  }
});

describe('exactly once over a random release-containing series (>= 1,000 series)', () => {
  it('fires once when the high-water mark reaches the threshold, and never otherwise', () => {
    let seriesThatFired = 0;
    let seriesThatDidNot = 0;

    forEachDraw(1_000, (rng, index, seed) => {
      let highWater = ZERO_MICRO_AUD;
      let instantaneous = 0n;
      let firings = 0;
      const steps = 20 + rng.int(30);

      for (let step = 0; step < steps; step += 1) {
        // Spend up, then release part of it back — the pattern a naive implementation re-fires on.
        instantaneous += BigInt(rng.int(4_000_000));
        if (rng.bool()) instantaneous -= BigInt(rng.int(2_000_000));
        if (instantaneous < 0n) instantaneous = 0n;
        const before = highWater;
        highWater = nextHighWaterMark(highWater, microAud(instantaneous));
        if (crossesWarningThreshold(before, highWater, BUDGET_PROFILE_V1)) firings += 1;
      }

      const reached = highWater >= THRESHOLD;
      expect(firings, `seed 0x${seed.toString(16)} case ${String(index)}`).toBe(reached ? 1 : 0);
      if (reached) seriesThatFired += 1;
      else seriesThatDidNot += 1;
    });

    // Non-vacuity: the corpus must contain both branches, or the assertion above is trivially true.
    expect(seriesThatFired).toBeGreaterThan(0);
    expect(seriesThatDidNot).toBeGreaterThan(0);
  });

  it('a caller feeding raw instantaneous spend WOULD re-fire — which is why the contract is the high-water mark', () => {
    const series = [THRESHOLD - 1n, THRESHOLD + 5n, THRESHOLD - 10n, THRESHOLD + 1n];
    let naiveFirings = 0;
    for (let index = 1; index < series.length; index += 1) {
      const before = series[index - 1];
      const after = series[index];
      if (before === undefined || after === undefined) throw new Error('bad series');
      if (crossesWarningThreshold(microAud(before), microAud(after), BUDGET_PROFILE_V1)) {
        naiveFirings += 1;
      }
    }
    expect(naiveFirings).toBe(2);

    let highWater = ZERO_MICRO_AUD;
    let correctFirings = 0;
    for (const spend of series) {
      const before = highWater;
      highWater = nextHighWaterMark(highWater, microAud(spend));
      if (crossesWarningThreshold(before, highWater, BUDGET_PROFILE_V1)) correctFirings += 1;
    }
    expect(correctFirings).toBe(1);
  });
});

describe('the 100% hard stop half of OPS-003', () => {
  it('reports the ceiling reached at exactly the ceiling, and not before', () => {
    expect(reachedCeiling(microAud(CEILING - 1n), BUDGET_PROFILE_V1)).toBe(false);
    expect(reachedCeiling(microAud(CEILING), BUDGET_PROFILE_V1)).toBe(true);
    expect(reachedCeiling(microAud(CEILING + 1n), BUDGET_PROFILE_V1)).toBe(true);
  });
});
