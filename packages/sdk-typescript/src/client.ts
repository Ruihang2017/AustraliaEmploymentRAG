/**
 * `createAerClient` — the single entry point (ticket deliverable 2).
 *
 * The wiring order is idempotency → retry → telemetry → transport, and it is load-bearing:
 *
 * - **The idempotency key is resolved ONCE**, here, before `executeWithRetry` is entered, and the
 *   resolved value is closed over by every attempt. There is no branch — not the `429`/`Retry-After`
 *   path, not the transport-error path, not the abort path, not `createAndWait` — on which a second
 *   key can be minted for the same logical call. `test/idempotency.test.ts` asserts the three
 *   captured header values are byte-identical.
 * - **Telemetry is emitted per ATTEMPT**, through `createTelemetryEmitter`'s single choke point, and
 *   the record is assembled from typed scalars only. The request body, the response body, the URL and
 *   any error message are not in scope at the emit site; only the typed `error_code` is
 *   (PRD §8.10, sub-PRD **D7**).
 * - **The credential is never here.** `auth.ts` returns `applyAuth`, a closure. This module holds no
 *   credential field, and neither does the returned client (PRD §22, §21.1).
 *
 * There is **no `organizationId` option** — PRD §34.1: the tenant is derived from the authenticated
 * credential and is *"never accepted in a request body"*. There is **no cookie/session variant** —
 * PRD §38.2: *"API keys do not use cookies."*
 */
import type { AnswerJobsApi, AnswersApi } from './answers.js';
import { createAnswerJobsApi, createAnswersApi } from './answers.js';
import type { AerAuth } from './auth.js';
import { createAuthenticator, installRedaction } from './auth.js';
import type { Caller, CallOptions, OperationCallOptions } from './call.js';
import { AerValidationError } from './errors.js';
import type { AerFetch, AerResponse } from './http.js';
import { HEADER, defaultFetch } from './http.js';
import type { KeyGenerator } from './idempotency.js';
import { resolveIdempotencyKey } from './idempotency.js';
import type { CollectionResponse, OperationId, SearchRequest, SearchResponse } from './internal/contracts.js';
import { operations, uuidv7 } from './internal/contracts.js';
import type { Timers } from './internal/runtime.js';
import { platformName, runtimeName, systemTimers } from './internal/runtime.js';
import type { ListParams, Paginator } from './pagination.js';
import { assertPageSize, createPaginator } from './pagination.js';
import type { ResourceGroup, OperationInvoker } from './resources.js';
import { createOperationInvokers, createResourceGroups, publicOperationIds } from './resources.js';
import type { RetryDeps, RetryOptions } from './retry.js';
import { executeWithRetry, resolveRetryOptions, systemRetryDeps } from './retry.js';
import type { AerStreamEvent } from './sse/events.js';
import type { StreamOptions } from './sse/stream.js';
import { createEventStream } from './sse/stream.js';
import type { TelemetryOptions, TelemetryRecord } from './telemetry.js';
import { createTelemetryEmitter } from './telemetry.js';
import { assertBaseUrl, performAttempt, readJsonResponse } from './transport.js';
import { SDK_NAME, SDK_VERSION, userAgent } from './version.js';

