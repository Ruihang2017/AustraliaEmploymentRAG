/**
 * `ApiError` — the only error type an `apps/api` call site throws deliberately (ticket deliverable 6).
 *
 * `status` and `retryable` are READ from `ERROR_CATALOGUE`, never passed in: PRD §34.9 fixes them
 * per code, so a call site cannot pick a different status for the same code.
 *
 * The 17 factories below exist so a call site never hand-writes a code string. Each is individually
 * named and individually typed — a `Record<string, Function>` lookup would defeat the point.
 */
import type { ApiErrorCode, ErrorCatalogueRow } from './catalogue.js';
import { catalogueRow } from './catalogue.js';

/** `details` values are serialised straight into the PRD §16.1 body: never put a submitted value here. */
export type ApiErrorDetails = Readonly<Record<string, unknown>>;

const EMPTY_DETAILS: ApiErrorDetails = Object.freeze({});

export class ApiError extends Error {
  /** The PRD §34.9 code. */
  readonly code: ApiErrorCode;
  /** The HTTP status PRD §34.9 assigns `code`. */
  readonly status: number;
  /** The PRD §34.9 Retry column for `code`. */
  readonly retryable: boolean;
  /** Structured, non-sensitive context. Always an object; `{}` when there is none. */
  readonly details: ApiErrorDetails;

  constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    const row: ErrorCatalogueRow = catalogueRow(code);
    this.code = code;
    this.status = row.status;
    this.retryable = row.retryable;
    this.details = details === undefined ? EMPTY_DETAILS : Object.freeze({ ...details });
  }
}

/** Whether `value` is an `ApiError`, without relying on `instanceof` across module realms. */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

// --- Factories, one per PRD §34.9 code -----------------------------------------------------------
// Default messages are generic and safe to return to a client. A caller may override the message,
// but must never place a submitted value in it (PRD §37.2).

export function invalidRequest(
  message = 'The request is not valid.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('INVALID_REQUEST', message, details);
}

export function invalidLegalDate(
  message = 'The requested legal date is not valid.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('INVALID_LEGAL_DATE', message, details);
}

export function invalidAbn(
  message = 'The supplied ABN is not valid.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('INVALID_ABN', message, details);
}

export function authenticationRequired(
  message = 'Authentication is required.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('AUTHENTICATION_REQUIRED', message, details);
}

export function mfaRequired(
  message = 'Multi-factor authentication is required.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('MFA_REQUIRED', message, details);
}

export function recentAuthRequired(
  message = 'A recent authentication is required.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('RECENT_AUTH_REQUIRED', message, details);
}

export function resourceNotFound(
  message = 'The requested resource does not exist.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('RESOURCE_NOT_FOUND', message, details);
}

export function idempotencyConflict(
  message = 'The idempotency key was reused with a different request.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('IDEMPOTENCY_CONFLICT', message, details);
}

export function concurrentModification(
  message = 'The resource changed while the request was in flight.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('CONCURRENT_MODIFICATION', message, details);
}

export function ephemeralContentExpired(
  message = 'The requested content has expired.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('EPHEMERAL_CONTENT_EXPIRED', message, details);
}

export function employeePiiDetected(
  message = 'The request contains employee personal information.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('EMPLOYEE_PII_DETECTED', message, details);
}

export function rateLimited(
  message = 'The request rate limit has been reached.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('RATE_LIMITED', message, details);
}

export function creditLimitReached(
  message = 'The credit limit has been reached.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('CREDIT_LIMIT_REACHED', message, details);
}

export function generationUnavailable(
  message = 'Answer generation is temporarily unavailable.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('GENERATION_UNAVAILABLE', message, details);
}

export function sourceNotCurrent(
  message = 'The underlying sources are not current.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('SOURCE_NOT_CURRENT', message, details);
}

export function corpusIncompatible(
  message = 'The corpus release is not compatible with this request.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('CORPUS_INCOMPATIBLE', message, details);
}

export function internalError(
  message = 'An unexpected error occurred.',
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('INTERNAL_ERROR', message, details);
}

/**
 * Every factory, keyed by the code it produces. Exported ONLY so the table-driven catalogue test can
 * prove each of the 17 codes is reachable through a named factory; call sites use the named export.
 */
export const apiErrorFactories: Readonly<
  Record<ApiErrorCode, (message?: string, details?: Record<string, unknown>) => ApiError>
> = Object.freeze({
  AUTHENTICATION_REQUIRED: authenticationRequired,
  CONCURRENT_MODIFICATION: concurrentModification,
  CORPUS_INCOMPATIBLE: corpusIncompatible,
  CREDIT_LIMIT_REACHED: creditLimitReached,
  EMPLOYEE_PII_DETECTED: employeePiiDetected,
  EPHEMERAL_CONTENT_EXPIRED: ephemeralContentExpired,
  GENERATION_UNAVAILABLE: generationUnavailable,
  IDEMPOTENCY_CONFLICT: idempotencyConflict,
  INTERNAL_ERROR: internalError,
  INVALID_ABN: invalidAbn,
  INVALID_LEGAL_DATE: invalidLegalDate,
  INVALID_REQUEST: invalidRequest,
  MFA_REQUIRED: mfaRequired,
  RATE_LIMITED: rateLimited,
  RECENT_AUTH_REQUIRED: recentAuthRequired,
  RESOURCE_NOT_FOUND: resourceNotFound,
  SOURCE_NOT_CURRENT: sourceNotCurrent,
});
