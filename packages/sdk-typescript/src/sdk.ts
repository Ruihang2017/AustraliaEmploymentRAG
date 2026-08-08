/**
 * THE PUBLIC BARREL of `@taxrag/sdk-typescript`.
 *
 * Not `src/index.ts`: `tools/workspace-assertions.mjs#assertEntryFilesEmpty` requires every workspace
 * member's `src/index.ts` to stay byte-exactly `export {};`, and `tools/tests/skeleton.test.mjs`
 * enforces it on every branch. `packages/contracts` solved the same problem the same way, by
 * publishing `src/events/index.ts` as its barrel. The package `exports` map points at the built
 * `dist/esm/sdk.js`, so an installed consumer never sees this detail.
 *
 * Every runtime name below is recorded in `parity/surface.json` (sub-PRD **D3**), and
 * `test/parity.test.ts` asserts the two are equal in both directions — adding an export without a
 * manifest entry fails the suite, and so does a manifest entry with no export.
 */

export { createAerClient, DEFAULT_TIMEOUT_MS } from './client.js';
export type { AerClient, AerClientOptions } from './client.js';

export type { CallOptions, Caller, OperationCallOptions } from './call.js';

export type { AerAuth } from './auth.js';

export {
  AerAbortedError,
  AerApiError,
  AerJobFailedError,
  AerStreamError,
  AerTransportError,
  AerValidationError,
  AerWaitTimeoutError,
  errorClassFor,
  errorClassName,
  errorClasses,
  isAerApiError,
} from './errors.js';
export type { AerApiErrorClass, AerApiErrorInit } from './errors.js';

export { verifyWebhookSignature } from './webhooks.js';
export type { VerifyReason, VerifyResult, VerifyWebhookSignatureInput, WebhookSecret } from './webhooks.js';

export { TELEMETRY_ALLOWED_KEYS, assertTelemetrySafe } from './telemetry.js';
export type { TelemetryOptions, TelemetryRecord } from './telemetry.js';

export {
  DEFAULT_RETRY_OPTIONS,
  backoffDelayMs,
  isRetryableError,
  parseRetryAfter,
} from './retry.js';
export type { RetryDeps, RetryOptions } from './retry.js';

export {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  assertIdempotencyKey,
} from './idempotency.js';

export { RETRYABLE_WRITE_OPERATION_IDS } from './internal/retryable-writes.js';

export {
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  PAGE_SIZE_MIN,
  assertPageSize,
} from './pagination.js';
export type { ListParams, Page, Paginator } from './pagination.js';

export { isCollectionRoot, isInternalPath, publicOperationIds } from './resources.js';
export type { ListInvoker, OperationInvoker, ResourceGroup } from './resources.js';

export { isClarificationRequired } from './answers.js';
export type {
  AnswerJobsApi,
  AnswersApi,
  CreateAndWaitOptions,
  CreateAndWaitResult,
  CreateAnswerJobResult,
} from './answers.js';

export {
  TERMINAL_SSE_EVENT_TYPES,
  isSseEventType,
  isTerminalSseEvent,
} from './sse/events.js';
export type { AerStreamEvent, SsePayload } from './sse/events.js';

export { assertNotProvisional, createStreamAccumulator } from './sse/accumulator.js';
export type { AccumulatedCitation, AccumulatedSection, StreamAccumulator } from './sse/accumulator.js';

export type { StreamOptions } from './sse/stream.js';

export { SDK_NAME, SDK_VERSION } from './version.js';

export type {
  AerFetch,
  AerRequestInit,
  AerResponse,
  AerResponseHeaders,
  AerStreamReader,
} from './http.js';
export type { AerAbortSignal } from './internal/runtime.js';

/**
 * Re-exported from the generated core so a consumer never has to reach into `packages/contracts`
 * itself. These are the SAME objects: this package declares no copy (sub-PRD **D1**).
 */
export {
  SCHEMA_VERSION,
  SSE_EVENT_TYPES,
  WEBHOOK_EVENT_TYPES,
  apiBasePath,
  errorCodes,
  errorHttpStatusByCode,
  errorRetryableByCode,
  operations,
} from './internal/contracts.js';
export type {
  AnswerJobAccepted,
  AnswerJobClarificationRequired,
  AnswerSnapshot,
  AnswerStatus,
  CollectionResponse,
  CreateAnswerJobRequest,
  Cursor,
  ErrorCode,
  ErrorResponse,
  JobAcceptedResponse,
  OperationId,
  SearchRequest,
  SearchResponse,
  SseEventTypeName,
  WebhookEventEnvelope,
} from './internal/contracts.js';
