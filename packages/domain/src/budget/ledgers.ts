/**
 * FND-09 deliverables 9 and 10 — ledger separation made structural, and the Search invariant.
 *
 * PRD §38.5: *"Search, answer credits, advanced-task credits, API calls and provider cost are separate
 * ledgers; exhausting one does not misreport the others."*
 *
 * The separation is enforced by ABSENCE: `remainingOf` reads exactly one counter and nothing else,
 * there is no function anywhere in this leaf that takes two `QuotaLedgerKind`s, and no transfer,
 * borrow, top-up or convert exists in the public surface. `test/budget/public-surface.test.ts` asserts
 * the exported name list, so adding a cross-debit function is a failing test rather than a review miss.
 */
import { deepFreeze } from './deep-freeze.js';
import { ZERO_MICRO_AUD, type MicroAud } from './micro-aud.js';
import { costMicroAud, validatePriceData } from './pricing.js';
import type {
  EpochMillis,
  FundingLedgerKind,
  FxSnapshot,
  GenerationLedgerState,
  PriceSnapshot,
  QuotaLedgerKind,
  QuotaState,
} from './types.js';

/** PRD §38.5's five separate ledgers, in the order that sentence names them. */
export const QUOTA_LEDGER_KINDS: readonly QuotaLedgerKind[] = deepFreeze([
  'SEARCH',
  'ANSWER_CREDITS',
  'ADVANCED_TASK_CREDITS',
  'API_CALLS',
  'PROVIDER_COST',
] as const);

/**
 * Remaining allowance of ONE ledger, floored at zero.
 *
 * Deliberately single-kind: a function taking a second `QuotaLedgerKind` would be the shape of a
 * cross-debit, which PRD §38.5 forbids.
 */
export function remainingOf(state: QuotaState, kind: QuotaLedgerKind): bigint {
  const counter = state.counters[kind];
  const remaining = counter.limit - counter.used;
  return remaining <= 0n ? 0n : remaining;
}

/**
 * Does this funding ledger create founder liability?
 *
 * Only `FOUNDER_PLATFORM_BUDGET` does. `CUSTOMER_PREPAID_OR_BYOK` is prepaid or BYOK by definition
 * (PRD §24.4: *"the system MUST NOT create unsecured founder liability"*).
 */
export function isFounderLiability(kind: FundingLedgerKind): boolean {
  return kind === 'FOUNDER_PLATFORM_BUDGET';
}

export interface ByokEstimateInput {
  readonly inputTokens: bigint;
  readonly outputTokens: bigint;
  readonly price: PriceSnapshot | null;
  readonly fx: FxSnapshot | null;
  readonly now: EpochMillis;
  readonly maxPriceAgeMillis: bigint;
}

export interface ByokEstimate {
  /** `null` when price or FX data is unavailable — BYOK work still proceeds; only visibility is lost. */
  readonly estimateMicroAud: MicroAud | null;
  /** Always exactly `0n`. See below. */
  readonly founderDebitMicroAud: MicroAud;
  readonly priceAvailable: boolean;
}

/**
 * PRD §42.6: *"BYOK still records estimated usage/cost for visibility but does not debit founder
 * funds."*
 *
 * `founderDebitMicroAud` is the CONSTANT `ZERO_MICRO_AUD`, not a computed value that happens to be
 * zero: there is no code path in this function that can produce anything else.
 *
 * The fail-closed rule of §42.6 is about *founder-funded* calls, so missing price data does not stop
 * BYOK work — it only makes the estimate `null`. BYOK creates no founder liability, so there is
 * nothing to fail closed over.
 */
export function recordByokEstimate(input: ByokEstimateInput): ByokEstimate {
  const problem = validatePriceData(input.price, input.fx, input.now, input.maxPriceAgeMillis);
  if (problem !== null || input.price === null || input.fx === null) {
    return { estimateMicroAud: null, founderDebitMicroAud: ZERO_MICRO_AUD, priceAvailable: false };
  }
  return {
    estimateMicroAud: costMicroAud(input.inputTokens, input.outputTokens, input.price, input.fx),
    founderDebitMicroAud: ZERO_MICRO_AUD,
    priceAvailable: true,
  };
}

/**
 * FND-09 deliverable 10 — PRD §8.2 (*"Search MUST remain usable when the AI budget is exhausted"*) and
 * §36.8's final row (*"Job unavailable; Search and saved records remain available"*).
 *
 * The return type is the LITERAL `false`, so `tsc` rejects any implementation that could ever return
 * `true`: the invariant is compile-enforced, not tested into existence. The parameter is accepted and
 * ignored on purpose — every one of the 128 generation-ledger states maps to the same answer, and
 * `test/budget/search-unaffected.test.ts` enumerates all of them.
 *
 * It exists so `RUNT-02` cannot accidentally gate Search on a generation ledger.
 */
export function isSearchAffected(ledgerState: GenerationLedgerState): false {
  void ledgerState;
  return false;
}
