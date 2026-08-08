/**
 * The single `setErrorHandler` + `setNotFoundHandler` pair (ticket deliverable 7).
 *
 * Every failure leaves the process as exactly the PRD §16.1 body and nothing else:
 *
 * ```json
 * { "error": { "code": "...", "message": "...", "request_id": "req_...", "details": {}, "retryable": false } }
 * ```
 *
 * Two rules govern what may appear in that body, and both are asserted in `test/errors.test.ts`:
 *
 * 1. **An unmapped error never leaks.** Its message, stack, file paths, SQL and provider text go to
 *    the injected logger only; the client gets a fixed generic `500 INTERNAL_ERROR` (PRD §22).
 * 2. **A validation failure names fields, never values.** PRD §37.2 — "never echoes the detected
 *    value". `details.fields` carries sanitised field NAMES; `error.message` from Fastify (which
 *    quotes submitted content) is never used.
 */
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { ApiErrorCode } from './catalogue.js';
import { catalogueRow } from './catalogue.js';
import { ApiError } from './api-error.js';

/** The narrow logging seam this layer needs. `RUNT-07`'s logger satisfies it; the default is silent. */
export interface ErrorLogger {
  error(details: Record<string, unknown>, message: string): void;
}

/** A logger that discards everything. The default until `RUNT-08` wires `packages/observability`. */
export const silentErrorLogger: ErrorLogger = {
  error() {
    /* intentionally silent */
  },
};

/** The PRD §16.1 error body. `details` is always present, `{}` when empty. */
export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly request_id: string;
    readonly details: Record<string, unknown>;
    readonly retryable: boolean;
  };
}

/** The fixed message an unmapped error becomes. Deliberately says nothing about the cause. */
export const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred.';
/** The fixed message a schema-validation failure becomes. Deliberately quotes nothing submitted. */
export const VALIDATION_ERROR_MESSAGE = 'The request body, query or parameters failed validation.';
/** The fixed message every not-found becomes — identical for "no such route" and "not yours". */
export const NOT_FOUND_MESSAGE = 'The requested resource does not exist.';

/** At most this many field names appear in `details.fields`; the input list is caller-controlled. */
const MAX_REPORTED_FIELDS = 20;
/** A reported field name is truncated to this many characters. */
const MAX_FIELD_NAME_LENGTH = 64;
/** Everything outside this class is dropped from a reported field name. */
const FIELD_NAME_ALLOWED = /[^A-Za-z0-9_.\-/[\]]/g;

/**
 * Reduces a caller-controlled field name to something safe to echo.
 *
 * `params.additionalProperty` is a key the CALLER chose: it can carry PII, a credential or CRLF.
 * Sanitising the charset and truncating is what makes echoing the NAME acceptable at all.
 */
export function sanitiseFieldName(name: string): string {
  return name.replace(FIELD_NAME_ALLOWED, '').slice(0, MAX_FIELD_NAME_LENGTH);
}

interface ValidationIssue {
  readonly instancePath?: unknown;
  readonly params?: unknown;
}

/**
 * The offending field NAMES of a Fastify/Ajv validation failure — never a submitted value.
 *
 * Deduplicated, sanitised, truncated and capped. An issue that yields no usable name is skipped
 * rather than replaced by a guess.
 */
export function validationFieldNames(validation: readonly ValidationIssue[]): string[] {
  const names: string[] = [];
  for (const issue of validation) {
    const params = (issue.params ?? {}) as Record<string, unknown>;
    const missing = params['missingProperty'];
    const additional = params['additionalProperty'];
    const instancePath = typeof issue.instancePath === 'string' ? issue.instancePath : '';
    const base = instancePath.startsWith('/') ? instancePath.slice(1).split('/').join('.') : instancePath;

    let raw: string;
    if (typeof missing === 'string') {
      raw = base ? `${base}.${missing}` : missing;
    } else if (typeof additional === 'string') {
      raw = base ? `${base}.${additional}` : additional;
    } else {
      raw = base;
    }

    const name = sanitiseFieldName(raw);
    if (name.length === 0) continue;
    if (names.includes(name)) continue;
    names.push(name);
    if (names.length >= MAX_REPORTED_FIELDS) break;
  }
  return names;
}

/** The classification an error is reduced to before serialisation. */
interface Classified {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly message: string;
  readonly details: Record<string, unknown>;
  readonly retryable: boolean;
  /** True when the original error must be logged because nothing about it reaches the client. */
  readonly logOriginal: boolean;
}

