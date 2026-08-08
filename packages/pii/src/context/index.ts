/**
 * EVID-02 — PRD §37.2 stages 5 and 6, plus the assembled `PiiStages`.
 *
 * See `src/contract/index.ts` for why this is a leaf barrel and `src/index.ts` stays `export {};`:
 * `tools/workspace-assertions.mjs#assertEntryFilesEmpty` requires every pnpm member's entry file to
 * be byte-exactly `export {};`. Consumers deep-import `packages/pii/src/context/index.js`.
 */
export {
  SUPPRESSIBLE_CATEGORIES,
  applyPublicEntityRules,
  isExplainedByStructuredChannel,
} from './publicEntity.js';

export { NECESSARY_FACT_RULES, NECESSARY_FACT_RULE_NAMES, isNecessaryFactSpan, necessaryFactSpans } from './necessaryFacts.js';
export type { NecessaryFactRule, NecessaryFactRuleName, NecessaryFactSpan } from './necessaryFacts.js';

export { COMBINATION_DIMENSION_NAMES, DIMENSION_RULES, detectDimensions } from './dimensions.js';
export type { CombinationDimensionName, DimensionHit } from './dimensions.js';

export { COMBINATION_RULE_V1, applyCombinationRules, evaluateCombination } from './combination.js';
export type { CombinationAssessment } from './combination.js';

export { DEFAULT_ENTITY_RECOGNISER, PII_STAGES, createPiiStages } from './stages.js';
export type { PiiStageOptions } from './stages.js';
