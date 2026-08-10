import { deepFreeze } from '../contract/freeze.js';
import type { EntityRecogniser } from '../entity/port.js';
import { DETECTOR_STAGE_NAMES, worstOf } from './health.js';
import type { DetectorStageName, StageHealth, StageHealthSnapshot } from './health.js';

export interface DetectorProbe {
  readonly check: () => StageHealthSnapshot;
}

export const STATIC_STAGE_HEALTH: Readonly<
  Record<Exclude<DetectorStageName, 'entity'>, StageHealth>
> = deepFreeze({
  limits: 'READY',
  deterministic: 'READY',
  context: 'READY',
});

export function createDetectorProbe(
  recogniser: Pick<EntityRecogniser, 'readiness'>,
  observed: Partial<StageHealthSnapshot> = {},
): DetectorProbe {
  return deepFreeze({
    check: (): StageHealthSnapshot => {
      const derived: StageHealthSnapshot = {
        limits: STATIC_STAGE_HEALTH.limits,
        deterministic: STATIC_STAGE_HEALTH.deterministic,
        entity: recogniser.readiness(),
        context: STATIC_STAGE_HEALTH.context,
      };
      const combined = {} as Record<DetectorStageName, StageHealth>;
      for (const stage of DETECTOR_STAGE_NAMES) {
        combined[stage] = worstOf(derived[stage], observed[stage] ?? 'READY');
      }
      return deepFreeze(combined);
    },
  });
}
