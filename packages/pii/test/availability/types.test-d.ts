import { expectTypeOf } from 'vitest';

import { decideOperationAdmission } from '../../src/availability/decide.js';
import type {
  AvailabilityDecision,
  KillSwitchState,
} from '../../src/availability/decide.js';
import type {
  DetectorAvailability,
  StageHealth,
} from '../../src/availability/health.js';
import type { OperationClass } from '../../src/availability/operations.js';
import type { PiiDetectionStatus } from '../../src/availability/status.js';
import type { EntityReadiness } from '../../src/entity/port.js';

expectTypeOf<typeof decideOperationAdmission>().parameter(0).toEqualTypeOf<OperationClass>();
expectTypeOf<typeof decideOperationAdmission>()
  .parameter(1)
  .toEqualTypeOf<DetectorAvailability>();
expectTypeOf<typeof decideOperationAdmission>()
  .parameter(2)
  .toEqualTypeOf<KillSwitchState | undefined>();
expectTypeOf<Parameters<typeof decideOperationAdmission>['length']>().toEqualTypeOf<2 | 3>();
expectTypeOf<AvailabilityDecision['outcome']>().toEqualTypeOf<'PROCEED' | 'FAIL_CLOSED'>();

// @ts-expect-error no partial-acceptance decision exists
export const partialDecision: AvailabilityDecision = { outcome: 'PROCEED_WITH_DEGRADED_DETECTION' };

// @ts-expect-error the third argument is only the closed kill-switch input
export const withForce = decideOperationAdmission('FREE_TEXT_ASK', { state: 'AUTHORITATIVE', affectedStages: [] }, { force: true });

// @ts-expect-error excess properties cannot widen the kill-switch input
export const widenedKillSwitch: KillSwitchState = { piiDetection: true, force: true };

// @ts-expect-error the operation vocabulary is closed
export const invalidOperation: OperationClass = 'FREE_TEXT_REWRITE';

expectTypeOf<StageHealth>().toEqualTypeOf<EntityReadiness>();

export const affectedStagesAsStrings: readonly string[] = (
  {} as Extract<AvailabilityDecision, { outcome: 'FAIL_CLOSED' }>
).affectedStages;

expectTypeOf<keyof PiiDetectionStatus>().toEqualTypeOf<
  'component' | 'state' | 'affectedStages' | 'since'
>();

export const statusWithTenant: PiiDetectionStatus = {
  component: 'pii_detection',
  state: 'AUTHORITATIVE',
  affectedStages: [],
  since: null,
  // @ts-expect-error status cannot carry tenant data
  tenantId: 'tenant-1',
};

// @ts-expect-error every operation must be classified
export const incompleteClassification: Readonly<Record<OperationClass, boolean>> = {
  PUBLIC_LEGAL_SEARCH: false,
  FREE_TEXT_ASK: true,
  FREE_TEXT_COMPARE: true,
  FREE_TEXT_COVERAGE: true,
  SAVED_RECORD_READ: false,
  EXISTING_ANSWER_READ: false,
};
