/**
 * EVID-02 — PRD §37.2 stage 4: local entity recognition.
 *
 * See `src/contract/index.ts` for why this is a leaf barrel. Consumers deep-import
 * `packages/pii/src/entity/index.js`.
 */
export { ENTITY_RULE_NAMES } from './port.js';
export type {
  EntityCandidate,
  EntityReadiness,
  EntityRecognise,
  EntityRecogniser,
  EntityRule,
  EntityRuleName,
} from './port.js';

export {
  ALLOWED_ENTITY_FORMS,
  CITATION_SHAPED,
  ENTITY_RULES,
  ORGANISATION_HEADS,
  candidatesIn,
  citationSentences,
  createDeterministicRecogniser,
  isAllowedEntityForm,
  isFollowedByOrganisationHead,
  isInsideAnyRange,
  recogniseIn,
  ruleByName,
} from './deterministic/index.js';
export type { AllowedEntityGroup, RuleCandidate, ScanRange } from './deterministic/index.js';

export {
  ENTITY_ARTIFACT_PINS,
  MINIMUM_SCORE,
  PERSON_LABELS,
  createRuntimeRecogniser,
  loadPinnedArtifact,
  unavailable,
} from './runtime/index.js';
export type {
  ArtifactDigest,
  ArtifactPin,
  ArtifactSource,
  EntityModelPort,
  EntityModelSpan,
  LoadFailureReason,
  LoadOutcome,
} from './runtime/index.js';

export { buildEntityRecallReport } from './report.js';
export type {
  DetectedByStage,
  EntityCategoryReport,
  EntityCorpusRunner,
  EntityRecallReport,
  EntityRuntimeReport,
  EntityRunners,
} from './report.js';
