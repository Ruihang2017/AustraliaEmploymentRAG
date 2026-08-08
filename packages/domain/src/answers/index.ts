/**
 * FND-07 — the public surface of `packages/domain/src/answers` (PRD §8.4, §9.1, §15.5, §36.8).
 *
 * Explicit export lists, no `export *`, so the whole public API is reviewable in one file.
 *
 * `packages/domain/src/index.ts` is deliberately NOT wired here: it is outside this ticket's
 * file-scope and four sibling wave-3 tickets would each want the same edit (sub-PRD D16 makes only
 * `package.json` append-only shared). Consumers — `EVID-04` first — deep-import
 * `packages/domain/src/answers/index.js` until a follow-up ticket owns the package barrel.
 */
export { deepFreeze } from './deep-freeze.js';

export {
  CONDITION_BY_STATUS,
  DERIVED_CONDITIONS,
  MATERIAL_CLAIMS_UNSUPPORTED,
  NON_STATUS_OUTCOMES,
  REFUSAL_TABLE,
  STATUS_PRECEDENCE,
} from './refusal-table.js';
export type {
  DerivedCondition,
  JobUnavailableOutcome,
  NonStatusOutcome,
  PreAdmissionOutcome,
  RefusalOutcome,
  RefusalTableRow,
} from './refusal-table.js';

export { decideAnswerStatus, statusOfCondition } from './decide-answer-status.js';

export { classifyClaimSupport, isDefinitiveClaim } from './claim-support.js';

export { guidanceCannotOverride } from './guidance.js';
export type { Violation } from './guidance.js';

export {
  CONFIDENCE_WINDOW,
  MAX_MATCH_TEXT,
  containsProhibitedCertainty,
} from './prohibited-language.js';
export type { ProhibitedMatch } from './prohibited-language.js';

export { ANSWER_SECTION_ORDER, SHORT_ANSWER_VALUES } from './answer-structure.js';
export type { AnswerSection } from './answer-structure.js';

export type { AuthorityComparator } from './ports.js';

export type {
  AnswerDecision,
  AnswerSignals,
  AnswerStatus,
  AuthorityLevel,
  Citation,
  CitationRole,
  Claim,
  ClaimSupport,
  RefusalConditionName,
  ShortAnswerValue,
} from './types.js';
