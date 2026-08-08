/**
 * Which operations carry an `Idempotency-Key` (ticket deliverable 4; PRD §8.10, §34.1).
 *
 * `schemas/openapi/openapi.yaml` marks them with `x-retryable-write: true`, and
 * `packages/contracts/src/openapi/conventions.mjs` enforces the three-way equivalence
 * `x-retryable-write: true` ⟺ `$ref IdempotencyKeyHeader` ⟺ declares `IDEMPOTENCY_CONFLICT`.
 *
 * The RUNTIME generated map (`operations`) carries only `{ method, path }`, so the flag is not
 * readable at runtime today. Until `FND-04` emits it (plan **OQ-2**, a docs PR against `FND-04`
 * deliverable 6), the set is projected here through the equivalence's third arm — and
 * `test/retryable-writes.test.ts` RE-DERIVES it from `packages/contracts/src/generated/operations.ts`
 * and asserts set equality plus the count, so a document change that adds or removes a retryable
 * write fails loudly instead of silently mis-sending (or silently omitting) the header.
 *
 * `OperationId` is the generated union, so a renamed operation fails `pnpm typecheck` here first.
 *
 * NOTE `cancelAnswerJob` is deliberately absent: the document marks it `x-retryable-write: false` and
 * declares no `Idempotency-Key` header for it. Cancel is naturally idempotent and must not carry one.
 */
import type { OperationId } from './contracts.js';

const IDS: readonly OperationId[] = [
  'createAnswerJob',
  'createComment',
  'createComparisonJob',
  'createCoverageAssessmentJob',
  'createExportJob',
  'createInvitation',
  'createIssue',
  'createIssueComment',
  'createResearchRecord',
  'createResearchRecordReviewAction',
  'createResearchRecordTurn',
  'createServiceAccount',
  'createServiceAccountCredential',
  'createSsoConnection',
  'createWatchlist',
  'createWebhookSubscription',
  'regenerateRecoveryCodes',
  'rerunAnswer',
  'rotateServiceAccountCredential',
  'rotateWebhookSubscriptionSigningMaterial',
  'submitAnswerJobClarifications',
  'testWebhookSubscription',
];

/** Every operation the OpenAPI document marks a retryable write. */
export const RETRYABLE_WRITE_OPERATION_IDS: ReadonlySet<OperationId> = new Set(IDS);

/** The count PRD §34.1's retryable-write projection has today. A change must fail a test, loudly. */
export const RETRYABLE_WRITE_COUNT = 22;
