/**
 * FND-09 deliverables 9 and 10 — funding-ledger separation, made structural.
 *
 * PRD §38.5: *"Search, answer credits, advanced-task credits, API calls and provider cost are
 * separate ledgers; exhausting one does not misreport the others."* The guarantee is enforced by
 * SHAPE, not by discipline: `remainingOf` reads exactly one counter, and THIS MODULE EXPORTS NO
 * CROSS-DEBIT FUNCTION and no "spend one credit from wherever" helper. That absence is the
 * deliverable; `test/budget/ledgers.test.ts` pins the whole public export set against an allow-list
 * so a future cross-debit helper fails the suite by construction.
 *
 * PRD §24.4: *"the system MUST NOT create unsecured founder liability."* `recordByokEstimate` records
 * the estimate for visibility (PRD §42.6) and CANNOT produce a non-zero founder debit — the field is
 * the literal `ZERO_MICRO_AUD`, not a computed value.
 *
 * PRD §8.2: *"Search MUST remain usable when the AI budget is exhausted"*, and PRD §36.8's final row
 * (*"Job unavailable; Search and saved records remain available"*). `isSearchAffected` returns the
 * literal type `false`, so an edit that returns `true` fails `pnpm typecheck` as well as the test.
 *
 * The funding-ledger members themselves are `FND-03`'s (sub-PRD decision **D6**). They are imported
 * TYPE-ONLY, deep and relative: `packages/contracts/src/index.ts` is still the empty skeleton entry
 * file and no workspace dependency may be declared (`tools/tests/skeleton.test.mjs`), so
 * `@taxrag/contracts` resolves to nothing at runtime. `verbatimModuleSyntax` erases an `import type`
 * completely, so there is ZERO runtime cross-package import while `tsc` still resolves the real file.
 * `FOUNDER_LIABILITY_BY_LEDGER` then uses `satisfies` to stay exhaustive over that enum: if `FND-03`
 * adds a ledger kind, typecheck fails here rather than silently defaulting.
 *
 * Pure: no clock, no randomness, no I/O (PRD §39.1, §45.2).
 */
import type { FundingLedger } from '../../../contracts/src/enums/funding-ledger.js';
import { deepFreeze } from './frozen.js';
import { ZERO_MICRO_AUD, type MicroAud } from './micro-aud.js';
import { costOf, type FxSnapshot, type PriceSnapshot, type TokenUsage } from './pricing.js';
import type { FounderReserveClass } from './reserve-order.js';

/** `FND-03` owns the members (sub-PRD D6); this is an alias, not a second declaration. */
export type FundingLedgerKind = FundingLedger;

/** Compile-time exhaustive over `FND-03`'s enum: adding a ledger kind breaks typecheck here. */
export const FOUNDER_LIABILITY_BY_LEDGER = deepFreeze({
  FOUNDER_PLATFORM_BUDGET: true,
  CUSTOMER_PREPAID_OR_BYOK: false,
} as const) satisfies Readonly<Record<FundingLedgerKind, boolean>>;

/** Whether a debit against this ledger increases founder liability (PRD §24.4, §42.6). */
export const isFounderLiability = (kind: FundingLedgerKind): boolean =>
  FOUNDER_LIABILITY_BY_LEDGER[kind];

/** The five separate ledgers PRD §38.5 names, in PRD order. */
export const OPERATION_LEDGER_VALUES = deepFreeze([
  'SEARCH',
  'ANSWER_CREDITS',
  'ADVANCED_TASK_CREDITS',
  'API_CALLS',
  'PROVIDER_COST',
] as const);

export type OperationLedger = (typeof OPERATION_LEDGER_VALUES)[number];

/** One ledger's counter. Counts, not money — `PROVIDER_COST` is bounded by the founder ledger. */
export interface LedgerCounter {
  readonly ledger: OperationLedger;
  readonly limit: number;
  readonly used: number;
  readonly resetAtEpochMs: number;
}

