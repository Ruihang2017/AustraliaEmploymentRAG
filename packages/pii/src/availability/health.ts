/**
 * EVID-03 health aggregation follows PRD Sec10.1's "MUST combine" basis: all four detector stages
 * must be READY for the result to be authoritative. There is no middle grade; any DEGRADED or
 * UNAVAILABLE stage makes the combined detector not authoritative. This conservative reading is a
 * writeback candidate for docs/prd/12-evidence-safety/README.md D5, which this ticket does not edit.
 */
import { deepFreeze } from '../contract/freeze.js';

export const DETECTOR_STAGE_NAMES = deepFreeze([
  'limits',
  'deterministic',
  'entity',
  'context',
] as const);

export type DetectorStageName = (typeof DETECTOR_STAGE_NAMES)[number];
export type StageHealth = 'READY' | 'DEGRADED' | 'UNAVAILABLE';
export type StageHealthSnapshot = Readonly<Record<DetectorStageName, StageHealth>>;
export type DetectorAvailabilityState = 'AUTHORITATIVE' | 'NOT_AUTHORITATIVE';

export interface DetectorAvailability {
  readonly state: DetectorAvailabilityState;
  readonly affectedStages: readonly DetectorStageName[];
}

const HEALTH_RANK: Readonly<Record<StageHealth, number>> = deepFreeze({
  READY: 0,
  DEGRADED: 1,
  UNAVAILABLE: 2,
});

export function worstOf(a: StageHealth, b: StageHealth): StageHealth {
  return HEALTH_RANK[a] >= HEALTH_RANK[b] ? a : b;
}

export function aggregateDetectorHealth(snapshot: StageHealthSnapshot): DetectorAvailability {
  const affectedStages = DETECTOR_STAGE_NAMES.filter((stage) => snapshot[stage] !== 'READY');
  return deepFreeze({
    state: affectedStages.length === 0 ? 'AUTHORITATIVE' : 'NOT_AUTHORITATIVE',
    affectedStages,
  });
}
