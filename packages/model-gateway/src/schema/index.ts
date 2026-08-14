/**
 * EVID-07 — the public surface of the schema leaf.
 *
 * Explicit named re-exports, never `export *`, so `test/providers/public-surface.test.ts` can compare
 * the whole surface against a literal. See `src/profiles/index.ts` for why `src/index.ts` stays the
 * empty FND-01 skeleton entry and consumers deep-import this barrel.
 */
export {
  ANSWER_STATUS_VALUES,
  CITATION_ROLE_VALUES,
  CLAIM_SUPPORT_VALUES,
  ERROR_CODE_VALUES,
  errorHttpStatusByCode,
  isAnswerStatus,
  isCitationRole,
  isClaimSupport,
  isErrorCode,
} from './contracts.js';
export type { AnswerStatus, CitationRole, ClaimSupport, ErrorCode } from './contracts.js';

export type { SanitizationTransformation, SanitizedField, SanitizedPayload, SanitizedTaskFacts } from './sanitized.js';

export { CLAIM_KIND_VALUES, isClaimKind } from './kinds.js';
export type { ClaimKind } from './kinds.js';

export type { EvidenceItemInput, EvidencePackInput } from './pack.js';

export { INSTRUCTION_TEMPLATE_V1, INSTRUCTION_TEMPLATE_VERSION, buildProviderRequest } from './request.js';
export type {
  EvidenceSegment,
  InstructionSegment,
  ProviderRequestPayload,
  RequestIdentifiers,
  TaskFactSegment,
} from './request.js';

export { REASONING_FIELD_NAMES, isReasoningFieldName, parseModelResponse } from './response.js';
export type {
  ModelAssumption,
  ModelCitation,
  ModelClaim,
  ModelResponse,
  SchemaFailure,
  SchemaFailureCode,
  SchemaOk,
  SchemaResult,
} from './response.js';
