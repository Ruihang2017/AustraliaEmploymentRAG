/**
 * FND-09 — the reserve/settle sequence simulator behind the ceiling property (ticket acceptance item 3,
 * OPS-003's hard stop).
 *
 * It is parameterised over the admit function so a DELIBERATELY WRONG implementation can be fed to it:
 * `ceiling.property.test.ts` runs the real `admit` and asserts no violation, then runs an `admit` that
 * ignores outstanding holds and asserts the harness DOES report a violation. Without that second run a
 * green property proves nothing — a harness that reports no violation because it checks nothing is
 * indistinguishable from a correct module.
 *
 * Sequences are interleaved on purpose: settlements pick a RANDOM outstanding reservation, not the
 * oldest, and cancellations are drawn from the same pool. A sequential-only generator would never
 * produce the double-spend case (two reservations outstanding at once), which is the single most likely
 * defect in this ticket.
 */
import {
  admit as realAdmit,
  availableForClass,
  settle,
  ZERO_MICRO_AUD,
  reservationId,
  type Admission,
  type AdmissionInput,
  type FounderLedgerState,
  type FounderReserveClass,
  type FundingLedgerKind,
  type FxSnapshot,
  type MicroAud,
  type OperationClass,
  type PriceSnapshot,
  type QuotaState,
  type Reservation,
} from '../../src/budget/index.js';
import type { Rng } from './rng.js';

export type AdmitFn = (input: AdmissionInput) => Admission;

export const RESERVE_CLASSES: readonly FounderReserveClass[] = [
  'PRODUCTION_INCIDENT_OR_SAFETY_CHECK',
  'ACTIVE_TRIAL_COMMITMENT',
  'INTERNAL_TESTING',
  'DISCRETIONARY_DEEP',
];

export const FUNDED_OPERATIONS: readonly OperationClass[] = ['QUICK', 'DEEP'];

/**
 * A small fixed table of price/FX pairs — an AUD-quoted identity conversion, a cross-currency pair with
 * a safety margin, and a near-free price that exercises the rounding floor. Fixed, so a failure
 * reproduces from the printed seed. These are synthetic test amounts, not any provider's real prices.
 */
export const PRICE_TABLE: readonly { readonly price: PriceSnapshot; readonly fx: FxSnapshot }[] = [
  {
    price: {
      currency: 'AUD',
      microPerMillionInputTokens: 3_000_000n,
      microPerMillionOutputTokens: 15_000_000n,
      recordedAt: 1_000n,
    },
    fx: {
      fromCurrency: 'AUD',
      toCurrency: 'AUD',
      microAudPerUnit: 1_000_000n,
      safetyMarginBasisPoints: 0n,
      recordedAt: 1_000n,
    },
  },
  {
    price: {
      currency: 'USD',
      microPerMillionInputTokens: 2_500_000n,
      microPerMillionOutputTokens: 10_000_000n,
      recordedAt: 900n,
    },
    fx: {
      fromCurrency: 'USD',
      toCurrency: 'AUD',
      microAudPerUnit: 1_500_000n,
      safetyMarginBasisPoints: 500n,
      recordedAt: 950n,
    },
  },
  {
    price: {
      currency: 'AUD',
      microPerMillionInputTokens: 1n,
      microPerMillionOutputTokens: 1n,
      recordedAt: 1_000n,
    },
    fx: {
      fromCurrency: 'AUD',
      toCurrency: 'AUD',
      microAudPerUnit: 1_000_000n,
      safetyMarginBasisPoints: 0n,
      recordedAt: 1_000n,
    },
  },
];

export const NOW = 1_000n;
export const MAX_PRICE_AGE_MILLIS = 86_400_000n;

/** Counters generous enough that the funding gate, not the quota gate, decides every admission. */
export function generousQuota(): QuotaState {
  const counter = { limit: 1_000_000n, used: 0n, resetAt: 60_000n };
  return {
    counters: {
      SEARCH: counter,
      ANSWER_CREDITS: counter,
      ADVANCED_TASK_CREDITS: counter,
      API_CALLS: counter,
      PROVIDER_COST: counter,
    },
    concurrency: { QUICK: counter, DEEP: counter, EXPORT: counter },
  };
}

export function zeroAllowances(): Record<FounderReserveClass, MicroAud> {
  return {
    PRODUCTION_INCIDENT_OR_SAFETY_CHECK: ZERO_MICRO_AUD,
    ACTIVE_TRIAL_COMMITMENT: ZERO_MICRO_AUD,
    INTERNAL_TESTING: ZERO_MICRO_AUD,
    DISCRETIONARY_DEEP: ZERO_MICRO_AUD,
  };
}

export interface SequenceOptions {
  /** The founder ceiling this sequence runs against. */
  readonly ceilingMicroAud: MicroAud;
  /** `true` => every request is BYOK, so the founder ledger must never move. */
  readonly byokOnly: boolean;
  readonly operations: number;
  readonly maxInputTokens: bigint;
  readonly maxOutputTokens: bigint;
}

export interface SequenceResult {
  readonly violations: readonly string[];
  readonly settledMicroAud: bigint;
  readonly heldMicroAud: bigint;
  readonly peakCommittedMicroAud: bigint;
  readonly admitted: number;
  readonly denied: number;
  readonly settlements: number;
  readonly cancellations: number;
}

