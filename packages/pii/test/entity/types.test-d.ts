/**
 * EVID-02 acceptance items 7 and 9 (the type-level halves).
 *
 * Compiled by `tsc` through `pnpm typecheck` — see `test/context/types.test-d.ts` for why not
 * `vitest --typecheck`.
 *
 * Three properties:
 *
 * 1. the recogniser port IS `PiiStages['recogniseEntities']`, in both directions, so stage 4 cannot
 *    quietly grow a parameter (a confidence threshold, an override, a role) that the pipeline would
 *    have to supply;
 * 2. an entity or combination finding is the `EVID-01` `PiiFinding` and nothing else — the exhaustive
 *    `keyof` assertion is re-stated here so a value-carrying member added for this ticket's path is
 *    caught by this ticket's own gate (sub-PRD D3);
 * 3. `readiness()` has exactly three states, and the artifact pin has no field for a URL, a mirror
 *    or an "allow unverified" flag (PRD §21.1).
 */
import { expectTypeOf } from 'vitest';

import type { PiiFinding } from '../../src/contract/finding.js';
import type { PiiStages } from '../../src/contract/pipeline.js';
import type { EntityReadiness, EntityRecogniser } from '../../src/entity/port.js';
import type { ArtifactPin } from '../../src/entity/runtime/pin.js';
import type { LoadOutcome } from '../../src/entity/runtime/loader.js';
import { createDeterministicRecogniser } from '../../src/entity/deterministic/recogniser.js';
import { createPiiStages } from '../../src/context/stages.js';

// --- 1: the port is the stage ------------------------------------------------------------------

expectTypeOf<EntityRecogniser['recognise']>().toEqualTypeOf<PiiStages['recogniseEntities']>();

const recogniser = createDeterministicRecogniser();
expectTypeOf(recogniser.recognise).toMatchTypeOf<PiiStages['recogniseEntities']>();

// A recogniser cannot take a confidence threshold the pipeline would have to supply: the port's
// parameter list is fixed by `PiiStages['recogniseEntities']`, so a third parameter is `any` here
// and the assignment above is what actually pins the shape.
expectTypeOf<Parameters<EntityRecogniser['recognise']>['length']>().toEqualTypeOf<2>();

// --- 2: a finding still carries no value -------------------------------------------------------

expectTypeOf<keyof PiiFinding>().toEqualTypeOf<
  'field' | 'start' | 'end' | 'category' | 'severity' | 'suggestedPlaceholder'
>();

const ENTITY_FINDING_BASE = {
  field: 'question',
  start: 0,
  end: 1,
  category: 'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME',
  severity: 'BLOCKING',
  suggestedPlaceholder: 'Employee A',
} as const;

export const entityFindingWithValue: PiiFinding = {
  ...ENTITY_FINDING_BASE,
  // @ts-expect-error an entity finding cannot carry the matched text
  value: 'Marta Kowalski',
};

export const entityFindingWithScore: PiiFinding = {
  ...ENTITY_FINDING_BASE,
  // @ts-expect-error and it cannot carry a model score either — a score is not a finding
  score: 0.99,
};

export const entityFindingWithRule: PiiFinding = {
  ...ENTITY_FINDING_BASE,
  // @ts-expect-error nor the rule that fired, which would leak the reason as free text
  rule: 'HONORIFIC_NAME',
};

// --- 3: readiness and the pin ------------------------------------------------------------------

expectTypeOf<EntityReadiness>().toEqualTypeOf<'READY' | 'DEGRADED' | 'UNAVAILABLE'>();

expectTypeOf<keyof ArtifactPin>().toEqualTypeOf<
  'id' | 'version' | 'digestAlgorithm' | 'digest' | 'sizeBytes' | 'licence'
>();

const PIN_BASE = {
  id: 'x',
  version: '1',
  digestAlgorithm: 'sha256',
  digest: 'aa',
  sizeBytes: 1,
  licence: 'MIT',
} as const;

export const pinWithUrl: ArtifactPin = {
  ...PIN_BASE,
  // @ts-expect-error PRD §21.1: an artifact is pinned and verified, never downloaded from a URL
  url: 'https://example.invalid/model.onnx',
};

export const pinWithBypass: ArtifactPin = {
  ...PIN_BASE,
  // @ts-expect-error and there is no way to spell "load it anyway"
  allowUnverified: true,
};

/** An `UNAVAILABLE` outcome has no `bytes` member — refusal cannot hand the artifact over. */
expectTypeOf<Extract<LoadOutcome, { state: 'UNAVAILABLE' }>>().toEqualTypeOf<{
  readonly state: 'UNAVAILABLE';
  readonly reason: 'ARTIFACT_ABSENT' | 'SIZE_MISMATCH' | 'DIGEST_MISMATCH' | 'READ_FAILED';
}>();

// --- the stage factory's only option is the recogniser ------------------------------------------

expectTypeOf(createPiiStages).returns.toEqualTypeOf<PiiStages>();

// @ts-expect-error there is no environment switch, and no "disable the PII stage" option
export const stagesWithSwitch = createPiiStages({ enabled: false });
