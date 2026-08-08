/** EVID-02 — the optional pinned-model runtime's barrel. Nothing here is reachable from `PII_STAGES`. */
export { ENTITY_ARTIFACT_PINS } from './pin.js';
export type { ArtifactPin } from './pin.js';
export { loadPinnedArtifact, unavailable } from './loader.js';
export type { ArtifactDigest, ArtifactSource, LoadFailureReason, LoadOutcome } from './loader.js';
export { MINIMUM_SCORE, PERSON_LABELS, createRuntimeRecogniser } from './recogniser.js';
export type { EntityModelPort, EntityModelSpan } from './recogniser.js';
