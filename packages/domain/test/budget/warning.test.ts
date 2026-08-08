/**
 * FND-09 acceptance item "90% warning" `[machine]` — requirement **OPS-003** (*"90% warning and 100%
 * hard-stop tests pass"*), PRD §22 (alerting at 90/100%).
 */
import { describe, expect, it } from 'vitest';

import { BUDGET_PROFILE_V1 } from '../../src/budget/budget-profile.js';
import { microAud } from '../../src/budget/micro-aud.js';
import { crossesWarningThreshold, warningThresholdOf } from '../../src/budget/warning.js';

const profile = BUDGET_PROFILE_V1;
const threshold = warningThresholdOf(profile);

describe('warning threshold', () => {
  it('is 90% of the A$50 ceiling, computed in basis points', () => {
    expect(threshold).toBe(45_000_000n);
    expect(typeof threshold).toBe('bigint');
    expect(threshold * 10_000n).toBe(
      profile.founderMonthlyCeilingMicroAud * profile.warningThresholdBasisPoints,
    );
  });

  it('fires exactly once across a spend series walked one micro-AUD at a time', () => {
    // The window is centred on the threshold: every step within it is a single micro-AUD, which is
    // where an off-by-one in the comparison would hide.
    const from = threshold - 5_000n;
    const to = threshold + 5_000n;
    let fired = 0;
    let firedAt: bigint | null = null;
    for (let spend = from; spend < to; spend += 1n) {
      if (crossesWarningThreshold(microAud(spend), microAud(spend + 1n), profile)) {
        fired += 1;
        firedAt = spend + 1n;
      }
    }
    expect(fired).toBe(1);
    expect(firedAt).toBe(threshold);
  });

  it('fires exactly once over the whole period, walked in coarse steps from zero', () => {
    let fired = 0;
    let before = microAud(0n);
    for (let step = 1n; step <= 100n; step += 1n) {
      const after = microAud(step * 500_000n);
      if (crossesWarningThreshold(before, after, profile)) fired += 1;
      before = after;
    }
    expect(fired).toBe(1);
  });

  it('never fires again once spend is already at or above the threshold', () => {
    for (let spend = threshold; spend <= threshold + 5_000_000n; spend += 250_000n) {
      expect(crossesWarningThreshold(microAud(spend), microAud(spend + 1n), profile)).toBe(false);
    }
  });

  it('still reports a crossing when a single step jumps over the threshold', () => {
    expect(crossesWarningThreshold(microAud(0n), microAud(50_000_000n), profile)).toBe(true);
    expect(crossesWarningThreshold(microAud(44_999_999n), microAud(45_000_001n), profile)).toBe(
      true,
    );
  });

  it('reports no crossing when spend does not move', () => {
    expect(crossesWarningThreshold(threshold, threshold, profile)).toBe(false);
    expect(crossesWarningThreshold(microAud(0n), microAud(0n), profile)).toBe(false);
    expect(
      crossesWarningThreshold(microAud(44_999_999n), microAud(44_999_999n), profile),
    ).toBe(false);
  });

  it('reports the crossing at exactly the threshold, not one micro-AUD later', () => {
    expect(
      crossesWarningThreshold(microAud(44_999_999n), microAud(45_000_000n), profile),
    ).toBe(true);
    expect(
      crossesWarningThreshold(microAud(44_999_998n), microAud(44_999_999n), profile),
    ).toBe(false);
  });
});
