/**
 * FND-09 — the input/output vocabulary of the budget leaf. Types only; nothing executable except the
 * two branded constructors, which validate shape and nothing else.
 *
 * Rules that hold across every declaration below:
 *
 * - every amount is `MicroAud`; every count, token count and timestamp is a `bigint`. The single
 *   `number` in this leaf is `BudgetProfile.warningThresholdRatio` (see `profile.ts`), and it is
 *   documentation, never arithmetic (PRD §34.1, sub-PRD D15);
 * - the current time never comes from a clock: `now` is an input (`EpochMillis`), as are the price
 *   snapshot, the FX snapshot and every ledger balance (deliverable 12, PRD §39.1/§45.2);
 * - nothing here names a provider, a model or a hosted price. A "model profile" is reduced to token
 *   ceilings, so the benchmark-selected model of breakdown plan §8 Q1 needs no change in this package.
 */
import type { FundingLedger } from './contracts.js';
import type { MicroAud } from './micro-aud.js';

/** FND-03's funding ledger, under deliverable 9's name. Defined there; never redefined here. */
export type FundingLedgerKind = FundingLedger;

/** Milliseconds since the Unix epoch, supplied by the caller. Never read from a clock in this leaf. */
export type EpochMillis = bigint;

declare const reservationIdBrand: unique symbol;

/**
 * A caller-supplied reservation identifier.
 *
 * WHY CALLER-SUPPLIED (plan OQ-3): FND-03's `RESOURCE_KINDS` has no reservation prefix, and minting a
 * UUIDv7 needs a clock and randomness — both banned by deliverable 12. `EVID-08` mints the id (where a
 * clock legitimately exists) and hands it in. If a typed `Id<'rsv'>` is wanted later, that is a prefix
 * addition against FND-03, not a local change here.
 */
export type ReservationId = string & { readonly [reservationIdBrand]: 'ReservationId' };

/** Shape check only: a non-empty identifier. Meaning and uniqueness belong to the caller. */
export function reservationId(value: string): ReservationId {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RangeError('reservationId: must be a non-empty string');
  }
  return value as ReservationId;
}

/**
 * A recorded provider price.
 *
 * Prices are quoted per MILLION tokens so every field stays an exact integer: any realistic per-token
 * price is expressible without a fraction, which is what keeps PRD §34.1's "never floating point"
 * satisfiable (plan §6 — this is why no money-representation ADR fires). `currency` is the ISO-4217
 * code the price is quoted in and is opaque here; the FX snapshot converts it.
 */
export interface PriceSnapshot {
  readonly currency: string;
  readonly microPerMillionInputTokens: bigint;
  readonly microPerMillionOutputTokens: bigint;
  readonly recordedAt: EpochMillis;
}

/** A recorded daily FX rate plus the configurable safety margin of PRD §42.6. */
export interface FxSnapshot {
  readonly fromCurrency: string;
  readonly toCurrency: 'AUD';
  /** Micro-AUD per one unit of `fromCurrency`. An AUD-quoted price uses `1_000_000n` and margin `0n`. */
  readonly microAudPerUnit: bigint;
  readonly safetyMarginBasisPoints: bigint;
  readonly recordedAt: EpochMillis;
}

/** Model-agnostic profile: token ceilings only. No name, no price, no provider (breakdown plan §8 Q1). */
export interface ProfileCeiling {
  readonly maxInputTokens: bigint;
  readonly maxOutputTokens: bigint;
}

export type OperationClass =
  | 'SEARCH'
  | 'QUICK'
  | 'DEEP'
  | 'EXPORT'
  | 'API_CALL'
  | 'WIDGET_SESSION'
  | 'WEBHOOK_ENDPOINT';

/** The five separate ledgers of PRD §38.5's closing sentence. */
export type QuotaLedgerKind =
  | 'SEARCH'
  | 'ANSWER_CREDITS'
  | 'ADVANCED_TASK_CREDITS'
  | 'API_CALLS'
  | 'PROVIDER_COST';

export type ConcurrencyBoundary = 'QUICK' | 'DEEP' | 'EXPORT';

export type Tier = 'TRIAL' | 'PAID_PILOT';

/**
 * Module-local (plan OQ-6): FND-03's `FundingLedger` merges both into `CUSTOMER_PREPAID_OR_BYOK`,
 * while PRD §42.6 treats BYOK differently (it records an estimate and debits nothing). If a second
 * module needs the distinction it becomes a contracts enum under FND-03, per sub-PRD D10.
 */
export type CustomerFundingMode = 'PREPAID' | 'BYOK';

export interface QuotaCounter {
  readonly limit: bigint;
  readonly used: bigint;
  readonly resetAt: EpochMillis;
}

/** Supplied balances. This leaf computes decisions over them and never persists or mutates them. */
export interface QuotaState {
  readonly counters: Readonly<Record<QuotaLedgerKind, QuotaCounter>>;
  readonly concurrency: Readonly<Record<ConcurrencyBoundary, QuotaCounter>>;
}

/** PRD §42.6's founder-funded reserve order, highest priority first. */
export type FounderReserveClass =
  | 'PRODUCTION_INCIDENT_OR_SAFETY_CHECK'
  | 'ACTIVE_TRIAL_COMMITMENT'
  | 'INTERNAL_TESTING'
  | 'DISCRETIONARY_DEEP';

