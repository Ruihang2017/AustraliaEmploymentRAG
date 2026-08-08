/**
 * FND-09 acceptance item "Ceiling property" `[machine]` — requirement **OPS-003**'s 100% hard stop
 * (PRD §42.6, §24.1: *"the system MUST stop before exceeding the founder-funded ceiling"*).
 *
 * >= 10,000 generated, INTERLEAVED reserve/settle sequences (including cancellations and
 * out-of-order settlement) are driven through a simulated founder ledger. After EVERY step:
 *
 *   monthToDateDebit                            <= ceiling
 *   monthToDateDebit + outstandingReservations  <= ceiling
 *
 * and no admission is granted once the class's available balance is below the reservation amount.
 *
 * The suite carries its own NEGATIVE CONTROL: the same harness driven by a deliberately wrong
 * admission rule — one that compares against `ceiling − debit` and ignores outstanding reservations,
 * the classic double-spend across concurrent admissions — MUST be caught by the invariant checker.
 * Without it, a checker that silently passes everything would look identical to a correct module.
 */
import { describe, expect, it } from 'vitest';

import {
  admit,
  type AdmissionInput,
  type ConcurrencyCounter,
} from '../../src/budget/admit.js';
import { BUDGET_PROFILE_V1 } from '../../src/budget/budget-profile.js';
import type { FounderLedgerState } from '../../src/budget/ledgers.js';
import { microAud, type MicroAud } from '../../src/budget/micro-aud.js';
import { reserve, type Reservation } from '../../src/budget/reserve.js';
import { availableForClass, type FounderReserveClass } from '../../src/budget/reserve-order.js';
import { settle } from '../../src/budget/settle.js';
import { generateScenario, usageFor, type AdmitStep } from './sequence-generator.js';

const CEILING = BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud;
const NOW = 1_754_600_000_000;
const MAX_AGE_MS = 86_400_000;

const AMPLE_CONCURRENCY: readonly ConcurrencyCounter[] = [
  { boundary: 'CONCURRENT_QUICK', limit: 1_000_000, inFlight: 0 },
  { boundary: 'CONCURRENT_DEEP', limit: 1_000_000, inFlight: 0 },
  { boundary: 'CONCURRENT_EXPORT', limit: 1_000_000, inFlight: 0 },
];

const zeroByClass = (): Record<FounderReserveClass, MicroAud> => ({
  INCIDENT_OR_SAFETY_CHECK: microAud(0n),
  TRIAL_COMMITMENT: microAud(0n),
  INTERNAL_TESTING: microAud(0n),
  DISCRETIONARY_DEEP: microAud(0n),
});

function admissionInput(step: AdmitStep, state: FounderLedgerState): AdmissionInput {
  return {
    operation: 'DEEP',
    tier: 'PAID_PILOT',
    nowEpochMs: NOW,
    generationAvailable: true,
    quota: {
      counters: [
        {
          ledger: 'ADVANCED_TASK_CREDITS',
          limit: 1_000_000,
          used: 0,
          resetAtEpochMs: NOW + MAX_AGE_MS,
        },
      ],
    },
    concurrency: AMPLE_CONCURRENCY,
    funding: {
      kind: 'FOUNDER_PLATFORM_BUDGET',
      reserveClass: step.reserveClass,
      state,
    },
    pricing: {
      price: step.price,
      fx: step.fx,
      maxAgeMs: MAX_AGE_MS,
      maxInputTokens: step.maxInputTokens,
      maxOutputTokens: step.maxOutputTokens,
      reservationId: step.reservationId,
    },
  };
}

interface Outstanding {
  readonly reservation: Reservation;
  readonly reserveClass: FounderReserveClass;
  readonly maxInputTokens: bigint;
  readonly maxOutputTokens: bigint;
}

interface SimulationResult {
  readonly breaches: string[];
  readonly finalDebit: bigint;
  readonly peakOutstandingCount: number;
  readonly admissions: number;
  readonly denials: number;
  readonly outOfOrderSettlements: number;
}

/**
 * `mode: 'BROKEN'` is the negative control: it admits whenever `ceiling − debit` covers the
 * reservation, ignoring the reservations already outstanding.
 */
