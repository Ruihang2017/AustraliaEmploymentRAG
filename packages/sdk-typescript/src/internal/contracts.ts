/**
 * THE ONE IMPORT BOUNDARY OF THIS PACKAGE.
 *
 * `packages/sdk-typescript` wraps `packages/contracts`' OpenAPI-generated core (PRD §8.10, sub-PRD
 * **D1**). Every generated type, every generated `const` map and `FND-05`'s webhook verifier reaches
 * the rest of this package through this file and through no other. `test/contracts-boundary.test.ts`
 * asserts that mechanically: no other file under `src/**` may name a path outside the package.
 *
 * ## Why a RELATIVE deep import and not `@taxrag/contracts`
 *
 * The ticket's deliverable 1 asks for "a workspace dependency on `packages/contracts`". Under the
 * merged repository rules that dependency cannot be spelled: pnpm links a workspace member only
 * through the `workspace:` protocol, and `tools/tests/skeleton.test.mjs` ("pins every member
 * dependency to an exact version") rejects `workspace:*` as an unpinned specifier — with a positive
 * control, so the rule cannot be read as accidental. The bare specifier `@taxrag/contracts` maps, via
 * `tsconfig.base.json#paths`, at `packages/contracts/src/index.ts`, which
 * `tools/workspace-assertions.mjs#assertEntryFilesEmpty` requires to stay byte-exactly `export {};`.
 *
 * Every merged consumer of `packages/contracts` resolved this the same way, and each documents it:
 * `apps/api/src/errors/catalogue.ts`, `packages/domain/src/budget/contracts.ts`,
 * `packages/domain/src/legal/contracts.ts`, `packages/database/src/migrate/contracts.ts`. This file
 * follows that merged convention. It is recorded as a deviation from deliverable 1's wording and
 * raised as the plan's **OQ-1**; when a `00-foundation` repair ticket makes a workspace-internal
 * dependency expressible, switching this package over is a one-file change.
 *
 * Nothing is re-declared here. Every name below is a re-export.
 */

export {
  apiBasePath,
  errorCodes,
  errorHttpStatusByCode,
  errorRetryableByCode,
  operations,
} from '../../../contracts/src/generated/index.js';

export type {
  AnswerFacts,
  AnswerJobAccepted,
  AnswerJobClarificationRequired,
  AnswerSnapshot,
  AnswerStatus,
  ApiError,
  ApiErrorResponse,
  ApiPath,
  AsyncState,
  Citation,
  Claim,
  Clarification,
  CollectionResponse,
  CreateAnswerJobRequest,
  Cursor,
  ErrorCode,
  ErrorResponse,
  HttpMethod,
  JobAcceptedResponse,
  JobDescriptor,
  OpaqueId,
  OperationId,
  ResponseEnvelope,
  SearchRequest,
  SearchResponse,
  SearchResult,
  Timestamp,
} from '../../../contracts/src/generated/index.js';

export { SCHEMA_VERSION, SSE_EVENT_TYPES, WEBHOOK_EVENT_TYPES, verifyWebhook } from '../../../contracts/src/events/index.js';

export type {
  AlertCreatedEvent,
  AnswerSectionSseEvent,
  CitationAddedSseEvent,
  ClarificationRequiredSseEvent,
  HeartbeatSseEvent,
  JobCancelledSseEvent,
  JobCompletedSseEvent,
  JobFailedSseEvent,
  JobStartedSseEvent,
  SseEventTypeName,
  StageChangedSseEvent,
  VerifyReason,
  VerifyResult,
  VerifyWebhookInput,
  WebhookEventEnvelope,
  WebhookEventTypeName,
  WebhookSecret,
} from '../../../contracts/src/events/index.js';

/**
 * PRD §34.1 requires idempotency keys and resource ids to be UUIDv7. `FND-04`'s `createUuidV7` is the
 * repository's one generator (RFC 9562 §5.7 plus the §6.2 monotonic counter); this package never
 * writes a second one, and never uses a v7 uuid as a credential — see that module's
 * "NOT A SECURITY TOKEN" note.
 */
export { UUID_V7_PATTERN, createUuidV7, isUuidV7, uuidv7 } from '../../../contracts/src/ids/index.js';