export interface AerClientOptions {
  /** e.g. `https://api.<host>/v1`. Must end at the generated `apiBasePath`. */
  readonly baseUrl: string;
  readonly auth: AerAuth;
  /** Injectable — the offline test seam. Defaults to `globalThis.fetch`. */
  readonly fetch?: AerFetch | undefined;
  readonly retry?: RetryOptions | undefined;
  /** Per-request timeout. Default 30 000 ms. `0` disables it. */
  readonly timeoutMs?: number | undefined;
  /** Default: disabled, with no transport of any kind. */
  readonly telemetry?: TelemetryOptions | undefined;
  readonly userAgentSuffix?: string | undefined;
  /** Test seams. Never supplied in production. */
  readonly retryDeps?: RetryDeps | undefined;
  readonly timers?: Timers | undefined;
  readonly generateIdempotencyKey?: KeyGenerator | undefined;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

export interface AerClient {
  /** `POST /v1/search` (PRD §34.2). */
  search(request: SearchRequest, options?: CallOptions): Promise<SearchResponse>;
  readonly answers: AnswersApi;
  readonly answerJobs: AnswerJobsApi;
  /** Every public `/v1` operation, keyed by its generated `operationId`. */
  readonly operations: Readonly<Record<OperationId, OperationInvoker>>;
  /** Operations grouped by resource; a resource with a collection root also carries `list`. */
  readonly resources: Readonly<Record<string, ResourceGroup>>;
  /** A paginator over any collection operation (PRD §34.1). */
  list<TItem = unknown>(operationId: OperationId, params?: ListParams): Paginator<TItem>;
}

export function createAerClient(options: AerClientOptions): AerClient {
  assertBaseUrl(options.baseUrl);
  const authenticator = createAuthenticator(options.auth);

  const fetchImpl = options.fetch ?? defaultFetch();
  if (!fetchImpl) {
    throw new AerValidationError('this runtime provides no global fetch; pass one as options.fetch');
  }

  const timers = options.timers ?? systemTimers;
  const retryOptions = resolveRetryOptions(options.retry);
  const retryDeps = options.retryDeps ?? systemRetryDeps;
  const emit = createTelemetryEmitter(options.telemetry);
  const generateKey: KeyGenerator = options.generateIdempotencyKey ?? uuidv7;
  const agent = userAgent(options.userAgentSuffix);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const transportConfig = {
    baseUrl: options.baseUrl,
    fetch: fetchImpl,
    applyAuth: authenticator.applyAuth,
    userAgent: agent,
    timeoutMs,
    timers,
    now: retryDeps.now,
  };

  /** Assembles ONE telemetry record. Only typed scalars are in scope here — see the module header. */
  const record = (
    operationId: OperationId,
    attempt: number,
    startedAt: number,
    httpStatus: number | null,
    requestId: string | undefined,
    jobId: string | undefined,
    errorCode: string | undefined,
  ): TelemetryRecord => ({
    sdk_name: SDK_NAME,
    sdk_version: SDK_VERSION,
    runtime: runtimeName(),
    platform: platformName(),
    operation_id: operationId,
    http_method: operations[operationId].method,
    http_status: httpStatus,
    ...(requestId === undefined ? {} : { request_id: requestId }),
    ...(jobId === undefined ? {} : { job_id: jobId }),
    duration_ms: Math.max(0, retryDeps.now() - startedAt),
    attempt,
    ...(errorCode === undefined ? {} : { error_code: errorCode }),
  });

  const errorCodeOf = (error: unknown): string | undefined => {
    const code = (error as { readonly code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : undefined;
  };
  const httpStatusOf = (error: unknown): number | null => {
    const status = (error as { readonly httpStatus?: unknown } | null)?.httpStatus;
    return typeof status === 'number' ? status : null;
  };
  const requestIdOf = (error: unknown): string | undefined => {
    const id = (error as { readonly requestId?: unknown } | null)?.requestId;
    return typeof id === 'string' ? id : undefined;
  };

  const caller: Caller = {
    async call<TResponse>(operationId: OperationId, callOptions: OperationCallOptions = {}): Promise<TResponse> {
      // ONE key per logical call, resolved before the attempt loop. See the module header.
      const idempotencyKey = resolveIdempotencyKey(operationId, callOptions.idempotencyKey, generateKey);
      const extraHeaders: Record<string, string> = {
        ...(callOptions.headers ?? {}),
        ...(idempotencyKey === undefined ? {} : { [HEADER.idempotencyKey]: idempotencyKey }),
      };

      return executeWithRetry<TResponse>(
        async (attempt) => {
          const startedAt = retryDeps.now();
          try {
            const result = await performAttempt(transportConfig, {
              operationId,
              pathParams: callOptions.pathParams,
              query: callOptions.query,
              body: callOptions.body,
              extraHeaders,
              signal: callOptions.signal,
              timeoutMs: callOptions.timeoutMs,
            });
            const outcome = await readJsonResponse(result, retryDeps.now());
            emit(
              record(
                operationId,
                attempt,
                startedAt,
                outcome.status,
                outcome.requestId ?? undefined,
                callOptions.jobId,
                undefined,
              ),
            );
            return outcome.body as TResponse;
          } catch (error) {
            emit(
              record(
                operationId,
                attempt,
                startedAt,
                httpStatusOf(error),
                requestIdOf(error),
                callOptions.jobId,
                errorCodeOf(error),
              ),
            );
            throw error;
          }
        },
        retryOptions,
        retryDeps,
        callOptions.signal,
      );
    },

    openStream(operationId: OperationId, callOptions: OperationCallOptions = {}): Promise<AerResponse> {
      return performAttempt(transportConfig, {
        operationId,
        pathParams: callOptions.pathParams,
        query: callOptions.query,
        extraHeaders: callOptions.headers,
        accept: 'text/event-stream',
        signal: callOptions.signal,
        // A stream has no response deadline; liveness is the heartbeat's job (PRD §34.4).
        timeoutMs: 0,
      }).then((result) => {
        if (result.status < 200 || result.status >= 300) {
          // Reuse the one error-mapping path, which consumes the body and throws the typed error.
          return readJsonResponse(result, retryDeps.now()).then(() => result.response);
        }
        return result.response;
      });
    },
  };

  const stream = (jobId: string, streamOptions: StreamOptions = {}): AsyncIterable<AerStreamEvent> =>
    createEventStream(jobId, streamOptions, {
      open: ({ lastEventId, signal }) =>
        caller.openStream('streamAnswerJobEvents', {
          pathParams: { job_id: jobId },
          ...(lastEventId === undefined ? {} : { headers: { [HEADER.lastEventId]: lastEventId } }),
          signal,
        }),
      retry: retryOptions,
      retryDeps,
    });

  const answersDeps = { caller, stream, timers, sleep: retryDeps.sleep };
  const answers = createAnswersApi(answersDeps);
  const answerJobs = createAnswerJobsApi(answersDeps);

  const list = <TItem,>(operationId: OperationId, params: ListParams = {}): Paginator<TItem> => {
    assertPageSize(params.page_size);
    return createPaginator<TItem>(
      ({ page_size, cursor, signal }) =>
        caller.call<CollectionResponse>(operationId, {
          query: { page_size, ...(cursor === undefined ? {} : { cursor }) },
          signal,
        }),
      params,
    );
  };

  const client: AerClient = {
    search: (request: SearchRequest, callOptions: CallOptions = {}): Promise<SearchResponse> =>
      caller.call<SearchResponse>('search', { ...callOptions, body: request }),
    answers,
    answerJobs,
    operations: createOperationInvokers(caller),
    resources: createResourceGroups(caller),
    list,
  };

  // Every stringification of the client goes through the redacted view: no credential can ride out
  // through `console.log`, `JSON.stringify` or `util.inspect`.
  return installRedaction(client, {
    baseUrl: options.baseUrl,
    authKind: authenticator.kind,
    userAgent: agent,
    operationCount: publicOperationIds().length,
  });
}
