/**
 * FND-09 deliverables 6 and 7 — admission control (PRD §42.6: *"Admission requires both operation quota
 * and funding-ledger balance"*).
 *
 * THE CHECK ORDER IS PART OF THE SPECIFICATION, because it decides which reason a caller sees when more
 * than one gate fails. It is a fixed list of named guards, evaluated in this sequence, and
 * `test/budget/admission.test.ts` asserts it pairwise:
 *
 *   1. `GENERATION_UNAVAILABLE` — the provider/breaker is down AND the operation needs model funding.
 *      A `SEARCH` request is never denied here (PRD §8.2, §36.8's final row).
 *   2. `CONCURRENCY_LIMIT`      — the operation's concurrency slot is taken (PRD §24.4, §38.5).
 *   3. `RATE_LIMITED`           — the operation's own quota ledger is exhausted (PRD §38.5).
 *   4. `PRICE_DATA_UNAVAILABLE` — fail closed for founder-funded and customer PREPAID work
 *      (PRD §42.6's final sentence). NOT for BYOK, which creates no founder liability.
 *   5. `CREDIT_LIMIT_REACHED`   — the funding ledger cannot cover the reservation.
 *
 * Quota is checked BEFORE funding, which is what makes the ticket's both-gates acceptance item
 * deterministic: "quota but no balance" is always `CREDIT_LIMIT_REACHED`, and "balance but no quota" is
 * always `RATE_LIMITED` / `CONCURRENCY_LIMIT`.
 *
 * RATE-LIMIT METADATA AND TENANT ISOLATION (PRD §38.5: *"without disclosing other tenants"*): the
 * returned `{ limit, remaining, resetAt }` is built ONLY from the requesting organisation's own counter
 * — the boundary that was evaluated. It is never derived from the founder ledger, from a global/system
 * value, or from any other tenant's state. On a `CREDIT_LIMIT_REACHED` denial the metadata still
 * describes the OPERATION QUOTA counter, not the budget: telling a tenant how much founder budget
 * remains is a disclosure this module must not make.
 *
 * This function never mutates anything and never assumes it is called under a lock. Serialising
 * reserve → settle is `EVID-08`'s and `DATA-07`'s job; what this module guarantees is that a balance
 * presented as `{ settled, held }` is evaluated against BOTH (see `reserve-order.ts`).
 */
import { isErrorCode, type ErrorCode } from './contracts.js';
import { deepFreeze } from './deep-freeze.js';
import { isFounderLiability } from './ledgers.js';
import {
  CONCURRENCY_BOUNDARY_FOR_OPERATION,
  OPERATIONS_REQUIRING_MODEL_FUNDING,
  QUOTA_KIND_FOR_OPERATION,
} from './limits.js';
import { assertMicroAud } from './micro-aud.js';
import { validatePriceData } from './pricing.js';
import { reserve } from './reserve.js';
import { availableForClass } from './reserve-order.js';
import type {
  Admission,
  AdmissionDenialReason,
  AdmissionInput,
  QuotaCounter,
  RateLimitMetadata,
  Reservation,
} from './types.js';

/**
 * The total map from a denial reason onto PRD §34.9's error catalogue, so `RUNT-02` translates without
 * inventing semantics.
 *
 * NOTE (plan OQ-2, ticket obligation 3): the ticket says the five reason names "map 1:1 onto PRD §34.9
 * codes". They do not — `PRICE_DATA_UNAVAILABLE` and `CONCURRENCY_LIMIT` are not members of FND-03's
 * `ERROR_CODE_VALUES`. Rather than invent two public error codes (a §16.1/§45.5 public-API change
 * touching FND-03, FND-04 and the PRD, which must be escalated and not decided here), the five reasons
 * map onto the three codes that do exist:
 *
 * - `PRICE_DATA_UNAVAILABLE` → `GENERATION_UNAVAILABLE`: PRD §36.8's final row makes provider/budget
 *   unavailability *"Job unavailable; Search and saved records remain available"*;
 * - `CONCURRENCY_LIMIT` → `RATE_LIMITED`: §38.5 puts concurrency in the same limits table, and §34.9
 *   has no concurrency code.
 *
 * The finer-grained reason stays available on the `Admission` for logging and metrics.
 */
export const ADMISSION_REASON_TO_ERROR_CODE: Readonly<Record<AdmissionDenialReason, ErrorCode>> =
  deepFreeze({
    CREDIT_LIMIT_REACHED: 'CREDIT_LIMIT_REACHED',
    RATE_LIMITED: 'RATE_LIMITED',
    GENERATION_UNAVAILABLE: 'GENERATION_UNAVAILABLE',
    PRICE_DATA_UNAVAILABLE: 'GENERATION_UNAVAILABLE',
    CONCURRENCY_LIMIT: 'RATE_LIMITED',
  } as const);

