/**
 * The shape every ergonomic layer talks to.
 *
 * `client.ts` implements it once — idempotency resolved once per logical call, then retry, then
 * telemetry, then transport — and `answers.ts`, `resources.ts` and the pagination helpers consume it.
 * Keeping the interface in its own module is what stops `client.ts` and `answers.ts` importing each
 * other in a cycle.
 */
import type { AerResponse } from './http.js';
import type { OperationId } from './internal/contracts.js';
import type { AerAbortSignal } from './internal/runtime.js';
import type { QueryValue } from './transport.js';

export interface CallOptions {
  readonly signal?: AerAbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
  /**
   * A caller-supplied `Idempotency-Key`, passed through unchanged (PRD §34.1). Accepted only for an
   * operation the document marks a retryable write; anything else is an `AerValidationError`.
   */
  readonly idempotencyKey?: string | undefined;
  /** Extra request headers. The credential header and `Idempotency-Key` are not settable here. */
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

export interface OperationCallOptions extends CallOptions {
  readonly pathParams?: Readonly<Record<string, string>> | undefined;
  readonly query?: Readonly<Record<string, QueryValue>> | undefined;
  readonly body?: unknown;
  /** Recorded in telemetry when present. An opaque id, never content. */
  readonly jobId?: string | undefined;
}

/** The one request primitive the ergonomic layers use. */
export interface Caller {
  /** Performs a JSON operation with retry, idempotency and telemetry applied. */
  call<TResponse>(operationId: OperationId, options?: OperationCallOptions): Promise<TResponse>;
  /** Opens a streaming response WITHOUT consuming its body (SSE). No retry: `sse/stream.ts` owns that. */
  openStream(operationId: OperationId, options?: OperationCallOptions): Promise<AerResponse>;
}
