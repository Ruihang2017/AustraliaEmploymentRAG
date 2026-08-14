/**
 * EVID-07 deliverable 10 — the explicit failure matrix (`ANS-007`'s named evidence).
 *
 * Every branch of `generate.ts` terminates in either a parsed success or one of the SEVEN reasons
 * below. There is no generic path, no "unknown error" bucket and no fallthrough: `assertNever` gives
 * the compiler the job of rejecting a future reason that nobody routed. A fall-through here would be
 * the unvalidated fallback PRD §17.3 forbids, arriving by accident.
 *
 * The customer-facing code and status are CONSUMED from `packages/contracts` through
 * `src/schema/contracts.ts` (FND-03/FND-04) and never written as literals — PRD §34.9 owns the
 * mapping, and a literal here would be a second copy free to drift.
 *
 * `detail` IS A FIXED ENUM-ISH STRING, NEVER PROVIDER TEXT. A provider body, a rate-limit message or
 * a JSON parser excerpt must never be echoed into a result, an error message or a recorded row
 * (PRD §37.3; plan §6 risk 6). `test/providers/canary.test.ts` is the guard.
 */
import { errorHttpStatusByCode } from '../schema/contracts.js';
import type { ErrorCode } from '../schema/contracts.js';

export const UNAVAILABLE_REASONS = Object.freeze([
  'PROVIDER_FAILURE',
  'PROVIDER_RATE_LIMITED',
  'SCHEMA_INVALID',
  'PROFILE_TIMEOUT',
  'PROFILE_NOT_APPROVED',
  'KILL_SWITCH',
  'NO_RESERVATION',
] as const);

export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export const isUnavailableReason = (value: unknown): value is UnavailableReason =>
  typeof value === 'string' && (UNAVAILABLE_REASONS as readonly string[]).includes(value);

/**
 * The fixed detail vocabulary. Each is a description of a CLASS of failure, chosen from this list —
 * never a string built from a provider response.
 */
export const UNAVAILABLE_DETAILS = Object.freeze([
  'TRANSPORT_THREW',
  'PROVIDER_STATUS_4XX',
  'PROVIDER_STATUS_5XX',
  'PROVIDER_STATUS_429',
  'ELAPSED_CEILING_EXCEEDED',
  'RESPONSE_FAILED_SCHEMA',
  'PROFILE_NOT_APPROVED_FOR_ENVIRONMENT',
  'PROFILE_UNKNOWN',
  'PROVIDER_RETENTION_UNACCEPTABLE',
  'KILL_SWITCH_PROFILE',
  'KILL_SWITCH_PROVIDER',
  'RESERVATION_MISSING',
  'RESERVATION_EXPIRED',
  'RESERVATION_WRONG_PROFILE',
] as const);

export type UnavailableDetail = (typeof UNAVAILABLE_DETAILS)[number];

export const GENERATION_UNAVAILABLE: ErrorCode = 'GENERATION_UNAVAILABLE';

export interface GatewayUnavailable {
  readonly outcome: 'UNAVAILABLE';
  readonly reason: UnavailableReason;
  readonly detail: UnavailableDetail;
  readonly errorCode: ErrorCode;
  readonly httpStatus: number;
  /** Only ever populated from a `Retry-After` header, as milliseconds. */
  readonly retryAfterMs?: number;
  /** Only ever populated for `SCHEMA_INVALID`, and only ever a structural path. */
  readonly failingPath?: string;
}

export interface UnavailableOptions {
  readonly retryAfterMs?: number;
  readonly failingPath?: string;
}

export function unavailable(
  reason: UnavailableReason,
  detail: UnavailableDetail,
  options: UnavailableOptions = {},
): GatewayUnavailable {
  const base = {
    outcome: 'UNAVAILABLE' as const,
    reason,
    detail,
    errorCode: GENERATION_UNAVAILABLE,
    httpStatus: errorHttpStatusByCode[GENERATION_UNAVAILABLE],
  };
  if (options.retryAfterMs !== undefined && options.failingPath !== undefined) {
    return { ...base, retryAfterMs: options.retryAfterMs, failingPath: options.failingPath };
  }
  if (options.retryAfterMs !== undefined) return { ...base, retryAfterMs: options.retryAfterMs };
  if (options.failingPath !== undefined) return { ...base, failingPath: options.failingPath };
  return base;
}

/**
 * The exhaustiveness check. Reaching this at runtime is impossible if it compiles; it throws anyway,
 * because "impossible" plus a silent `undefined` is how a matrix acquires a hole.
 */
export function assertNever(value: never, context: string): never {
  throw new Error(`unhandled ${context}: ${String(value)}`);
}

/**
 * `Retry-After` per RFC 9110: either delta-seconds or an HTTP-date. Only the numeric form is honoured
 * — the date form needs a clock to interpret, and this module has none by construction. An
 * uninterpretable value yields `undefined`, never a guess.
 */
export function retryAfterMsFrom(headers: Readonly<Record<string, string>>): number | undefined {
  const raw = headers['retry-after'] ?? headers['Retry-After'];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const seconds = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return seconds * 1000;
}
