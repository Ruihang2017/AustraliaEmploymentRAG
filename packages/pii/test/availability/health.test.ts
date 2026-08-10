import { describe, expect, it } from 'vitest';

import {
  aggregateDetectorHealth,
  createDetectorProbe,
  decideOperationAdmission,
  DETECTOR_STAGE_NAMES,
  OPERATION_CLASSES,
} from '../../src/availability/index.js';
import type { DetectorStageName, StageHealth, StageHealthSnapshot } from '../../src/availability/index.js';

const READY: StageHealthSnapshot = {
  limits: 'READY',
  deterministic: 'READY',
  entity: 'READY',
  context: 'READY',
};

function withStage(stage: DetectorStageName, health: StageHealth): StageHealthSnapshot {
  return { ...READY, [stage]: health };
}

function assertSplit(snapshot: StageHealthSnapshot): void {
  const availability = aggregateDetectorHealth(snapshot);
  for (const operation of OPERATION_CLASSES) {
    const decision = decideOperationAdmission(operation, availability);
    if (operation.startsWith('FREE_TEXT_')) {
      expect(decision).toMatchObject({
        outcome: 'FAIL_CLOSED',
        errorCode: 'GENERATION_UNAVAILABLE',
        reason: 'PII_DETECTION_UNAVAILABLE',
      });
    } else {
      expect(decision).toEqual({ outcome: 'PROCEED' });
    }
  }
}

describe('detector health aggregation', () => {
  for (const stage of DETECTOR_STAGE_NAMES) {
    for (const health of ['DEGRADED', 'UNAVAILABLE'] as const) {
      it(`${stage} ${health} is not authoritative and applies the split`, () => {
        const availability = aggregateDetectorHealth(withStage(stage, health));
        expect(availability).toEqual({ state: 'NOT_AUTHORITATIVE', affectedStages: [stage] });
        assertSplit(withStage(stage, health));
      });
    }
  }

  it('emits all affected stages in the declared order', () => {
    const snapshot: StageHealthSnapshot = {
      limits: 'UNAVAILABLE',
      deterministic: 'UNAVAILABLE',
      entity: 'UNAVAILABLE',
      context: 'UNAVAILABLE',
    };
    expect(aggregateDetectorHealth(snapshot)).toEqual({
      state: 'NOT_AUTHORITATIVE',
      affectedStages: [...DETECTOR_STAGE_NAMES],
    });
    assertSplit(snapshot);
  });

  it('is authoritative only when all stages are ready', () => {
    expect(aggregateDetectorHealth(READY)).toEqual({
      state: 'AUTHORITATIVE',
      affectedStages: [],
    });
  });

  it('runs end to end from a probe whose entity recogniser is unavailable', () => {
    const snapshot = createDetectorProbe({ readiness: () => 'UNAVAILABLE' }).check();
    const availability = aggregateDetectorHealth(snapshot);
    expect(availability).toEqual({ state: 'NOT_AUTHORITATIVE', affectedStages: ['entity'] });
    expect(decideOperationAdmission('FREE_TEXT_ASK', availability)).toMatchObject({
      outcome: 'FAIL_CLOSED',
      errorCode: 'GENERATION_UNAVAILABLE',
    });
  });
});
