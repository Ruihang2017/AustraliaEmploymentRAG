/**
 * FND-09 deliverables 6 and 7 — the admission decision.
 *
 * PRD §42.6: *"Admission requires both operation quota and funding-ledger balance."* Both gates must
 * pass; neither alone admits.
 *
 * EVALUATION ORDER when several gates fail at once (the ticket states the single-failure cases only,
 * so this precedence is a build-time choice, recorded here for `RUNT-02`):
 *
 *   1. `operation === 'SEARCH'` — the funding-ledger gates ARE NOT EVALUATED AT ALL. Search is
 *      admitted unless its own search-burst quota is exhausted. No generation-ledger state, provider
 *      health or price problem can reach a Search decision. This is the structural half of
 *      OPS-003's "search remains usable" (PRD §8.2, §36.8).
 *   2. `generationAvailable === false` → `GENERATION_UNAVAILABLE`.
 *   3. Pricing validity, split by who pays (PRD §42.6 fails closed on FOUNDER-FUNDED calls):
 *        founder-funded or prepaid, any non-`ok` cause  → `PRICE_DATA_UNAVAILABLE`;
 *        BYOK, cause `MALFORMED`                        → `PRICE_DATA_UNAVAILABLE`;
 *        BYOK, cause `ABSENT` or `STALE`                → evaluated on, with NO estimate recorded.
 *      Denying BYOK work because founder price data is missing would breach PRD §8.2's spirit and
 *      §16.4 (BYOK changes who pays, not what is allowed); admitting BYOK on MALFORMED data would
 *      record a wrong estimate, which §42.6 requires to be recorded correctly or not at all.
 *   4. Operation quota exhausted → `RATE_LIMITED`.
 *   5. Concurrency exhausted → `CONCURRENCY_LIMIT`.
 *   6. Funding-ledger balance → `CREDIT_LIMIT_REACHED`.
 *
 * CONCURRENCY, AND WHOSE JOB THE LOCK IS. The ceiling holds only because
 * `outstandingReservationsMicroAud` is counted against it AT ADMISSION TIME, before settlement (see
 * `reserve-order.ts`). This module is pure and cannot lock anything: the caller (`EVID-08`/`DATA-07`)
 * MUST perform the read-modify-write of the founder ledger row atomically, or N concurrent
 * admissions each computed from the same stale state will each pass.
 *
 * RATE-LIMIT METADATA (PRD §38.5 *"without disclosing other tenants"*). `metadata` is a function of
 * the REQUESTING organisation's own matched counter only, falling back to the plan tier's published
 * default cell. The §38.5 "System hard protection" column is GLOBAL and is never read here: telling a
 * tenant the global limit and global remaining leaks other tenants' aggregate usage.
 *
 * Pure: `nowEpochMs`, provider health, prices and all counters are inputs (PRD §39.1, §45.2).
 */
import type { ErrorCode } from '../../../contracts/src/enums/error-code.js';
import { deepFreeze } from './frozen.js';
import {
  counterFor,
  recordByokEstimate,
  type ByokEstimate,
  type FounderLedgerState,
  type OperationLedger,
  type OperationLedgerState,
} from './ledgers.js';
import {
  limitCellFor,
  type LimitBoundary,
  type PlanTier,
} from './limit-defaults.js';
import type { MicroAud } from './micro-aud.js';
import { validatePricing, type FxSnapshot, type PriceSnapshot } from './pricing.js';
import { reserve, type Reservation } from './reserve.js';
import { availableForClass, type FounderReserveClass } from './reserve-order.js';

export const OPERATION_KIND_VALUES = deepFreeze([
  'SEARCH',
  'QUICK',
  'DEEP',
  'EXPORT',
  'API_CALL',
  'WIDGET_SESSION',
] as const);

export type OperationKind = (typeof OPERATION_KIND_VALUES)[number];