/**
 * Runs one interleaved reserve/settle/cancel sequence and reports every invariant violation it saw.
 *
 * Invariants, checked AFTER EVERY OPERATION rather than only at the end:
 *  1. settled <= ceiling                          — the 100% hard stop (OPS-003);
 *  2. settled + held <= ceiling                   — the double-spend case: a ceiling checked only
 *                                                   against settled spend passes (1) and fails here;
 *  3. every admission was within `availableForClass` of the state BEFORE it;
 *  4. BYOK sequences never move the founder ledger at all.
 */
export function runSequence(admitFn: AdmitFn, rng: Rng, options: SequenceOptions): SequenceResult {
  const violations: string[] = [];
  const outstanding = new Map<string, Reservation>();
  let settled = 0n;
  let held = 0n;
  let peak = 0n;
  let admitted = 0;
  let denied = 0;
  let settlements = 0;
  let cancellations = 0;

  const ledger: FundingLedgerKind = options.byokOnly
    ? 'CUSTOMER_PREPAID_OR_BYOK'
    : 'FOUNDER_PLATFORM_BUDGET';

  for (let step = 0; step < options.operations; step += 1) {
    const choice = outstanding.size === 0 ? 0 : rng.int(3);

    if (choice === 0) {
      const reserveClass = rng.pick(RESERVE_CLASSES);
      const { price, fx } = rng.pick(PRICE_TABLE);
      const founder: FounderLedgerState = {
        ceilingMicroAud: options.ceilingMicroAud,
        settledMicroAud: settled as MicroAud,
        heldMicroAud: held as MicroAud,
        unspentAllowanceMicroAud: zeroAllowances(),
      };
      const availableBefore = availableForClass(reserveClass, founder);
      const decision = admitFn({
        request: {
          reservationId: reservationId(`rsv-${String(step)}-${String(rng.seed)}`),
          operation: rng.pick(FUNDED_OPERATIONS),
          reserveClass,
          profileCeiling: {
            maxInputTokens: rng.bigint(options.maxInputTokens) + 1n,
            maxOutputTokens: rng.bigint(options.maxOutputTokens) + 1n,
          },
          requestedMaxInputTokens: rng.bigint(options.maxInputTokens) + 1n,
          requestedMaxOutputTokens: rng.bigint(options.maxOutputTokens) + 1n,
        },
        tier: rng.bool() ? 'TRIAL' : 'PAID_PILOT',
        ledger,
        founder,
        customer: options.byokOnly
          ? { mode: 'BYOK', prepaidRemainingMicroAud: ZERO_MICRO_AUD }
          : null,
        quota: generousQuota(),
        price,
        fx,
        now: NOW,
        maxPriceAgeMillis: MAX_PRICE_AGE_MILLIS,
        generationAvailable: true,
      });

      if (decision.allowed) {
        admitted += 1;
        const reservation = decision.reservation;
        if (reservation !== null && reservation.founderDebitApplies) {
          if (reservation.amountMicroAud > availableBefore) {
            violations.push(
              `admitted ${reservation.amountMicroAud.toString()} against available ${availableBefore.toString()} (invariant 3)`,
            );
          }
          outstanding.set(reservation.reservationId, reservation);
          held += reservation.amountMicroAud;
        }
      } else {
        denied += 1;
      }
    } else {
      const keys = [...outstanding.keys()];
      const key = rng.pick(keys);
      const reservation = outstanding.get(key);
      if (reservation === undefined) throw new Error('harness: outstanding reservation vanished');
      outstanding.delete(key);
      const executed = choice === 1;
      if (executed) settlements += 1;
      else cancellations += 1;
      const settlement = settle(reservation, {
        executed,
        inputTokens: rng.bigint(reservation.effectiveMaxInputTokens + 1n),
        outputTokens: rng.bigint(reservation.effectiveMaxOutputTokens + 1n),
      });
      if (settlement.debitMicroAud + settlement.releaseMicroAud !== reservation.amountMicroAud) {
        violations.push(`settlement drift on ${key}`);
      }
      settled += settlement.debitMicroAud;
      held -= reservation.amountMicroAud;
    }

    if (settled > options.ceilingMicroAud) {
      violations.push(`settled ${settled.toString()} exceeds ceiling (invariant 1) at step ${String(step)}`);
    }
    if (settled + held > options.ceilingMicroAud) {
      violations.push(
        `settled+held ${(settled + held).toString()} exceeds ceiling (invariant 2) at step ${String(step)}`,
      );
    }
    if (options.byokOnly && (settled !== 0n || held !== 0n)) {
      violations.push(`BYOK sequence moved the founder ledger (invariant 4) at step ${String(step)}`);
    }
    if (settled + held > peak) peak = settled + held;
  }

  return {
    violations,
    settledMicroAud: settled,
    heldMicroAud: held,
    peakCommittedMicroAud: peak,
    admitted,
    denied,
    settlements,
    cancellations,
  };
}

/** The real module under test. */
export const correctAdmit: AdmitFn = realAdmit;

/**
 * The deliberately wrong implementation of the non-vacuity control: it hides outstanding holds from
 * the ceiling check, which is exactly the "check the ceiling against settled spend only" bug that
 * admits two concurrent requests against the same remaining balance.
 */
export const admitIgnoringHolds: AdmitFn = (input) =>
  realAdmit({ ...input, founder: { ...input.founder, heldMicroAud: ZERO_MICRO_AUD } });
