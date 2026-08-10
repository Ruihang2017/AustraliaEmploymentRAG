import { deepFreeze } from '../contract/freeze.js';
import type {
  DetectorAvailability,
  DetectorAvailabilityState,
  DetectorStageName,
} from './health.js';

export interface PiiDetectionStatus {
  readonly component: 'pii_detection';
  readonly state: DetectorAvailabilityState;
  readonly affectedStages: readonly DetectorStageName[];
  readonly since: string | null;
}

export function projectDetectionStatus(
  availability: DetectorAvailability,
  since: string | null,
): PiiDetectionStatus {
  return deepFreeze({
    component: 'pii_detection',
    state: availability.state,
    affectedStages: [...availability.affectedStages],
    since,
  });
}
