/**
 * The retry policy (ticket deliverable 5; PRD §34.9, §38.5).
 *
 * Retries happen on exactly two things:
 *
 * (a) a transport error — DNS/TCP/TLS/socket, or an injected `fetch` that rejected;
 * (b) an `AerApiError` whose `retryable` came from the GENERATED catalogue metadata
 *     (`errorRetryableByCode`), never from a local list and never from the wire.
 *
 * Backoff is exponential with FULL jitter, bounded by an attempt count AND a total elapsed budget,
 * both configurable. On a response carrying `Retry-After` the server's value wins over the computed
 * backoff, clamped to `maxRetryAfterMs` — an unclamped `Retry-After: 999999` from a broken or hostile
 * server is a denial-of-service against the caller's own process.
 *
 * `AbortSignal` is honoured at every await point: the signal is checked before each attempt AND the
 * backoff sleep RACES the abort, so an abort takes effect immediately rather than after up to a full
 * backoff interval.
 *
 * ## A recorded reading, not a silent deviation
 *
 * `errorRetryableByCode` marks `AUTHENTICATION_REQUIRED`, `MFA_REQUIRED`, `RECENT_AUTH_REQUIRED` and
 * `EMPLOYEE_PII_DETECTED` retryable, because PRD §34.9's Retry column is arguably a *user action*
 * column. The ticket is explicit that retryability is read from the generated metadata and not from a
 * local list, so it is implemented exactly as specified — the attempt and elapsed bounds cap the
 * cost — and the question is raised as the plan's **OQ-3** rather than answered by hand-carving
 * exceptions into this file.
 */
import { AerAbortedError, AerApiError, AerTransportError } from './errors.js';
import type { AerAbortSignal, Timers } from './internal/runtime.js';
import { systemTimers } from './internal/runtime.js';

export interface RetryOptions {
  /** Total attempts, including the first. `1` disables retrying. Default 3. */
  readonly maxAttempts?: number;
  /** First backoff, before jitter. Default 200 ms. */
  readonly initialDelayMs?: number;
  /** Ceiling for the computed backoff. Default 20 000 ms. */
  readonly maxDelayMs?: number;
  /** Total wall-clock budget for one logical call, across all attempts. Default 60 000 ms. */
  readonly maxElapsedMs?: number;
  /** Ceiling applied to a server `Retry-After`. Default 60 000 ms. */
  readonly maxRetryAfterMs?: number;
  /** Growth factor. Default 2. */
  readonly backoffFactor?: number;
}

export interface ResolvedRetryOptions {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxElapsedMs: number;
  readonly maxRetryAfterMs: number;
  readonly backoffFactor: number;
}

export const DEFAULT_RETRY_OPTIONS: ResolvedRetryOptions = Object.freeze({
  maxAttempts: 3,
  initialDelayMs: 200,
  maxDelayMs: 20_000,
  maxElapsedMs: 60_000,
  maxRetryAfterMs: 60_000,
  backoffFactor: 2,
});

export function resolveRetryOptions(options: RetryOptions | undefined): ResolvedRetryOptions {
  const d = DEFAULT_RETRY_OPTIONS;
  return Object.freeze({
    maxAttempts: options?.maxAttempts ?? d.maxAttempts,
    initialDelayMs: options?.initialDelayMs ?? d.initialDelayMs,
    maxDelayMs: options?.maxDelayMs ?? d.maxDelayMs,
    maxElapsedMs: options?.maxElapsedMs ?? d.maxElapsedMs,
    maxRetryAfterMs: options?.maxRetryAfterMs ?? d.maxRetryAfterMs,
    backoffFactor: options?.backoffFactor ?? d.backoffFactor,
  });
}

/** The injectable clock/jitter/sleep seam. Tests supply a fake so a run is instant and deterministic. */
export interface RetryDeps {
  /** Monotonic-ish milliseconds. Only differences are used. */
  readonly now: () => number;
  /** `[0, 1)`. Full jitter. */
  readonly random: () => number;
  /** Resolves after `ms`; rejects with `AerAbortedError` if `signal` fires first. */
  readonly sleep: (ms: number, signal?: AerAbortSignal | undefined) => Promise<void>;
}

/** A real sleeper built on the host timers, cancellable by an `AbortSignal`. */
export function createSleeper(timers: Timers = systemTimers) {
  return (ms: number, signal?: AerAbortSignal | undefined): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new AerAbortedError());
        return;
      }
      let handle: unknown = null;
      const onAbort = (): void => {
        if (handle !== null) timers.clearTimeout(handle);
        signal?.removeEventListener('abort', onAbort);
        reject(new AerAbortedError());
      };
      handle = timers.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort);
    });
}

export const systemRetryDeps: RetryDeps = Object.freeze({
  now: () => Date.now(),
  random: () => Math.random(),
  sleep: createSleeper(),
});

/**
 * `Retry-After` in milliseconds — delta-seconds OR an HTTP-date (RFC 9110 §10.2.3) — or `null`.
 *
 * A value that does not parse yields `null` rather than `NaN`: sleeping `NaN` milliseconds is
 * an immediate wake-up in some runtimes and a hang in others, and neither is a policy.
 * A date in the past yields `0`. The caller clamps.
 */
export function parseRetryAfter(headerValue: string | null, nowMs: number): number | null {
  if (headerValue === null) return null;
  const text = headerValue.trim();
  if (text.length === 0) return null;
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed - nowMs);
}

/** Whether the retry loop may try again after `error`. */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AerAbortedError) return false;
  if (error instanceof AerTransportError) return true;
  if (error instanceof AerApiError) return error.retryable;
  return false;
}

/** Exponential backoff with full jitter, in milliseconds. `attempt` is 1-based. */
export function backoffDelayMs(attempt: number, options: ResolvedRetryOptions, random: () => number): number {
  const exponential = options.initialDelayMs * options.backoffFactor ** Math.max(0, attempt - 1);
  const capped = Math.min(exponential, options.maxDelayMs);
  return Math.floor(random() * capped);
}

/** One attempt of a logical call. `attempt` is 1-based, purely for telemetry. */
export type Attempt<T> = (attempt: number) => Promise<T>;

/**
 * Runs `attempt` until it succeeds, until the policy is exhausted, or until the signal aborts.
 *
 * Never generates or alters an idempotency key: the key belongs to the logical call and is fixed
 * before this function is entered (see `idempotency.ts`).
 */
export async function executeWithRetry<T>(
  attempt: Attempt<T>,
  options: ResolvedRetryOptions,
  deps: RetryDeps,
  signal?: AerAbortSignal | undefined,
): Promise<T> {
  const startedAt = deps.now();
  let lastError: unknown = null;

  for (let n = 1; n <= options.maxAttempts; n += 1) {
    if (signal?.aborted) throw new AerAbortedError();
    try {
      return await attempt(n);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error)) throw error;
      if (n === options.maxAttempts) throw error;

      const serverDelay =
        error instanceof AerApiError && error.retryAfterMs !== null
          ? Math.min(error.retryAfterMs, options.maxRetryAfterMs)
          : null;
      const delay = serverDelay ?? backoffDelayMs(n, options, deps.random);

      const elapsed = deps.now() - startedAt;
      if (elapsed + delay > options.maxElapsedMs) throw error;

      await deps.sleep(delay, signal);
    }
  }

  /* c8 ignore next -- unreachable: the loop either returns or throws. */
  throw lastError ?? new AerTransportError('retry loop exhausted with no recorded error');
}
