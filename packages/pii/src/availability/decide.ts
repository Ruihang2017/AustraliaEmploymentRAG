/**
 * EVID-03 identifies PII detector unavailability separately from later provider and budget causes.
 * Those causes share GENERATION_UNAVAILABLE (503), but use distinct reason literals owned by
 * EVID-07 and EVID-08.
 */
import { deepFreeze } from '../contract/freeze.js';
import type { DetectorAvailability, DetectorStageName } from './health.js';
import { ADMITS_CUSTOMER_FREE_TEXT } from './operations.js';
import type { OperationClass } from './operations.js';

export interface KillSwitchState {
  readonly piiDetection?: boolean;
}

export type AvailabilityDecision =
  | { readonly outcome: 'PROCEED' }
  | {
      readonly outcome: 'FAIL_CLOSED';
      readonly errorCode: 'GENERATION_UNAVAILABLE';
      readonly httpStatus: 503;
      readonly reason: 'PII_DETECTION_UNAVAILABLE';
      readonly affectedStages: readonly DetectorStageName[];
    };

export const PROCEED_DECISION: Extract<AvailabilityDecision, { outcome: 'PROCEED' }> = deepFreeze({
  outcome: 'PROCEED',
});

export function applyKillSwitch(
  availability: DetectorAvailability,
  killSwitch?: KillSwitchState,
): DetectorAvailability {
  return deepFreeze({
    state: killSwitch?.piiDetection === true ? 'NOT_AUTHORITATIVE' : availability.state,
    affectedStages: [...availability.affectedStages],
  });
}

export function decideOperationAdmission(
  operation: OperationClass,
  availability: DetectorAvailability,
  killSwitch?: KillSwitchState,
): AvailabilityDecision {
  const effective = applyKillSwitch(availability, killSwitch);
  if (effective.state === 'AUTHORITATIVE' || !ADMITS_CUSTOMER_FREE_TEXT[operation]) {
    return PROCEED_DECISION;
  }
  return deepFreeze({
    outcome: 'FAIL_CLOSED',
    errorCode: 'GENERATION_UNAVAILABLE',
    httpStatus: 503,
    reason: 'PII_DETECTION_UNAVAILABLE',
    affectedStages: [...effective.affectedStages],
  });
}
