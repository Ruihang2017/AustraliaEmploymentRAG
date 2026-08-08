/**
 * EVID-02 deliverable 1 — the local entity-recognition port (PRD §37.2 stage 4).
 *
 * ONE PORT, TWO IMPLEMENTATIONS. `src/entity/deterministic/**` is the shipped default and needs no
 * model artifact; `src/entity/runtime/**` is the optional pinned-model form. Both satisfy this
 * interface, `EVID-03` consumes `readiness()`, and nothing downstream can tell which one it holds.
 *
 * `recognise` is structurally identical to `PiiStages['recogniseEntities']` (asserted in both
 * directions by `test/entity/types.test-d.ts`), so the port is the stage — not a thing a stage
 * adapter has to translate. The findings it returns are plain `EVID-01` `PiiFinding` values built
 * through `findingAt`, so sub-PRD D3 ("a finding never carries the detected value") is INHERITED
 * here rather than re-implemented and re-tested.
 *
 * `readiness()` NEVER DEFAULTS TO `READY`. A recogniser that could not load its artifact reports
 * `UNAVAILABLE` and appends nothing; what an operation does under that state is `EVID-03`'s decision
 * (sub-PRD D5), not this port's.
 */
import type { PiiFinding, PiiSeverity } from '../contract/finding.js';
import type { StageInput } from '../contract/pipeline.js';
import { deepFreeze } from '../contract/freeze.js';
import type { Span } from '../deterministic/normalise.js';

/**
 * `READY` — recognising. `DEGRADED` — loaded, but a call has failed since. `UNAVAILABLE` — not
 * loaded at all. There is no fourth state and no boolean: "is it working" has three honest answers.
 */
export type EntityReadiness = 'READY' | 'DEGRADED' | 'UNAVAILABLE';

/** Exactly `PiiStages['recogniseEntities']`. Appends findings; never removes one. */
export type EntityRecognise = (
  input: StageInput,
  findings: readonly PiiFinding[],
) => readonly PiiFinding[];

export interface EntityRecogniser {
  readonly recognise: EntityRecognise;
  readonly readiness: () => EntityReadiness;
}

/**
 * The rule vocabulary the deterministic recogniser and its tests share. Frozen, so a rule cannot be
 * renamed in one place and left stale in the other, and so `test/entity/rules.test.ts` can assert
 * every declared rule is exercised by at least one case.
 */
export const ENTITY_RULE_NAMES = deepFreeze([
  'HONORIFIC_NAME',
  'EMPLOYMENT_RELATION_NAME',
  'SIGNATURE_OR_GREETING_NAME',
  'ADJACENT_CONTACT_NAME',
  'POSSESSIVE_PERSONAL_MONONYM',
] as const);

export type EntityRuleName = (typeof ENTITY_RULE_NAMES)[number];

/** A candidate span, in NFC offsets over the field it was found in (`normalise.ts`'s offset space). */
export interface EntityCandidate {
  readonly rule: EntityRuleName;
  readonly span: Span;
}

/**
 * One named rule. `falsePositiveRisk` is REQUIRED, not a comment: deliverable 2 asks for every rule
 * to be *"documented with its false-positive risk"*, and a required field is documentation that
 * cannot be deleted by accident.
 */
export interface EntityRule {
  readonly name: EntityRuleName;
  readonly severity: PiiSeverity;
  readonly falsePositiveRisk: string;
}