/** The requesting organisation's own counters. One entry per ledger it has consumption for. */
export interface OperationLedgerState {
  readonly counters: readonly LedgerCounter[];
}

/** The counter for exactly one ledger, or `null` if the caller supplied none. */
export function counterFor(
  ledger: OperationLedger,
  state: OperationLedgerState,
): LedgerCounter | null {
  for (const counter of state.counters) {
    if (counter.ledger === ledger) return counter;
  }
  return null;
}

/**
 * Remaining allowance on exactly one ledger. Reads that ledger's counter and nothing else, which is
 * what makes "exhausting one does not misreport the others" true by construction (PRD §38.5).
 * `null` when the caller supplied no counter for the ledger — absence is not zero.
 */
export function remainingOf(ledger: OperationLedger, state: OperationLedgerState): number | null {
  const counter = counterFor(ledger, state);
  if (counter === null) return null;
  const remaining = counter.limit - counter.used;
  return remaining > 0 ? remaining : 0;
}

/**
 * The founder platform budget for one period. `periodKey` (for example `'2026-08'`) is an opaque
 * caller-supplied string: this module has no clock and never derives a month.
 *
 * `outstandingReservationsMicroAud` is REQUIRED. See `reserve-order.ts` for why omitting it would
 * permit a double spend across interleaved reservations.
 */
export interface FounderLedgerState {
  readonly periodKey: string;
  readonly ceilingMicroAud: MicroAud;
  readonly monthToDateDebitMicroAud: MicroAud;
  readonly outstandingReservationsMicroAud: MicroAud;
  readonly allowances: Readonly<Record<FounderReserveClass, MicroAud>>;
  readonly consumed: Readonly<Record<FounderReserveClass, MicroAud>>;
}

/**
 * Generation-side ledger state. `isSearchAffected` is total over every inhabitant of this type; the
 * suite enumerates the boundary cross-product exhaustively rather than sampling.
 */
export interface GenerationLedgerState {
  readonly answerCreditsRemaining: number;
  readonly advancedTaskCreditsRemaining: number;
  readonly providerCostRemainingMicroAud: MicroAud;
  readonly founderBudgetExhausted: boolean;
  readonly generationAvailable: boolean;
  readonly pricingValid: boolean;
  readonly ledger: FundingLedgerKind;
}

/**
 * PRD §8.2 and §36.8: Search is never disabled by a generation ledger. The return type is the literal
 * `false`, so this cannot be weakened without failing typecheck. It exists so `RUNT-02` cannot
 * accidentally gate Search on a generation ledger (OPS-003 "search remains usable").
 */
export function isSearchAffected(state: GenerationLedgerState): false {
  // The parameter is deliberately unread: no generation-ledger state may influence this answer.
  void state;
  return false;
}

export interface ByokEstimateInput {
  readonly usage: TokenUsage;
  readonly price: PriceSnapshot;
  readonly fx: FxSnapshot;
}

export interface ByokEstimate {
  readonly estimatedCostMicroAud: MicroAud;
  /** Always exactly zero. PRD §24.4 forbids unsecured founder liability. */
  readonly founderDebitMicroAud: MicroAud;
  readonly ledger: 'CUSTOMER_PREPAID_OR_BYOK';
  readonly priceSnapshot: PriceSnapshot;
  readonly fxSnapshot: FxSnapshot;
}

/**
 * Records a BYOK estimate for visibility (PRD §42.6 *"BYOK still records estimated usage/cost for
 * visibility but does not debit founder funds"*). `founderDebitMicroAud` is the literal
 * `ZERO_MICRO_AUD`, not a computed value, so no input can make it non-zero.
 */
export function recordByokEstimate(input: ByokEstimateInput): ByokEstimate {
  return {
    estimatedCostMicroAud: costOf(input.usage, input.price, input.fx),
    founderDebitMicroAud: ZERO_MICRO_AUD,
    ledger: 'CUSTOMER_PREPAID_OR_BYOK',
    priceSnapshot: input.price,
    fxSnapshot: input.fx,
  };
}
