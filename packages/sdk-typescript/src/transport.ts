/**
 * The single request path (ticket deliverables 2, 3, 5, 6; PRD §16.1, §34.1).
 *
 * One attempt = one `fetch`. Retrying is `retry.ts`'s job and idempotency-key resolution is
 * `client.ts`'s; this module is deliberately stateless so a retry cannot change what is sent.
 *
 * ## What it does and does not put on the wire
 *
 * - URL: `baseUrl` + the GENERATED `operations[id].path`, with every path parameter
 *   `encodeURIComponent`-encoded. The path template is never assembled from caller text.
 * - Headers: `Accept`, `Content-Type` (only with a body), `User-Agent`, the credential header from
 *   `auth.ts`, and `Idempotency-Key` when the call carries one. **Never a `Cookie` header**
 *   (PRD §38.2). Never an organisation/tenant header or field — the tenant is derived from the
 *   credential (PRD §34.1).
 * - Timeout: an internal `AbortController` linked to the caller's signal, so a caller abort and a
 *   timeout both reach the real transport.
 */
import { AerAbortedError, AerTransportError, toApiError } from './errors.js';
import type { AerApiError } from './errors.js';
import type { AerFetch, AerRequestInit, AerResponse } from './http.js';
import { HEADER } from './http.js';
import type { OperationId } from './internal/contracts.js';
import { apiBasePath, operations } from './internal/contracts.js';
import type { AerAbortSignal, Timers } from './internal/runtime.js';
import { createAbortController, systemTimers } from './internal/runtime.js';
import { parseRetryAfter } from './retry.js';

/** Query values this SDK is willing to serialise. Anything else is a programming error. */
export type QueryValue = string | number | boolean | undefined;

export interface TransportConfig {
  readonly baseUrl: string;
  readonly fetch: AerFetch;
  readonly applyAuth: (headers: Readonly<Record<string, string>>) => Record<string, string>;
  readonly userAgent: string;
  readonly timeoutMs: number;
  readonly timers?: Timers | undefined;
  readonly now?: (() => number) | undefined;
}

export interface AttemptRequest {
  readonly operationId: OperationId;
  readonly pathParams?: Readonly<Record<string, string>> | undefined;
  readonly query?: Readonly<Record<string, QueryValue>> | undefined;
  readonly body?: unknown;
  readonly extraHeaders?: Readonly<Record<string, string>> | undefined;
  readonly accept?: string | undefined;
  readonly signal?: AerAbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface AttemptResult {
  readonly status: number;
  readonly response: AerResponse;
}

/** `/answer-jobs/{job_id}` + `{job_id: 'job_x'}` -> `/answer-jobs/job_x`, percent-encoded. */
export function fillPathTemplate(template: string, params: Readonly<Record<string, string>>): string {
  return template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new AerTransportError(`the path parameter "${name}" was not supplied for "${template}"`);
    }
    return encodeURIComponent(value);
  });
}

/** `?a=1&b=2`, or `''`. Undefined values are omitted, never sent as the string "undefined". */
export function buildQueryString(query: Readonly<Record<string, QueryValue>> | undefined): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

/** The absolute URL for one operation. `baseUrl` already ends with the generated `apiBasePath`. */
export function buildUrl(config: { readonly baseUrl: string }, request: AttemptRequest): string {
  const operation = operations[request.operationId];
  const path = fillPathTemplate(operation.path, request.pathParams ?? {});
  return `${config.baseUrl.replace(/\/+$/, '')}${path}${buildQueryString(request.query)}`;
}

/** The generated method for an operation. */
export function methodFor(operationId: OperationId): string {
  return operations[operationId].method;
}

/** `baseUrl` must end at the generated `/v1` base path — PRD §16.1 fixes the version segment. */
export function assertBaseUrl(baseUrl: string): void {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (!trimmed.endsWith(apiBasePath)) {
    throw new AerTransportError(`baseUrl must end with "${apiBasePath}" (PRD §16.1); received a value that does not`);
  }
}

/**
 * Performs exactly one attempt.
 *
 * Resolves with the raw response for any status. Turning a non-2xx into a typed error is
 * `readJsonResponse` below, so a streaming caller can inspect the status without consuming the body.
 */
export async function performAttempt(config: TransportConfig, request: AttemptRequest): Promise<AttemptResult> {
  const timers = config.timers ?? systemTimers;
  const callerSignal = request.signal;
  if (callerSignal?.aborted) throw new AerAbortedError();

  const controller = createAbortController();
  const timeoutMs = request.timeoutMs ?? config.timeoutMs;
  let timedOut = false;

  const onCallerAbort = (): void => controller.abort();
  callerSignal?.addEventListener('abort', onCallerAbort);
  const timeoutHandle =
    timeoutMs > 0
      ? timers.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  const hasBody = request.body !== undefined;
  const headers: Record<string, string> = config.applyAuth({
    [HEADER.accept]: request.accept ?? 'application/json',
    [HEADER.userAgent]: config.userAgent,
    ...(hasBody ? { [HEADER.contentType]: 'application/json' } : {}),
    ...(request.extraHeaders ?? {}),
  });

  const init: AerRequestInit = {
    method: methodFor(request.operationId),
    headers,
    ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
    signal: controller.signal,
  };

  try {
    const response = await config.fetch(buildUrl(config, request), init);
    return { status: response.status, response };
  } catch (cause) {
    if (timedOut) throw new AerTransportError(`the request timed out after ${timeoutMs} ms`, { cause });
    if (callerSignal?.aborted) throw new AerAbortedError();
    throw new AerTransportError('the request failed before a response was received', { cause });
  } finally {
    if (timeoutHandle !== null) timers.clearTimeout(timeoutHandle);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
}

export interface JsonOutcome {
  readonly status: number;
  readonly body: unknown;
  readonly requestId: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads a JSON response and maps a non-2xx to the typed error.
 *
 * A body that is not JSON is not an exception here: it becomes the raw text, and a non-2xx with an
 * unparseable body becomes an `INTERNAL_ERROR`-shaped `AerApiError` carrying a truncated excerpt.
 *
 * @throws AerApiError for any non-2xx status.
 */
export async function readJsonResponse(result: AttemptResult, nowMs: number): Promise<JsonOutcome> {
  const raw = await result.response.text();
  let parsed: unknown = undefined;
  if (raw.length > 0) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
  }

  const headerRequestId = result.response.headers.get(HEADER.requestId);
  const bodyRequestId = isRecord(parsed) && typeof parsed['request_id'] === 'string' ? (parsed['request_id'] as string) : null;
  const requestId = bodyRequestId ?? headerRequestId;

  if (result.status >= 200 && result.status < 300) {
    return { status: result.status, body: parsed, requestId };
  }

  const retryAfterMs = parseRetryAfter(result.response.headers.get(HEADER.retryAfter), nowMs);
  const error: AerApiError = toApiError({
    httpStatus: result.status,
    body: parsed,
    rawText: parsed === undefined ? raw : null,
    headerRequestId: requestId,
    retryAfterMs,
  });
  throw error;
}
