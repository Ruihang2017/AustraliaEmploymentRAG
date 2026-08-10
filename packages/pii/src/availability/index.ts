/**
 * Leaf barrel for RUNT-02, RUNT-08 and ASK-01. The package src/index.ts remains empty because the
 * repository skeleton gate requires its byte-exact placeholder.
 */
export { ADMITS_CUSTOMER_FREE_TEXT, isOperationClass, OPERATION_CLASSES } from './operations.js';
export type { OperationClass } from './operations.js';
export { aggregateDetectorHealth, DETECTOR_STAGE_NAMES, worstOf } from './health.js';
export type {
  DetectorAvailability,
  DetectorAvailabilityState,
  DetectorStageName,
  StageHealth,
  StageHealthSnapshot,
} from './health.js';
export { applyKillSwitch, decideOperationAdmission, PROCEED_DECISION } from './decide.js';
export type { AvailabilityDecision, KillSwitchState } from './decide.js';
export { createDetectorProbe, STATIC_STAGE_HEALTH } from './probe.js';
export type { DetectorProbe } from './probe.js';
export { projectDetectionStatus } from './status.js';
export type { PiiDetectionStatus } from './status.js';
