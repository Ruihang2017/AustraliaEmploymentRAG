/**
 * EVID-07 — the public surface of the providers leaf.
 *
 * WHAT IS DELIBERATELY ABSENT, and asserted absent by `test/providers/public-surface.test.ts`:
 *
 *  - any mint of a `HeldReservation` (there is none anywhere in this package — `EVID-08` mints it);
 *  - `recordingTransport` is exported, but it is a decorator that requires the HOST to supply both a
 *    live transport and a sink, so exporting it hands over no ability to reach a network;
 *  - no function whose name suggests an external action — send, email, webhook, promote, transition,
 *    credential, apiKey, exec, spawn. The architecture test scans for exactly that.
 *
 * The deterministic stub lives behind the `./testing` subpath (`src/providers/stub/index.ts`) so
 * `EVID-05`, `ASK-02`, `GOLD-15` and `ASSR-04` share one stub instead of forking divergent ones.
 */
export { createProviderAdapter, PROVIDER_GENERATE_PATH } from './adapter.js';
export type { AdapterOptions, ProviderAdapter } from './adapter.js';

export {
  PROVIDER_DESCRIPTORS,
  PROVIDER_REGISTRY_V1,
  PROVIDER_REGISTRY_VERSION,
  findProviderDescriptor,
} from './registry.js';
export type { ProviderDescriptor, TransportKind } from './registry.js';

export { OriginNotAllowedError, assertAllowedOrigin, isWellFormedHttpsOrigin } from './origin.js';

export type { HeldReservation } from './reservation.js';

export {
  GENERATION_UNAVAILABLE,
  UNAVAILABLE_DETAILS,
  UNAVAILABLE_REASONS,
  assertNever,
  isUnavailableReason,
  retryAfterMsFrom,
  unavailable,
} from './failure.js';
export type {
  GatewayUnavailable,
  UnavailableDetail,
  UnavailableOptions,
  UnavailableReason,
} from './failure.js';

export { NO_KILL_SWITCH, isSwitchedOff, killSwitchScope } from './killswitch.js';
export type { GatewayKillSwitchState, KillSwitchScope } from './killswitch.js';

export { MODEL_EXECUTION_FIELDS, buildModelExecutionRecord } from './recording.js';
export type {
  ModelExecutionInput,
  ModelExecutionPort,
  ModelExecutionRecord,
  ModelExecutionTx,
  SchemaStatus,
} from './recording.js';

export { generate } from './generate.js';
export type {
  Clock,
  GatewayCall,
  GatewayDeps,
  GatewayResult,
  GatewaySuccess,
  Timer,
} from './generate.js';

export {
  CassetteMissError,
  SCENARIO_HEADER,
  cassetteKeyOf,
  createCassetteTransport,
  fingerprintOf,
} from './transport/cassette.js';
export type { Cassette, CassetteKey } from './transport/cassette.js';

export { recordingTransport } from './transport/record.js';
export type { CassetteSink } from './transport/record.js';

export type { Transport, TransportRequest, TransportResponse } from './transport/types.js';
