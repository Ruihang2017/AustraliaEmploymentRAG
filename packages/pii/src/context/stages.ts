/**
 * EVID-02 deliverable 8 — the real `PiiStages`, replacing `CONSERVATIVE_STAGE_DEFAULTS`.
 *
 * IT ADDS NO ORDERING OF ITS OWN. `admit` in `src/contract/pipeline.ts` owns the PRD §37.2 order and
 * is untouched by this ticket; this file only supplies the three implementations it calls. Callers
 * pass `PII_STAGES` where they used to pass `CONSERVATIVE_STAGE_DEFAULTS`.
 *
 * THE MODEL RUNTIME IS OFF BY DEFAULT, WITHOUT AN ENVIRONMENT READ. `createPiiStages()` defaults to
 * the deterministic recogniser, and `PII_STAGES` — the frozen process-wide default — never holds a
 * model. Whoever wants one passes one. There is no switch, so there is nothing to leave on by
 * mistake and nothing for the determinism acceptance item to except.
 */
import type { PiiStages } from '../contract/pipeline.js';
import { deepFreeze } from '../contract/freeze.js';
import type { EntityRecogniser } from '../entity/port.js';
import { createDeterministicRecogniser } from '../entity/deterministic/recogniser.js';
import { applyCombinationRules } from './combination.js';
import { applyPublicEntityRules } from './publicEntity.js';

export interface PiiStageOptions {
  /** Defaults to the rule/gazetteer recogniser, which needs no artifact (ADR 0001). */
  readonly recogniser?: EntityRecogniser;
}

/** The recogniser `PII_STAGES` holds. Exported so `EVID-03` can read its `readiness()`. */
export const DEFAULT_ENTITY_RECOGNISER: EntityRecogniser = createDeterministicRecogniser();

/**
 * STAGE 4 CANNOT REMOVE A FINDING, WHOEVER WROTE THE RECOGNISER.
 *
 * `EntityRecogniser['recognise']` returns the whole finding list, so a careless — or hostile —
 * implementation could return a SHORTER one and quietly clear a deterministic block. PRD §10.1's
 * *"MUST combine"* and PRD §37.2's *"exactly one stage may remove a finding"* are then a convention
 * rather than a property. This wrapper makes them a property: whatever the recogniser returns, the
 * findings it was given come back, and only its genuinely new ones are appended.
 */
function appendOnly(recogniser: EntityRecogniser): PiiStages['recogniseEntities'] {
  return (input, findings) => {
    const produced = recogniser.recognise(input, findings);
    const added = produced.filter((finding) => !findings.includes(finding));
    return added.length === 0 ? findings : [...findings, ...added];
  };
}

export function createPiiStages(options: PiiStageOptions = {}): PiiStages {
  const recogniser = options.recogniser ?? DEFAULT_ENTITY_RECOGNISER;
  return {
    recogniseEntities: appendOnly(recogniser),
    applyPublicEntityRules,
    applyCombinationRules,
  };
}

/**
 * The process-wide default. Deep-frozen because it is read concurrently by every in-flight request
 * in `apps/api`, and a shallow freeze would leave a nested value mutable for the process lifetime.
 */
export const PII_STAGES: PiiStages = deepFreeze(createPiiStages());
