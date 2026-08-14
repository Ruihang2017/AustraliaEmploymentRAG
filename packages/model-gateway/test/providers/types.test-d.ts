/**
 * EVID-07 — the type-level assertions for the providers leaf.
 *
 * Runs under `tsc` through `pnpm typecheck` (this file is named in tsconfig#include). See
 * `test/schema/types.test-d.ts` for why not `vitest --typecheck`.
 *
 * NEGATIVE CONTROL (ticket test-plan step 8): making `reservation` optional on `generate` turns the
 * omitted-argument block below into "unused '@ts-expect-error' directive" errors and `pnpm typecheck`
 * fails. Run and discarded.
 */
import { expectTypeOf } from 'vitest';

import { generate } from '../../src/providers/generate.js';
import type { GatewayCall, GatewayDeps, GatewayResult } from '../../src/providers/generate.js';
import { createProviderAdapter } from '../../src/providers/adapter.js';
import type { ProviderDescriptor } from '../../src/providers/registry.js';
import type { HeldReservation } from '../../src/providers/reservation.js';
import type { ModelExecutionPort, ModelExecutionRecord } from '../../src/providers/recording.js';
import type { UnavailableReason } from '../../src/providers/failure.js';
import type { ProviderRequestPayload } from '../../src/schema/request.js';
import type { ModelProfile } from '../../src/profiles/types.js';
import type { Transport } from '../../src/providers/transport/types.js';

declare const call: GatewayCall;
declare const deps: GatewayDeps;
declare const held: HeldReservation;
declare const descriptor: ProviderDescriptor;
declare const profile: ModelProfile;
declare const request: ProviderRequestPayload;
declare const transport: Transport;

// --- acceptance item: no call without a reservation (sub-PRD D17, PRD §42.6) --------------------

// @ts-expect-error the reservation is required — omitting it must not compile
export const withoutReservation = generate(call, deps);

// @ts-expect-error a plain object cannot satisfy the branded reservation
export const forgedReservation = generate(call, { reservationId: 'rs_1' }, deps);

// @ts-expect-error `undefined` is not a reservation
export const undefinedReservation = generate(call, undefined, deps);

// The positive direction.
export const withReservation: Promise<GatewayResult> = generate(call, held, deps);

// The fallback reservation is optional, but it is a RESERVATION — a caller cannot hand the fallback
// path a plain object either, which is what keeps "no call without a reservation" true of BOTH
// attempts (Reviewer bounce, high finding).
export const withFallbackReservation: Promise<GatewayResult> = generate(call, held, deps, held);

// @ts-expect-error a plain object cannot satisfy the branded fallback reservation
export const forgedFallback = generate(call, held, deps, { reservationId: 'rs_2' });

// @ts-expect-error there is no fifth argument through which anything else could be injected
export const fifthArgument = generate(call, held, deps, held, deps);

// The adapter's own signature carries the same requirement, positionally.
const adapter = createProviderAdapter(descriptor);
// @ts-expect-error the adapter's generate requires the reservation too
export const adapterWithout = adapter.generate(profile, request, transport);

// --- acceptance item: TenantContext only (PRD §21.2, §45.2; SEC-001) ----------------------------

/**
 * A `DATA-02`-shaped repository: `insert(tx, values)` with method syntax and its own `Tx` type. It
 * must satisfy `ModelExecutionPort` structurally, so persistence goes through that layer with no
 * import edge from this package into `packages/database`.
 */
interface Data02Tx {
  readonly __brand: 'tx';
}
interface Data02Repository {
  insert(tx: Data02Tx, values: ModelExecutionRecord): { readonly id: string };
}
declare const repository: Data02Repository;
export const satisfiesPort: ModelExecutionPort = repository;

// --- the recorded row carries no raw payload (PRD §35.6, §37.3) ---------------------------------

declare const row: ModelExecutionRecord;

// @ts-expect-error a model_execution row must not be able to express `prompt`
export const rowPrompt: unknown = row.prompt;

// @ts-expect-error a model_execution row must not be able to express `response`
export const rowResponse: unknown = row.response;

// @ts-expect-error a model_execution row must not be able to express `body`
export const rowBody: unknown = row.body;

// @ts-expect-error a model_execution row must not be able to express `evidenceText`
export const rowEvidence: unknown = row.evidenceText;

// @ts-expect-error a model_execution row must not be able to express `facts`
export const rowFacts: unknown = row.facts;

// --- the failure matrix is closed ---------------------------------------------------------------

expectTypeOf<UnavailableReason>().toEqualTypeOf<
  | 'PROVIDER_FAILURE'
  | 'PROVIDER_RATE_LIMITED'
  | 'SCHEMA_INVALID'
  | 'PROFILE_TIMEOUT'
  | 'PROFILE_NOT_APPROVED'
  | 'KILL_SWITCH'
  | 'NO_RESERVATION'
>();

// --- the deps bundle has no credential and no base-URL member -----------------------------------

// @ts-expect-error GatewayDeps must not be able to express `apiKey`
export const depsApiKey: unknown = deps.apiKey;

// @ts-expect-error GatewayDeps must not be able to express `baseUrl`
export const depsBaseUrl: unknown = deps.baseUrl;

// @ts-expect-error GatewayDeps must not be able to express `fetch`
export const depsFetch: unknown = deps.fetch;
