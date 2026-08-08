/**
 * The injectable HTTP seam (ticket deliverable 2: *"`fetch` is injectable so every test runs offline
 * with no network"*).
 *
 * These are TRANSPORT shapes, not API shapes: not one of them describes a `/v1` request or response
 * body. Every body type in this package is imported from the generated core through
 * `src/internal/contracts.ts` (sub-PRD **D1**), and `test/no-local-contract-types.test.ts` asserts
 * that no declaration here collides with a generated name.
 *
 * They are declared structurally because `tsconfig.base.json` sets `lib: ["ES2024"]` — there is no
 * DOM library and no `@types/node` in this workspace, so `Response`, `Headers` and
 * `ReadableStream` have no ambient declaration. A host's real `fetch` satisfies these shapes.
 */
import type { AerAbortSignal } from './internal/runtime.js';

/** Case-insensitive response header lookup — the one member this package uses. */
export interface AerResponseHeaders {
  get(name: string): string | null;
}

export interface AerReadResult {
  readonly done: boolean;
  readonly value?: Uint8Array | undefined;
}

/**
 * A byte stream reader. `cancel()` is the load-bearing member: `sse/stream.ts` calls it from a
 * `finally` on every exit path, because an un-cancelled reader holds the socket open (ticket
 * deliverable 7).
 */
export interface AerStreamReader {
  read(): Promise<AerReadResult>;
  cancel(reason?: unknown): Promise<void>;
}

export interface AerReadableStream {
  getReader(): AerStreamReader;
}

export interface AerResponse {
  readonly status: number;
  readonly headers: AerResponseHeaders;
  readonly body?: AerReadableStream | null | undefined;
  text(): Promise<string>;
}

export interface AerRequestInit {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string | undefined;
  readonly signal?: AerAbortSignal | undefined;
}

/** The single network primitive this SDK uses. Defaults to `globalThis.fetch`; always injectable. */
export type AerFetch = (url: string, init: AerRequestInit) => Promise<AerResponse>;

/** `globalThis.fetch`, or `null` when the host has none (then the caller MUST inject one). */
export function defaultFetch(): AerFetch | null {
  const candidate = (globalThis as unknown as { fetch?: unknown }).fetch;
  return typeof candidate === 'function' ? (candidate as AerFetch) : null;
}

/** Header names this SDK sets or reads, lower-cased. Kept in one place so the scans can be exact. */
export const HEADER = Object.freeze({
  authorization: 'Authorization',
  widgetSession: 'X-AER-Widget-Session',
  idempotencyKey: 'Idempotency-Key',
  requestId: 'X-Request-Id',
  retryAfter: 'Retry-After',
  lastEventId: 'Last-Event-ID',
  accept: 'Accept',
  contentType: 'Content-Type',
  userAgent: 'User-Agent',
});
