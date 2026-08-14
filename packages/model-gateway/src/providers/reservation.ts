/**
 * EVID-07 deliverable 4, first bullet, and sub-PRD **D17** — the reservation token, DECLARED here and
 * MINTED nowhere.
 *
 * PRD §42.6 makes a held budget reservation a precondition of a hosted call. This package expresses
 * that as a type: `HeldReservation` carries a phantom brand, so a caller cannot write an object
 * literal that satisfies it — the same device `packages/contracts` uses for `Id` and
 * `packages/pii` for `SanitizedPayload`. Omitting the argument is a compile error because the
 * parameter is required and positional (`generate.ts`, `adapter.ts`).
 *
 * THE BRAND IS EXPORTED AS A DECLARATION ONLY. `EVID-08` owns `src/budget/**` in this same package
 * and needs to name the symbol to mint one; `declare const … : unique symbol` has no runtime value,
 * so exporting it hands over no ability to forge anything from outside. THIS PACKAGE CONTAINS NO
 * FUNCTION THAT RETURNS A `HeldReservation`, and `test/providers/reservation.test.ts` asserts it with
 * a source scan.
 *
 * The payload is fixed by `EVID-08` deliverable 1. If it does not fit, the ticket's Feedback
 * obligation applies: change the token type HERE in a docs PR amending both tickets, then `--sync`.
 * `EVID-08` never writes `src/providers/**`.
 *
 * This module is deliberately NOT reachable from `src/providers/index.ts`'s value exports beyond the
 * type and the brand declaration.
 */
import type { ModelProfileId } from '../profiles/types.js';

export declare const heldReservationBrand: unique symbol;

export type HeldReservation = {
  readonly reservationId: string;
  readonly ledger: string;
  readonly amountMicroAud: bigint;
  readonly profileId: ModelProfileId;
  readonly jobId: string;
  readonly attempt: number;
  /** Epoch milliseconds, compared against the injected clock — never against `Date.now()`. */
  readonly expiresAt: number;
  readonly priceSnapshotId: string;
  readonly fxSnapshotId: string;
  readonly [heldReservationBrand]: 'held';
};