export const ADMISSION_DENIAL_REASONS = deepFreeze([
  'CREDIT_LIMIT_REACHED',
  'RATE_LIMITED',
  'GENERATION_UNAVAILABLE',
  'PRICE_DATA_UNAVAILABLE',
  'CONCURRENCY_LIMIT',
] as const);

export type AdmissionDenialReason = (typeof ADMISSION_DENIAL_REASONS)[number];

/**
 * Total map from a denial reason onto a PRD §34.9 error code, so `RUNT-02` translates without
 * inventing semantics. `satisfies` proves every target is a real code in `FND-03`'s registry.
 *
 * Five reasons map onto three codes. `PRICE_DATA_UNAVAILABLE` and `CONCURRENCY_LIMIT` are NOT §34.9
 * codes — they are finer-grained causes of ones that are, kept distinct for logs and admin:
 *   - `PRICE_DATA_UNAVAILABLE` → `GENERATION_UNAVAILABLE` (PRD §36.8 final row:
 *     "Provider/budget unavailable → Job unavailable; Search and saved records remain available");
 *   - `CONCURRENCY_LIMIT` → `RATE_LIMITED` (PRD §38.5 puts concurrency in the same limits table and
 *     §34.9 has no separate concurrency code).
 * Adding a §34.9 code instead would be a public-API change under PRD §16.1/§45.5 touching `FND-03`,
 * `FND-04` and the PRD — see the ticket writeback carried in this branch.
 */
export const ADMISSION_REASON_TO_ERROR_CODE = deepFreeze({
  CREDIT_LIMIT_REACHED: 'CREDIT_LIMIT_REACHED',
  RATE_LIMITED: 'RATE_LIMITED',
  GENERATION_UNAVAILABLE: 'GENERATION_UNAVAILABLE',
  PRICE_DATA_UNAVAILABLE: 'GENERATION_UNAVAILABLE',
  CONCURRENCY_LIMIT: 'RATE_LIMITED',
} as const) satisfies Readonly<Record<AdmissionDenialReason, ErrorCode>>;

/** The §38.5 boundary each operation is limited by. Used only for the tenant-facing default cell. */
export const LIMIT_BOUNDARY_BY_OPERATION = deepFreeze({
  SEARCH: 'SEARCH_BURST',
  QUICK: 'CONCURRENT_QUICK',
  DEEP: 'CONCURRENT_DEEP',
  EXPORT: 'CONCURRENT_EXPORT',
  API_CALL: 'API_CALLS',
  WIDGET_SESSION: 'WIDGET_SESSION_CREATION',
} as const) satisfies Readonly<Record<OperationKind, LimitBoundary>>;

/**
 * The §38.5 ledger each operation draws from, or `null` where the PRD names no ledger for it.
 * `EXPORT` and `WIDGET_SESSION` are bounded by §38.5 concurrency and burst boundaries, not by one of
 * the five ledgers; mapping them onto a ledger anyway would invent spec.
 */
export const QUOTA_LEDGER_BY_OPERATION = deepFreeze({
  SEARCH: 'SEARCH',
  QUICK: 'ANSWER_CREDITS',
  DEEP: 'ADVANCED_TASK_CREDITS',
  EXPORT: null,
  API_CALL: 'API_CALLS',
  WIDGET_SESSION: null,
} as const) satisfies Readonly<Record<OperationKind, OperationLedger | null>>;

export type ConcurrencyBoundary = 'CONCURRENT_QUICK' | 'CONCURRENT_DEEP' | 'CONCURRENT_EXPORT';

export const CONCURRENCY_BOUNDARY_BY_OPERATION = deepFreeze({
  SEARCH: null,
  QUICK: 'CONCURRENT_QUICK',
  DEEP: 'CONCURRENT_DEEP',
  EXPORT: 'CONCURRENT_EXPORT',
  API_CALL: null,
  WIDGET_SESSION: null,
} as const) satisfies Readonly<Record<OperationKind, ConcurrencyBoundary | null>>;