/** Guard so the map above cannot drift from FND-03's catalogue even at runtime. */
export function errorCodeForReason(reason: AdmissionDenialReason): ErrorCode {
  const code = ADMISSION_REASON_TO_ERROR_CODE[reason];
  if (!isErrorCode(code)) throw new RangeError(`admission reason ${reason} maps to no §34.9 error code`);
  return code;
}

/** Metadata derived from ONE counter of the requesting organisation, and from nothing else. */
function metadataOf(counter: QuotaCounter): RateLimitMetadata {
  const remaining = counter.limit - counter.used;
  return {
    limit: counter.limit,
    remaining: remaining <= 0n ? 0n : remaining,
    resetAt: counter.resetAt,
  };
}

function exhausted(counter: QuotaCounter): boolean {
  return counter.used >= counter.limit;
}

function deny(reason: AdmissionDenialReason, counter: QuotaCounter): Admission {
  return { allowed: false, reason, metadata: metadataOf(counter) };
}

function allow(reservation: Reservation | null, counter: QuotaCounter): Admission {
  return { allowed: true, reservation, metadata: metadataOf(counter) };
}

export function admit(input: AdmissionInput): Admission {
  const { request, founder, quota } = input;

  // Money inputs cross a package boundary from `apps/**`; a float or a negative balance here would
  // silently defeat every guarantee below, so it is rejected rather than compared.
  assertMicroAud(founder.ceilingMicroAud, 'founder.ceilingMicroAud');
  assertMicroAud(founder.settledMicroAud, 'founder.settledMicroAud');
  assertMicroAud(founder.heldMicroAud, 'founder.heldMicroAud');
  if (input.customer !== null) {
    assertMicroAud(input.customer.prepaidRemainingMicroAud, 'customer.prepaidRemainingMicroAud');
  }

  const operation = request.operation;
  const quotaKind = QUOTA_KIND_FOR_OPERATION[operation];
  const quotaCounter = quota.counters[quotaKind];
  const concurrencyBoundary = CONCURRENCY_BOUNDARY_FOR_OPERATION[operation];
  const needsModelFunding = OPERATIONS_REQUIRING_MODEL_FUNDING.has(operation);

  // 1. Provider/breaker state. Search is untouched by it — that is PRD §8.2, enforced by the
  //    membership test rather than by a special case for `SEARCH`.
  if (needsModelFunding && !input.generationAvailable) {
    return deny('GENERATION_UNAVAILABLE', quotaCounter);
  }

  // 2. Concurrency, reported against the concurrency counter it was evaluated against.
  if (concurrencyBoundary !== null) {
    const slot = quota.concurrency[concurrencyBoundary];
    if (exhausted(slot)) return deny('CONCURRENCY_LIMIT', slot);
  }

  // 3. Operation quota — one ledger, its own counter (PRD §38.5's separate ledgers).
  if (exhausted(quotaCounter)) return deny('RATE_LIMITED', quotaCounter);

  // An operation that consumes no model funding is admitted here: no price, no ledger, no reservation.
  if (!needsModelFunding) return allow(null, quotaCounter);

  const founderFunded = isFounderLiability(input.ledger);
  const customerMode = input.customer?.mode ?? null;
  const byok = !founderFunded && customerMode === 'BYOK';

  // 4. Fail closed on price/FX data — for founder-funded work and for customer PREPAID work, which is
  //    debited in micro-AUD too. BYOK is exempt: it debits no founder funds, so there is nothing to
  //    fail closed over; it proceeds with no reservation and `recordByokEstimate` records what it can.
  const problem = validatePriceData(input.price, input.fx, input.now, input.maxPriceAgeMillis);
  if (problem !== null) {
    if (byok) return allow(null, quotaCounter);
    return deny('PRICE_DATA_UNAVAILABLE', quotaCounter);
  }
  if (input.price === null || input.fx === null) return deny('PRICE_DATA_UNAVAILABLE', quotaCounter);

  const reservation = reserve({
    request,
    ledger: input.ledger,
    price: input.price,
    fx: input.fx,
    now: input.now,
    maxPriceAgeMillis: input.maxPriceAgeMillis,
  });

  if (byok) return allow(reservation, quotaCounter);

  // 5. Funding-ledger balance.
  if (founderFunded) {
    const available = availableForClass(request.reserveClass, founder);
    if (reservation.amountMicroAud > available) return deny('CREDIT_LIMIT_REACHED', quotaCounter);
    return allow(reservation, quotaCounter);
  }

  // Customer-funded, PREPAID. A missing customer ledger is treated as no balance: PRD §24.4 forbids
  // creating unsecured founder liability, so the absence of a prepaid balance must deny, never default.
  const prepaidRemaining = input.customer?.prepaidRemainingMicroAud ?? null;
  if (prepaidRemaining === null || reservation.amountMicroAud > prepaidRemaining) {
    return deny('CREDIT_LIMIT_REACHED', quotaCounter);
  }
  return allow(reservation, quotaCounter);
}