export interface FounderLedgerState {
  /** Normally `BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud`; an input so a test can shrink it. */
  readonly ceilingMicroAud: MicroAud;
  /** Month-to-date settled debits. */
  readonly settledMicroAud: MicroAud;
  /** Outstanding, unsettled reservations. Admission subtracts these: see `reserve-order.ts`. */
  readonly heldMicroAud: MicroAud;
  /** Per-class allowance still unspent, held back from lower-priority classes. */
  readonly unspentAllowanceMicroAud: Readonly<Record<FounderReserveClass, MicroAud>>;
}

export interface CustomerLedgerState {
  readonly mode: CustomerFundingMode;
  /** Meaningless — and ignored — when `mode === 'BYOK'`: BYOK funds the provider directly. */
  readonly prepaidRemainingMicroAud: MicroAud;
}

/** The seven independent generation-ledger signals `isSearchAffected` is total over (2^7 = 128 states). */
export interface GenerationLedgerState {
  readonly founderCeilingReached: boolean;
  readonly warningCrossed: boolean;
  readonly answerCreditsExhausted: boolean;
  readonly advancedTaskCreditsExhausted: boolean;
  readonly providerCostExhausted: boolean;
  readonly priceDataAvailable: boolean;
  readonly generationAvailable: boolean;
}

export interface ReservationRequest {
  readonly reservationId: ReservationId;
  readonly operation: OperationClass;
  /** Always explicit — PRD §42.6's ordering cannot be evaluated from an inferred purpose (ticket obligation 5). */
  readonly reserveClass: FounderReserveClass;
  readonly profileCeiling: ProfileCeiling;
  readonly requestedMaxInputTokens: bigint;
  readonly requestedMaxOutputTokens: bigint;
}

export interface Reservation {
  readonly reservationId: ReservationId;
  readonly amountMicroAud: MicroAud;
  /** Carried so settlement can never be computed against a different price than admission was. */
  readonly priceSnapshot: PriceSnapshot;
  readonly fxSnapshot: FxSnapshot;
  readonly effectiveMaxInputTokens: bigint;
  readonly effectiveMaxOutputTokens: bigint;
  readonly ledger: FundingLedgerKind;
  readonly reserveClass: FounderReserveClass;
  /** `true` exactly when `isFounderLiability(ledger)` — BYOK/prepaid work never debits founder funds. */
  readonly founderDebitApplies: boolean;
}

export interface ActualUsage {
  /** `false` => cancelled before the provider stage: the full reservation is released (`UAT-ANS-07`). */
  readonly executed: boolean;
  readonly inputTokens: bigint;
  readonly outputTokens: bigint;
}

export interface Settlement {
  readonly debitMicroAud: MicroAud;
  readonly releaseMicroAud: MicroAud;
  /**
   * Actual cost beyond the reservation, when a provider reports more tokens than were reserved.
   *
   * `0n` for every in-bounds usage. The debit stays capped at the reservation so the ceiling invariant
   * and `debit + release === amount` both hold; the excess is reported rather than debited, because
   * debiting it would breach the A$50 stop that OPS-003 requires (plan risk R3 / OQ-5 — `EVID-08`
   * decides what a non-zero overrun means operationally).
   */
  readonly overrunMicroAud: MicroAud;
}

export type AdmissionDenialReason =
  | 'CREDIT_LIMIT_REACHED'
  | 'RATE_LIMITED'
  | 'GENERATION_UNAVAILABLE'
  | 'PRICE_DATA_UNAVAILABLE'
  | 'CONCURRENCY_LIMIT';

/**
 * The caller's `Retry-After` material (PRD §38.5). Derived ONLY from the requesting organisation's own
 * counter — never from the founder ledger, never from a global/system value, never from another
 * tenant's state.
 */
export interface RateLimitMetadata {
  readonly limit: bigint;
  readonly remaining: bigint;
  readonly resetAt: EpochMillis;
}

export type Admission =
  | { readonly allowed: true; readonly reservation: Reservation | null; readonly metadata: RateLimitMetadata }
  | { readonly allowed: false; readonly reason: AdmissionDenialReason; readonly metadata: RateLimitMetadata };

export interface AdmissionInput {
  readonly request: ReservationRequest;
  readonly tier: Tier;
  readonly ledger: FundingLedgerKind;
  readonly founder: FounderLedgerState;
  /** `null` for founder-funded work. */
  readonly customer: CustomerLedgerState | null;
  readonly quota: QuotaState;
  /** `null` means absent — the fail-closed input of PRD §42.6's final sentence. */
  readonly price: PriceSnapshot | null;
  readonly fx: FxSnapshot | null;
  readonly now: EpochMillis;
  readonly maxPriceAgeMillis: bigint;
  /** Provider/circuit-breaker state, supplied by `EVID-08`. Never probed from here. */
  readonly generationAvailable: boolean;
}

export interface ReserveInput {
  readonly request: ReservationRequest;
  readonly ledger: FundingLedgerKind;
  readonly price: PriceSnapshot;
  readonly fx: FxSnapshot;
  readonly now: EpochMillis;
  readonly maxPriceAgeMillis: bigint;
}
