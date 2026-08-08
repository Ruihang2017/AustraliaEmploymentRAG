/** EVID-02 — the deterministic recogniser's barrel. See `src/contract/index.ts` for why leaf barrels. */
export { createDeterministicRecogniser, recogniseIn } from './recogniser.js';
export { ENTITY_RULES, candidatesIn, ruleByName } from './rules.js';
export type { RuleCandidate } from './rules.js';
export {
  ALLOWED_ENTITY_FORMS,
  CITATION_SHAPED,
  ORGANISATION_HEADS,
  citationSentences,
  isAllowedEntityForm,
  isFollowedByOrganisationHead,
  isInsideAnyRange,
} from './gazetteer.js';
export type { AllowedEntityGroup, ScanRange } from './gazetteer.js';
