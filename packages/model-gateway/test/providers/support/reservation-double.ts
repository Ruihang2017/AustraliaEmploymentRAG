/**
 * EVID-07 — the forged `HeldReservation`, isolated in its own file so it is easy to audit.
 *
 * `HeldReservation` is branded and this package mints none (`src/providers/reservation.ts`); `EVID-08`
 * is the only minter. A test that needs a token therefore has to cast, and a test that needs to prove
 * the RUNTIME check is real needs a token that is structurally complete and semantically wrong — an
 * expired one, or one for a different profile. That is what this file makes, and it makes it in
 * exactly one place so no other test acquires the habit.
 *
 * Not a `*.test.*` file.
 */
import type { HeldReservation } from '../../../src/providers/reservation.js';
import type { ModelProfileId } from '../../../src/profiles/types.js';

export interface ReservationFields {
  readonly reservationId: string;
  readonly ledger: string;
  readonly amountMicroAud: bigint;
  readonly profileId: ModelProfileId;
  readonly jobId: string;
  readonly attempt: number;
  readonly expiresAt: number;
  readonly priceSnapshotId: string;
  readonly fxSnapshotId: string;
}

export function reservationFields(overrides: Partial<ReservationFields> = {}): ReservationFields {
  return {
    reservationId: 'rs_0000000000000001',
    ledger: 'HOSTED_MODEL',
    amountMicroAud: 250_000n,
    profileId: 'QUICK_SYNTHESIS',
    jobId: 'jb_0000000000000001',
    attempt: 1,
    expiresAt: 1_000_000,
    priceSnapshotId: 'ps_0000000000000001',
    fxSnapshotId: 'fx_0000000000000001',
    ...overrides,
  };
}

/** THE cast. Nothing else in the test tree may forge a reservation. */
export function forgeReservation(overrides: Partial<ReservationFields> = {}): HeldReservation {
  return reservationFields(overrides) as unknown as HeldReservation;
}
