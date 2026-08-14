/**
 * EVID-07 — the ONE file in `src/**` that names `packages/contracts`.
 *
 * `packages/contracts` (FND-03/FND-04) already owns this vocabulary and this package consumes it,
 * never redeclares it: `GENERATION_UNAVAILABLE` and its 503 status, the answer statuses, the claim
 * supports and the citation roles. Redeclaring any of them would let the gateway and the API drift.
 *
 * WHY A RELATIVE SPECIFIER rather than `@taxrag/contracts`: there are no `node_modules/@taxrag/*`
 * links in this workspace, so a bare specifier resolves to nothing at runtime and to the empty
 * skeleton entry at type level; and a `workspace:*` dependency is rejected outright by
 * `tools/tests/skeleton.test.mjs`. A single boundary file re-exporting with a relative specifier is
 * the established device — `packages/domain/src/budget/contracts.ts` does exactly this, with the same
 * "only this file may escape the leaf" guard.
 *
 * `test/providers/architecture.test.ts` asserts this file and `sanitized.ts` are the only two in
 * `src/**` that leave the package, and that they leave only towards `packages/contracts/src` and
 * `packages/pii/src`.
 */
export {
  ANSWER_STATUS_VALUES,
  CITATION_ROLE_VALUES,
  CLAIM_SUPPORT_VALUES,
  ERROR_CODE_VALUES,
  isAnswerStatus,
  isCitationRole,
  isClaimSupport,
  isErrorCode,
} from '../../../contracts/src/enums/index.js';

export type {
  AnswerStatus,
  CitationRole,
  ClaimSupport,
  ErrorCode,
} from '../../../contracts/src/enums/index.js';

export { errorHttpStatusByCode } from '../../../contracts/src/generated/errors.js';
