/**
 * Typed errors (ticket deliverable 6).
 *
 * The PRD §34.9 catalogue is CLOSED and it is not re-declared here: `errorCodes`,
 * `errorHttpStatusByCode` and `errorRetryableByCode` come from the generated core, so a code added to
 * `schemas/openapi/openapi.yaml` produces a new error class in this package with no edit to this file
 * (`test/errors.test.ts` asserts the class set is exactly the generated code set). `apps/api`'s
 * `errors/catalogue.ts` re-shapes the same three maps for the server side.
 *
 * ## Refusals are not errors
 *
 * PRD §34.9 closes with *"Domain answer statuses such as `INSUFFICIENT_EVIDENCE` are valid completed
 * research results and do not become HTTP errors"* (sub-PRD **D4**). Nothing in this file inspects an
 * `AnswerStatus`; a `200`/`202` never produces an `AerApiError`.
 *
 * ## What an error may carry (PRD §22, §21.1)
 *
 * The response body as received, the catalogue metadata, and the `request_id`. Never the credential,
 * never the request headers, never the request body, never a URL with a query string. `errors.ts`
 * receives no credential at all — `auth.ts` holds it in a closure — so the credential-leak property is
 * structural rather than a matter of remembering to redact.
 */
import type { ApiError, ErrorCode, ErrorResponse } from './internal/contracts.js';
import { errorCodes, errorHttpStatusByCode, errorRetryableByCode } from './internal/contracts.js';

/** Everything an `AerApiError` is constructed from. */
export interface AerApiErrorInit {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly requestId: string | null;
  readonly details: Readonly<Record<string, unknown>> | null;
  /** The response body exactly as received (parsed JSON, or the raw text when it was not JSON). */
  readonly body: unknown;
  /** Operator-facing message. Assembled from the code and the server's message only. */
  readonly message: string;
  /**
   * The server's `Retry-After`, already parsed and clamped, or `null`. PRD §38.5 requires a
   * rate-limit response to carry it, and deliverable 5 requires it to WIN over the computed backoff.
   * It rides on the error because that is the only object the retry loop sees.
   */
  readonly retryAfterMs?: number | null | undefined;
}

/** The base class of every error this SDK raises for a non-2xx `/v1` response. */
export class AerApiError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly requestId: string | null;
  readonly details: Readonly<Record<string, unknown>> | null;
  readonly body: unknown;
  readonly retryAfterMs: number | null;

  constructor(init: AerApiErrorInit) {
    super(init.message);
    this.name = 'AerApiError';
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.retryable = init.retryable;
    this.requestId = init.requestId;
    this.details = init.details;
    this.body = init.body;
    this.retryAfterMs = init.retryAfterMs ?? null;
  }
}

/** `true` when `value` is an `AerApiError` — the guard callers `switch` on. */
export function isAerApiError(value: unknown): value is AerApiError {
  return value instanceof AerApiError;
}

/** `INVALID_LEGAL_DATE` -> `InvalidLegalDateError`. */
export function errorClassName(code: ErrorCode): string {
  const pascal = code
    .split('_')
    .map((part) => (part.charAt(0) + part.slice(1).toLowerCase()).replace(/^./, (c) => c.toUpperCase()))
    .join('');
  return `${pascal}Error`;
}

/** The constructor shape every generated subclass shares. */
export type AerApiErrorClass = new (init: AerApiErrorInit) => AerApiError;

function buildErrorClasses(): Readonly<Record<ErrorCode, AerApiErrorClass>> {
  const classes: Partial<Record<ErrorCode, AerApiErrorClass>> = {};
  for (const code of errorCodes) {
    const name = errorClassName(code);
    const Subclass = class extends AerApiError {
      constructor(init: AerApiErrorInit) {
        super(init);
        this.name = name;
      }
    };
    Object.defineProperty(Subclass, 'name', { value: name, configurable: true });
    classes[code] = Subclass;
  }
  return Object.freeze(classes as Record<ErrorCode, AerApiErrorClass>);
}

/**
 * One class per PRD §34.9 code, keyed by the code — e.g. `errorClasses.IDEMPOTENCY_CONFLICT` is
 * `IdempotencyConflictError`.
 *
 * The set is BUILT from `errorCodes`, which is why it cannot drift from the document. That is also
 * why the classes are not seventeen static named exports: ESM named exports are static, so a
 * hand-written `export const IdempotencyConflictError = ...` line per code would reintroduce exactly
 * the edit-per-code the ticket forbids. `err instanceof errorClasses.IDEMPOTENCY_CONFLICT` and
 * `err.code === 'IDEMPOTENCY_CONFLICT'` are both supported; `err.name` is `IdempotencyConflictError`.
 */
export const errorClasses: Readonly<Record<ErrorCode, AerApiErrorClass>> = buildErrorClasses();