function classified(
  code: ApiErrorCode,
  message: string,
  details: Record<string, unknown>,
  logOriginal: boolean,
): Classified {
  const row = catalogueRow(code);
  return { code, status: row.status, message, details, retryable: row.retryable, logOriginal };
}

/**
 * Maps any thrown value onto exactly one PRD §34.9 row.
 *
 * Order matters:
 *  1. `ApiError` — the deliberate case; its code, status, message and details are used verbatim.
 *  2. A schema-validation failure → `400 INVALID_REQUEST` with field names only.
 *  3. Any other Fastify 4xx (413 body-too-large, 415 unsupported media type, malformed JSON) →
 *     `400 INVALID_REQUEST` with empty details. PRD §34.9 has no code for 413/415 and the catalogue
 *     is closed, so this stops at the nearest existing code instead of inventing one (ticket
 *     Feedback obligation "PRD §34.9 turns out to be incomplete"; raised as plan OQ-5).
 *  4. Everything else → `500 INTERNAL_ERROR` with a fixed message.
 */
export function classifyError(error: unknown): Classified {
  if (error instanceof ApiError) {
    return classified(error.code, error.message, { ...error.details }, false);
  }

  const candidate = (error ?? {}) as Partial<FastifyError> & { validation?: unknown };

  if (Array.isArray(candidate.validation)) {
    const fields = validationFieldNames(candidate.validation as readonly ValidationIssue[]);
    return classified('INVALID_REQUEST', VALIDATION_ERROR_MESSAGE, { fields }, false);
  }

  const status = typeof candidate.statusCode === 'number' ? candidate.statusCode : 0;
  if (status >= 400 && status < 500) {
    return classified('INVALID_REQUEST', VALIDATION_ERROR_MESSAGE, {}, true);
  }

  return classified('INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE, {}, true);
}

/** Builds the PRD §16.1 body. The key order is the PRD's. */
export function errorBody(result: Classified, requestId: string): ApiErrorBody {
  return {
    error: {
      code: result.code,
      message: result.message,
      request_id: requestId,
      details: result.details,
      retryable: result.retryable,
    },
  };
}

/** The `request_id` to serialise; `''` only if the request-id hook never ran (see `installErrorHandling`). */
function requestIdOf(request: FastifyRequest): string {
  const value: unknown = (request as { requestId?: unknown }).requestId;
  return typeof value === 'string' ? value : '';
}

export interface ErrorHandlingOptions {
  readonly logger?: ErrorLogger;
  /**
   * Mints a `request_id` when the request-id hook did not run (an earlier hook threw). "Every
   * response carries `request_id`" has no exception, so the handler can always fall back.
   */
  readonly mintRequestId?: () => string;
}

/**
 * Installs the uniform error and not-found handlers on `app`.
 *
 * Called by `buildApp` step (c), on the ROOT instance, before any route area is registered — an
 * area that installs its own handler inside its encapsulation context overrides it for itself only.
 */
export function installErrorHandling(app: FastifyInstance, options: ErrorHandlingOptions = {}): void {
  const logger = options.logger ?? silentErrorLogger;
  const mintRequestId = options.mintRequestId;

  const resolveRequestId = (request: FastifyRequest): string => {
    const existing = requestIdOf(request);
    if (existing.length > 0) return existing;
    const minted = mintRequestId?.() ?? '';
    if (minted.length > 0) {
      (request as { requestId?: string }).requestId = minted;
    }
    return minted;
  };

  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const result = classifyError(error);
    const requestId = resolveRequestId(request);

    if (result.logOriginal) {
      // The ONLY place the original error is allowed to travel. It never reaches the body.
      logger.error(
        {
          request_id: requestId,
          code: result.code,
          error_name: error instanceof Error ? error.name : typeof error,
          error_message: error instanceof Error ? error.message : undefined,
          stack: error instanceof Error ? error.stack : undefined,
        },
        'unhandled error',
      );
    }

    return reply.code(result.status).type('application/json').send(errorBody(result, requestId));
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    // PRD §16.5: an unknown route, an unknown id and another tenant's id are indistinguishable.
    // No area names, no route list, no "did you mean".
    const result = classified('RESOURCE_NOT_FOUND', NOT_FOUND_MESSAGE, {}, false);
    const requestId = resolveRequestId(request);
    return reply.code(result.status).type('application/json').send(errorBody(result, requestId));
  });
}
