/**
 * FND-09 deliverable 11 — OPS-003's 90% warning (PRD §22 alerts at 90/100%).
 *
 * The threshold is computed from the profile's BASIS-POINT field, never from its declarative
 * `warningThresholdRatio` float: PRD §34.1 forbids floating point in money arithmetic.
 *
 * `crossesWarningThreshold` is strictly-below → at-or-above, so over a monotonically increasing spend
 * series it is true EXACTLY ONCE — at the step that crosses — and false for every later step, because
 * `before` is then already at or above the threshold. A step that jumps over the threshold still
 * reports the crossing.
 *
 * It is a pure predicate over two supplied amounts: no "already warned" flag, no clock and no period
 * bookkeeping. Remembering that a period has already warned is `DATA-07`'s and `18-ops-release`'s.
 *
 * Pure: no clock, no randomness, no I/O (PRD §39.1, §45.2).
 */
import type { BudgetProfile } from './budget-profile.js';
import { BASIS_POINT_DENOMINATOR, ceilDiv, microAud, type MicroAud } from './micro-aud.js';

/** The spend at which the warning fires — 90% of the founder monthly ceiling, rounded upward. */
export const warningThresholdOf = (profile: BudgetProfile): MicroAud =>
  microAud(
    ceilDiv(
      profile.founderMonthlyCeilingMicroAud * profile.warningThresholdBasisPoints,
      BASIS_POINT_DENOMINATOR,
    ),
  );

/** True only on the step that moves cumulative spend from below the threshold to at or above it. */
export function crossesWarningThreshold(
  before: MicroAud,
  after: MicroAud,
  profile: BudgetProfile,
): boolean {
  const threshold = warningThresholdOf(profile);
  return before < threshold && after >= threshold;
}