/** The class for a code. Typed against the generated `ErrorCode`, so a rename fails `pnpm typecheck`. */
export function errorClassFor(code: ErrorCode): AerApiErrorClass {
  return errorClasses[code];
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && (errorCodes as readonly string[]).includes(value);

/** The PRD §16.1 error envelope, if `body` is one. */
export function readErrorEnvelope(body: unknown): ApiError | null {
  if (!isRecord(body)) return null;
  const error = (body as Partial<ErrorResponse>).error;
  if (!isRecord(error)) return null;
  if (!isErrorCode(error['code'])) return null;
  return error as unknown as ApiError;
}

/**
 * Maps a non-2xx response to the typed error.
 *
 * `httpStatus` and `retryable` come from the CATALOGUE, not from the wire: a server that contradicts
 * its own document must not be able to talk this client into retrying something the document says is
 * terminal. When the body is not a recognisable envelope the result is an `INTERNAL_ERROR`-shaped
 * `AerApiError` carrying the raw text, truncated.
 */
export function toApiError(options: {
  readonly httpStatus: number;
  readonly body: unknown;
  readonly rawText: string | null;
  readonly headerRequestId: string | null;
  readonly retryAfterMs?: number | null | undefined;
}): AerApiError {
  const retryAfterMs = options.retryAfterMs ?? null;
  const envelope = readErrorEnvelope(options.body);
  if (envelope) {
    const code = envelope.code;
    const Ctor = errorClasses[code];
    return new Ctor({
      code,
      httpStatus: errorHttpStatusByCode[code],
      retryable: errorRetryableByCode[code],
      requestId: typeof envelope.request_id === 'string' ? envelope.request_id : options.headerRequestId,
      details: isRecord(envelope.details) ? envelope.details : null,
      body: options.body,
      message: `${code}: ${envelope.message}`,
      retryAfterMs,
    });
  }

  const code: ErrorCode = 'INTERNAL_ERROR';
  const Ctor = errorClasses[code];
  const excerpt = options.rawText === null ? '' : ` ${truncate(options.rawText, 200)}`;
  return new Ctor({
    code,
    httpStatus: options.httpStatus,
    retryable: errorRetryableByCode[code],
    requestId: options.headerRequestId,
    details: null,
    body: options.body ?? options.rawText,
    message: `INTERNAL_ERROR: HTTP ${options.httpStatus} with an unrecognised body.${excerpt}`,
    retryAfterMs,
  });
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

/**
 * A transport-level failure: DNS, TCP, TLS, an aborted socket, or an injected `fetch` that rejected.
 * Always retryable (ticket deliverable 5a). `cause` is the original rejection, unmodified.
 */
export class AerTransportError extends Error {
  readonly retryable = true;
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = 'AerTransportError';
  }
}

/**
 * `createAndWait` exceeded its `timeoutMs`. Carries the `jobId` so the caller RESUMES rather than
 * re-submits — re-submitting would create a second job and a second charge (ticket deliverable 8,
 * `ANS-003`).
 */
export class AerWaitTimeoutError extends Error {
  readonly jobId: string;
  constructor(jobId: string, timeoutMs: number) {
    super(`the answer job did not complete within ${timeoutMs} ms; resume it with its job id`);
    this.name = 'AerWaitTimeoutError';
    this.jobId = jobId;
  }
}

/**
 * A waited-on job reached `job.failed` or `job.cancelled`.
 *
 * This is a JOB outcome, not an HTTP error, so it is deliberately NOT an `AerApiError`: PRD §16.1
 * keeps the HTTP status and the domain state separate, and PRD §34.9 keeps domain answer statuses
 * (`INSUFFICIENT_EVIDENCE` and friends) out of the error catalogue entirely — a refusal still
 * resolves successfully (sub-PRD **D4**).
 */
export class AerJobFailedError extends Error {
  readonly jobId: string;
  readonly terminalEvent: 'job.failed' | 'job.cancelled';
  constructor(jobId: string, terminalEvent: 'job.failed' | 'job.cancelled') {
    super(`the answer job ended with ${terminalEvent}`);
    this.name = 'AerJobFailedError';
    this.jobId = jobId;
    this.terminalEvent = terminalEvent;
  }
}

/** A client-side precondition failure — thrown BEFORE any request is made (e.g. `page_size`). */
export class AerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AerValidationError';
  }
}

/**
 * The caller's `AbortSignal` fired. Never retried, and deliberately not an `AerTransportError`: an
 * abort is the caller's decision, not a failure to be recovered from (ticket deliverable 5).
 */
export class AerAbortedError extends Error {
  constructor(message = 'the operation was aborted by its AbortSignal') {
    super(message);
    this.name = 'AerAbortedError';
  }
}

/** A malformed, unknown or out-of-contract SSE frame (ticket deliverable 7). */
export class AerStreamError extends Error {
  readonly eventType: string | null;
  constructor(message: string, eventType: string | null = null) {
    super(message);
    this.name = 'AerStreamError';
    this.eventType = eventType;
  }
}
