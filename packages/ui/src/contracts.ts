/**
 * The ONE import boundary of `@taxrag/ui`.
 *
 * WHY RELATIVE DEEP IMPORTS. `packages/contracts/src/index.ts` is still the empty workspace entry
 * file `FND-01` created (`export {};`), and `tsconfig.base.json#paths` maps `@taxrag/contracts` at
 * exactly that file, so the bare specifier resolves to nothing. Every merged consumer solves this the
 * same way — one file per package holding relative deep imports into the contracts barrels
 * (`packages/observability/src/contracts.ts`, the per-area `contracts.ts` files under
 * `packages/domain`, `packages/database/src/migrate/contracts.ts`,
 * `packages/sdk-typescript/src/internal/contracts.ts`, `apps/api/src/errors/catalogue.ts`). When the
 * entry file becomes the real barrel, this is a one-file change.
 *
 * A source scan (`test/source-scan.test.ts`) asserts that no other file under `src` names a path
 * outside this package, so this boundary cannot quietly spread.
 *
 * This package declares NO controlled value of its own (ticket Non-goals; PRD §35.1 makes
 * `packages/contracts` the single generated source). Everything below is a re-export.
 */

export {
  ASYNC_STATE_VALUES,
  AUTHORITY_LEVEL_VALUES,
  CITATION_ROLE_VALUES,
  CLAIM_SUPPORT_VALUES,
  COVERAGE_CANDIDATE_STATUS_VALUES,
  LEGAL_STATUS_VALUES,
  isAsyncState,
  isAuthorityLevel,
  isCitationRole,
  isClaimSupport,
  isCoverageCandidateStatus,
  isLegalStatus,
} from '../../contracts/src/enums/index.js';

export type {
  AsyncState,
  AuthorityLevel,
  CitationRole,
  ClaimSupport,
  CoverageCandidateStatus,
  LegalStatus,
} from '../../contracts/src/enums/index.js';

export type {
  AnswerSnapshot,
  AuthorityRef,
  Citation,
  Claim,
  CoverageCandidateSummary,
  JurisdictionCode,
  LegalDate,
  OpaqueId,
  SearchResult,
  Timestamp,
} from '../../contracts/src/generated/index.js';

import type { AsyncState } from '../../contracts/src/enums/index.js';

/**
 * The job lifecycle state a screen renders.
 *
 * An ALIAS, not a declaration: `ASYNC_STATE_VALUES` already carries the exact ten PRD §31.3 members
 * in PRD order, so ticket Deliverable 2's "otherwise it is declared here and the divergence is
 * written back" branch is not taken and no writeback is owed on this point.
 */
export type JobUiState = AsyncState;