export interface ConcurrencyCounter {
  readonly boundary: ConcurrencyBoundary;
  readonly limit: number;
  readonly inFlight: number;
}

/** PRD §38.5's `Retry-After` companion values. Derived from the requesting tenant's inputs only. */
export interface RateLimitMetadata {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAtEpochMs: number;
}

export type FundingRequest =
  | {
      readonly kind: 'FOUNDER_PLATFORM_BUDGET';
      /** PRD §42.6 reserve order. Required — never inferred, never defaulted. */
      readonly reserveClass: FounderReserveClass;
      readonly state: FounderLedgerState;
    }
  | {
      readonly kind: 'CUSTOMER_PREPAID_OR_BYOK';
      readonly mode: 'PREPAID';
      readonly prepaidBalanceMicroAud: MicroAud;
    }
  | { readonly kind: 'CUSTOMER_PREPAID_OR_BYOK'; readonly mode: 'BYOK' };

export interface PricingRequest {
  readonly price: PriceSnapshot | null;
  readonly fx: FxSnapshot | null;
  readonly maxAgeMs: number;
  readonly maxInputTokens: bigint;
  readonly maxOutputTokens: bigint;
  /** Minted by the caller — this module has no clock and no randomness. */
  readonly reservationId: string;
}

export interface AdmissionInput {
  readonly operation: OperationKind;
  readonly tier: PlanTier;
  /** Injected: this module has no clock. */
  readonly nowEpochMs: number;
  /** Provider health. `EVID-08` owns the circuit breaker; here it is an input. */
  readonly generationAvailable: boolean;
  /** The requesting organisation's OWN counters, and nothing else. */
  readonly quota: OperationLedgerState;
  readonly concurrency: readonly ConcurrencyCounter[];
  readonly funding: FundingRequest;
  readonly pricing: PricingRequest | null;
}

export type Admission =
  | {
      readonly allowed: true;
      /** `null` for Search, which reserves nothing, and for BYOK work with no usable price. */
      readonly reservation: Reservation | null;
      /** Recorded for BYOK work when a usable price exists; always a zero founder debit. */
      readonly byokEstimate: ByokEstimate | null;
      readonly metadata: RateLimitMetadata;
    }
  | {
      readonly allowed: false;
      readonly reason: AdmissionDenialReason;
      readonly metadata: RateLimitMetadata;
    };

/**
 * Rate-limit metadata for the requesting organisation. Reads the tenant's own matched counter, or
 * falls back to the published default cell for its plan tier. NEVER reads the "System hard
 * protection" column and never reads another tenant's state (PRD §38.5).
 */
export function rateLimitMetadataOf(input: AdmissionInput): RateLimitMetadata {
  const ledger = QUOTA_LEDGER_BY_OPERATION[input.operation];
  const counter = ledger === null ? null : counterFor(ledger, input.quota);
  if (counter !== null) {
    const remaining = counter.limit - counter.used;
    return {
      limit: counter.limit,
      remaining: remaining > 0 ? remaining : 0,
      resetAtEpochMs: counter.resetAtEpochMs,
    };
  }
  const cell = limitCellFor(LIMIT_BOUNDARY_BY_OPERATION[input.operation], input.tier);
  const limit = cell === null || cell.count === null ? 0 : cell.count;
  return { limit, remaining: limit, resetAtEpochMs: input.nowEpochMs };
}

function quotaExhausted(input: AdmissionInput): boolean {
  const ledger = QUOTA_LEDGER_BY_OPERATION[input.operation];
  if (ledger === null) return false;
  const counter = counterFor(ledger, input.quota);
  if (counter === null) return false;
  return counter.used >= counter.limit;
}

function concurrencyExhausted(input: AdmissionInput): boolean {
  const boundary = CONCURRENCY_BOUNDARY_BY_OPERATION[input.operation];
  if (boundary === null) return false;
  for (const counter of input.concurrency) {
    if (counter.boundary === boundary) return counter.inFlight >= counter.limit;
  }
  return false;
}