function simulate(seed: number, mode: 'REAL' | 'BROKEN'): SimulationResult {
  const scenario = generateScenario(seed);
  const allowances: Record<FounderReserveClass, MicroAud> = {
    INCIDENT_OR_SAFETY_CHECK: microAud(scenario.allowances.INCIDENT_OR_SAFETY_CHECK),
    TRIAL_COMMITMENT: microAud(scenario.allowances.TRIAL_COMMITMENT),
    INTERNAL_TESTING: microAud(scenario.allowances.INTERNAL_TESTING),
    DISCRETIONARY_DEEP: microAud(scenario.allowances.DISCRETIONARY_DEEP),
  };
  const consumed = zeroByClass();
  let debit = 0n;
  let outstandingTotal = 0n;
  const outstanding: Outstanding[] = [];
  const breaches: string[] = [];
  let peakOutstandingCount = 0;
  let admissions = 0;
  let denials = 0;
  let outOfOrderSettlements = 0;

  const stateOf = (): FounderLedgerState => ({
    periodKey: '2026-08',
    ceilingMicroAud: CEILING,
    monthToDateDebitMicroAud: microAud(debit),
    outstandingReservationsMicroAud: microAud(outstandingTotal),
    allowances,
    consumed,
  });

  const check = (label: string): void => {
    if (debit > CEILING) breaches.push(`${label}: debit ${String(debit)} exceeds the ceiling`);
    if (debit + outstandingTotal > CEILING) {
      breaches.push(
        `${label}: debit + outstanding ${String(debit + outstandingTotal)} exceeds the ceiling`,
      );
    }
  };

  for (let index = 0; index < scenario.steps.length; index += 1) {
    const step = scenario.steps[index];
    if (!step) continue;
    const label = `seed ${String(seed)} step ${String(index)}`;

    if (step.kind === 'ADMIT') {
      const state = stateOf();
      const candidate = reserve({
        reservationId: step.reservationId,
        maxInputTokens: step.maxInputTokens,
        maxOutputTokens: step.maxOutputTokens,
        price: step.price,
        fx: step.fx,
      });
      let granted: boolean;
      if (mode === 'REAL') {
        const decision = admit(admissionInput(step, state));
        const expected = availableForClass(step.reserveClass, state) >= candidate.amountMicroAud;
        if (decision.allowed !== expected) {
          breaches.push(`${label}: admission disagreed with availableForClass`);
        }
        granted = decision.allowed && decision.reservation !== null;
      } else {
        granted = CEILING - debit >= candidate.amountMicroAud;
      }
      if (granted) {
        admissions += 1;
        outstanding.push({
          reservation: candidate,
          reserveClass: step.reserveClass,
          maxInputTokens: step.maxInputTokens,
          maxOutputTokens: step.maxOutputTokens,
        });
        outstandingTotal += candidate.amountMicroAud;
        if (outstanding.length > peakOutstandingCount) peakOutstandingCount = outstanding.length;
      } else {
        denials += 1;
      }
      check(label);
      continue;
    }

    if (outstanding.length === 0) continue;
    const at = step.outstandingSelector % outstanding.length;
    if (at !== outstanding.length - 1) outOfOrderSettlements += 1;
    const live = outstanding[at];
    if (!live) continue;
    outstanding.splice(at, 1);
    const actual = usageFor(
      step.shape,
      step.partialPercent,
      live.maxInputTokens,
      live.maxOutputTokens,
    );
    const settlement = settle(live.reservation, actual);
    if (settlement.debitMicroAud + settlement.releaseMicroAud !== live.reservation.amountMicroAud) {
      breaches.push(`${label}: settlement does not balance`);
    }
    debit += settlement.debitMicroAud;
    outstandingTotal -= live.reservation.amountMicroAud;
    consumed[live.reserveClass] = microAud(
      consumed[live.reserveClass] + settlement.debitMicroAud,
    );
    check(label);
  }

  return {
    breaches,
    finalDebit: debit,
    peakOutstandingCount,
    admissions,
    denials,
    outOfOrderSettlements,
  };
}

describe('OPS-003 founder ceiling property', () => {
  const seeds = 10_000;
  const results = Array.from({ length: seeds }, (_unused, seed) => simulate(seed, 'REAL'));

  it('runs at least 10,000 generated sequences (non-vacuity)', () => {
    expect(results).toHaveLength(10_000);
    const totalSteps = results.reduce(
      (sum, result) => sum + result.admissions + result.denials,
      0,
    );
    expect(totalSteps).toBeGreaterThan(40_000);
  });

  it('produces genuinely interleaved, out-of-order sequences (non-vacuity)', () => {
    const interleaved = results.filter((result) => result.peakOutstandingCount >= 2).length;
    const outOfOrder = results.filter((result) => result.outOfOrderSettlements > 0).length;
    expect(interleaved).toBeGreaterThan(1_000);
    expect(outOfOrder).toBeGreaterThan(1_000);
    expect(Math.max(...results.map((result) => result.peakOutstandingCount))).toBeGreaterThan(2);
  });

  it('exercises both admission and denial (non-vacuity)', () => {
    const totalAdmissions = results.reduce((sum, result) => sum + result.admissions, 0);
    const totalDenials = results.reduce((sum, result) => sum + result.denials, 0);
    expect(totalAdmissions).toBeGreaterThan(1_000);
    expect(totalDenials).toBeGreaterThan(100);
  });

  it('never lets cumulative debit, or debit plus outstanding reservations, exceed A$50', () => {
    const breaches = results.flatMap((result) => result.breaches);
    expect(breaches.slice(0, 5)).toEqual([]);
    const worstDebit = results.reduce(
      (worst, result) => (result.finalDebit > worst ? result.finalDebit : worst),
      0n,
    );
    expect(worstDebit).toBeLessThanOrEqual(50_000_000n);
    expect(worstDebit).toBeLessThanOrEqual(CEILING);
  });

  it('NEGATIVE CONTROL: the checker rejects a rule that ignores outstanding reservations', () => {
    let brokenSeeds = 0;
    for (let seed = 0; seed < 2_000; seed += 1) {
      if (simulate(seed, 'BROKEN').breaches.length > 0) brokenSeeds += 1;
    }
    expect(
      brokenSeeds,
      'the invariant checker passed a double-spending admission rule — it is vacuous',
    ).toBeGreaterThan(0);
  });
});
