/**
 * FND-09 deliverable 11 — OPS-003's 90% warning (*"90% warning and 100% hard-stop tests pass"*;
 * PRD §22 alerts at 90/100%).
 *
 * THE CONTRACT, and why it is not "before/after instantaneous spend":
 * settlement RELEASES the unused remainder, so instantaneous spend goes down as well as up, and a
 * naive caller would re-fire the warning on every re-crossing. `crossesWarningThreshold` is therefore
 * defined over the period's HIGH-WATER MARK, which `nextHighWaterMark` maintains: a monotonic
 * non-decreasing series crosses the threshold exactly once, so the alert fires exactly once and never
 * again for the same period. `test/budget/warning-threshold.test.ts` drives release-containing random
 * series through the helper and asserts the firing count is exactly one.
 *
 * The threshold is computed from `warningThresholdBasisPoints` (`9_000n`), never from the profile's
 * documentation-only `warningThresholdRatio` float (sub-PRD D15). For the A$50 ceiling it is exactly
 * `45_000_000n` micro-AUD, asserted as a literal in the suite so a changed ratio cannot pass silently.
 */
import { ceilDiv, maxMicroAud, microAud, type MicroAud } from './micro-aud.js';
import type { BudgetProfile } from './profile.js';

const BASIS_POINTS_PER_UNIT = 10_000n;

/** The spend at which the warning fires: `ceil(ceiling * warningThresholdBasisPoints / 10_000)`. */
export function warningThresholdMicroAud(profile: BudgetProfile): MicroAud {
  return microAud(
    ceilDiv(profile.founderMonthlyCeilingMicroAud * profile.warningThresholdBasisPoints, BASIS_POINTS_PER_UNIT),
  );
}

/**
 * `true` exactly at the crossing.
 *
 * `before` and `after` MUST be successive values of the period's high-water mark (see the file
 * header); passing raw instantaneous spend re-fires the alert after every release.
 */
export function crossesWarningThreshold(
  before: MicroAud,
  after: MicroAud,
  profile: BudgetProfile,
): boolean {
  const threshold = warningThresholdMicroAud(profile);
  return before < threshold && after >= threshold;
}

/** The period's high-water mark after observing `spend` — monotonic non-decreasing by construction. */
export function nextHighWaterMark(previous: MicroAud, spend: MicroAud): MicroAud {
  return maxMicroAud(previous, spend);
}

/** `true` once cumulative founder-funded spend has reached the ceiling: OPS-003's 100% hard stop. */
export function reachedCeiling(spend: MicroAud, profile: BudgetProfile): boolean {
  return spend >= profile.founderMonthlyCeilingMicroAud;
}