const founderCanFund = (
  reserveClass: FounderReserveClass,
  state: FounderLedgerState,
  amountMicroAud: MicroAud,
): boolean => availableForClass(reserveClass, state) >= amountMicroAud;

export function admit(input: AdmissionInput): Admission {
  const metadata = rateLimitMetadataOf(input);

  // 1. Search never consults a generation ledger, provider health, price data or funding balance.
  if (input.operation === 'SEARCH') {
    if (quotaExhausted(input)) {
      return { allowed: false, reason: 'RATE_LIMITED', metadata };
    }
    return { allowed: true, reservation: null, byokEstimate: null, metadata };
  }

  // 2. Provider health.
  if (!input.generationAvailable) {
    return { allowed: false, reason: 'GENERATION_UNAVAILABLE', metadata };
  }

  // 3. Fail closed on price/FX data, split by who pays.
  const founderFunded = input.funding.kind === 'FOUNDER_PLATFORM_BUDGET';
  const byok = input.funding.kind === 'CUSTOMER_PREPAID_OR_BYOK' && input.funding.mode === 'BYOK';
  const validity =
    input.pricing === null
      ? ({ ok: false, cause: 'ABSENT' } as const)
      : validatePricing(
          input.pricing.price,
          input.pricing.fx,
          input.nowEpochMs,
          input.pricing.maxAgeMs,
        );

  if (!validity.ok) {
    if (!byok || validity.cause === 'MALFORMED') {
      return { allowed: false, reason: 'PRICE_DATA_UNAVAILABLE', metadata };
    }
  }

  // 4. Operation quota.
  if (quotaExhausted(input)) {
    return { allowed: false, reason: 'RATE_LIMITED', metadata };
  }

  // 5. Concurrency.
  if (concurrencyExhausted(input)) {
    return { allowed: false, reason: 'CONCURRENCY_LIMIT', metadata };
  }

  // BYOK admitted without usable price data: nothing to reserve, nothing to estimate.
  if (!validity.ok) {
    return { allowed: true, reservation: null, byokEstimate: null, metadata };
  }

  const pricing = input.pricing;
  if (pricing === null) {
    // Unreachable: a null pricing request yields `ok: false` above. Kept for totality.
    return { allowed: false, reason: 'PRICE_DATA_UNAVAILABLE', metadata };
  }

  const reservation = reserve({
    reservationId: pricing.reservationId,
    maxInputTokens: pricing.maxInputTokens,
    maxOutputTokens: pricing.maxOutputTokens,
    price: validity.price,
    fx: validity.fx,
  });

  // 6. Funding-ledger balance. Both this gate and steps 4-5 must pass (PRD §42.6).
  if (founderFunded) {
    const funding = input.funding;
    if (
      funding.kind !== 'FOUNDER_PLATFORM_BUDGET' ||
      !founderCanFund(funding.reserveClass, funding.state, reservation.amountMicroAud)
    ) {
      return { allowed: false, reason: 'CREDIT_LIMIT_REACHED', metadata };
    }
    return { allowed: true, reservation, byokEstimate: null, metadata };
  }

  if (byok) {
    const byokEstimate = recordByokEstimate({
      usage: { inputTokens: pricing.maxInputTokens, outputTokens: pricing.maxOutputTokens },
      price: validity.price,
      fx: validity.fx,
    });
    return { allowed: true, reservation, byokEstimate, metadata };
  }

  const funding = input.funding;
  if (
    funding.kind !== 'CUSTOMER_PREPAID_OR_BYOK' ||
    funding.mode !== 'PREPAID' ||
    funding.prepaidBalanceMicroAud < reservation.amountMicroAud
  ) {
    return { allowed: false, reason: 'CREDIT_LIMIT_REACHED', metadata };
  }
  return { allowed: true, reservation, byokEstimate: null, metadata };
}
