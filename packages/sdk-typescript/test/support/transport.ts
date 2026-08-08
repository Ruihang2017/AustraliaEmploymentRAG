/**
 * The offline transport seam every suite in this package runs on.
 *
 * The ticket's Test plan is explicit: *"all offline: no network, no live API, no running server"*.
 * Nothing here opens a socket. `fetch` is a function that consults a script, records what it was
 * asked to send, and replays a recorded response.
 *
 * Three things it records that the acceptance items actually assert on:
 *
 * - **every request**, with its headers — so `Idempotency-Key` can be compared ACROSS attempts rather
 *   than merely asserted present, and so `Cookie` can be asserted absent from all of them;
 * - **every reader cancellation** — so "the SSE reader is closed in a `finally`" is checked by
 *   observation rather than by reading the code;
 * - **every slept interval**, on a fake clock — so the `Retry-After` case can assert ~3 s without a
 *   suite that takes 3 s.
 */
import { AerAbortedError } from '../../src/errors.js';
import type { AerFetch, AerReadResult, AerRequestInit, AerResponse, AerStreamReader } from '../../src/http.js';
import type { AerAbortSignal } from '../../src/internal/runtime.js';
import type { RetryDeps } from '../../src/retry.js';
import type { Timers } from '../../src/internal/runtime.js';

export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | undefined;
}

export interface ResponseSpec {
  readonly status: number;
  /** A JSON body. Serialised with `JSON.stringify`. */
  readonly json?: unknown;
  /** A body that is not JSON (or is deliberately malformed). */
  readonly text?: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** An SSE transcript. Delivered in `chunkSize`-character pieces to exercise frame splitting. */
  readonly sse?: string;
  readonly chunkSize?: number;
  /** Reject instead of responding — a transport failure. */
  readonly reject?: Error;
  /** Never resolve until the signal aborts. Used for the wait-timeout case. */
  readonly hang?: boolean;
}

export type Responder = (request: RecordedRequest, index: number) => ResponseSpec;

export interface FakeTransport {
  readonly fetch: AerFetch;
  readonly requests: RecordedRequest[];
  /** One entry per `reader.cancel()` — the "reader closed in a finally" evidence. */
  readonly readerCancels: string[];
  readonly headerValues: (name: string) => (string | undefined)[];
}

const lower = (headers: Readonly<Record<string, string>>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
};

function makeHeaders(headers: Readonly<Record<string, string>>): { get(name: string): string | null } {
  const map = lower(headers);
  return { get: (name: string): string | null => map[name.toLowerCase()] ?? null };
}

function makeSseBody(
  transcript: string,
  chunkSize: number,
  onCancel: () => void,
): { getReader(): AerStreamReader } {
  const encoded = new TextEncoder().encode(transcript);
  let offset = 0;
  let cancelled = false;
  return {
    getReader(): AerStreamReader {
      return {
        read(): Promise<AerReadResult> {
          if (cancelled || offset >= encoded.length) return Promise.resolve({ done: true });
          const end = Math.min(offset + chunkSize, encoded.length);
          const value = encoded.slice(offset, end);
          offset = end;
          return Promise.resolve({ done: false, value });
        },
        cancel(): Promise<void> {
          cancelled = true;
          onCancel();
          return Promise.resolve();
        },
      };
    },
  };
}

export function createFakeTransport(responder: Responder): FakeTransport {
  const requests: RecordedRequest[] = [];
  const readerCancels: string[] = [];

  const fetchImpl: AerFetch = (url: string, init: AerRequestInit): Promise<AerResponse> => {
    const request: RecordedRequest = {
      url,
      method: init.method,
      headers: { ...init.headers },
      body: init.body,
    };
    requests.push(request);
    const spec = responder(request, requests.length - 1);

    if (spec.reject) return Promise.reject(spec.reject);

    if (spec.hang) {
      const signal = init.signal;
      return new Promise<AerResponse>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('aborted'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }

    const headers = makeHeaders(spec.headers ?? {});
    if (spec.sse !== undefined) {
      const body = makeSseBody(spec.sse, spec.chunkSize ?? 24, () => readerCancels.push(url));
      return Promise.resolve({ status: spec.status, headers, body, text: () => Promise.resolve('') });
    }

    const text = spec.text ?? (spec.json === undefined ? '' : JSON.stringify(spec.json));
    return Promise.resolve({
      status: spec.status,
      headers,
      body: null,
      text: () => Promise.resolve(text),
    });
  };

  return {
    fetch: fetchImpl,
    requests,
    readerCancels,
    headerValues: (name: string): (string | undefined)[] =>
      requests.map((request) => lower(request.headers)[name.toLowerCase()]),
  };
}

/** A responder that replays a fixed script, then repeats its last entry. */
export function scripted(specs: readonly ResponseSpec[]): Responder {
  return (_request, index) => specs[Math.min(index, specs.length - 1)] as ResponseSpec;
}

/** A responder that routes by the operation's path suffix. */
export function routed(routes: readonly (readonly [RegExp, Responder])[], fallback?: Responder): Responder {
  return (request, index) => {
    for (const [pattern, responder] of routes) {
      if (pattern.test(request.url)) return responder(request, index);
    }
    if (fallback) return fallback(request, index);
    throw new Error(`the fake transport has no route for ${request.method} ${request.url}`);
  };
}

export interface FakeClock extends RetryDeps {
  /** Every interval passed to `sleep`, in call order. */
  readonly slept: number[];
  readonly timers: Timers;
  /** Fires every pending timer whose deadline has passed after advancing by `ms`. */
  advance(ms: number): void;
  readonly nowMs: () => number;
}

/**
 * A deterministic clock.
 *
 * `sleep` resolves immediately but advances the virtual clock and records the interval, so a test can
 * assert "waited ~3 s" without waiting. `random` is fixed at 1 so full jitter is at its maximum and
 * the computed backoff is exact and comparable; a test that needs another value passes its own.
 */
export function createFakeClock(options: { readonly random?: number } = {}): FakeClock {
  let current = 1_000_000;
  const slept: number[] = [];
  const pending: { at: number; handler: () => void; id: number }[] = [];
  let nextId = 1;

  const runDue = (): void => {
    for (;;) {
      const index = pending.findIndex((entry) => entry.at <= current);
      if (index === -1) return;
      const entry = pending.splice(index, 1)[0] as { at: number; handler: () => void; id: number };
      entry.handler();
    }
  };

  const timers: Timers = {
    setTimeout: (handler: () => void, timeoutMs: number): unknown => {
      const id = nextId;
      nextId += 1;
      pending.push({ at: current + timeoutMs, handler, id });
      return id;
    },
    clearTimeout: (handle: unknown): void => {
      const index = pending.findIndex((entry) => entry.id === handle);
      if (index !== -1) pending.splice(index, 1);
    },
  };

  return {
    now: () => current,
    nowMs: () => current,
    random: () => options.random ?? 1,
    sleep: (ms: number, signal?: AerAbortSignal | undefined): Promise<void> => {
      if (signal?.aborted) return Promise.reject(new AerAbortedError());
      slept.push(ms);
      current += ms;
      runDue();
      return Promise.resolve();
    },
    slept,
    timers,
    advance: (ms: number): void => {
      current += ms;
      runDue();
    },
  };
}
