/**
 * EVID-07 — the orchestrator. Everything the ticket calls "the gateway" is this function.
 *
 * THE ORDER IS FIXED AND TESTED:
 *   resolve profile → kill switch → reservation → build request → race the transport against
 *   `maxElapsedMs` → map the outcome through the failure matrix → record exactly one
 *   `model_execution` row for the attempt → return.
 *
 * IMPURITY IS THE HOST'S, EXPRESSED AS PORTS (`GatewayDeps`). `src/**` in this package holds no
 * clock, no timer, no socket and no database handle, and there is no default implementation of any of
 * them — a default would reintroduce the impurity here AND would be the thing that quietly reaches
 * the network in production. The elapsed-ceiling test is deterministic as a direct consequence.
 *
 * CONCURRENCY — THE TIMEOUT RACE (plan §6 risk 2). A `Promise.race` leaves the loser running. After
 * `PROFILE_TIMEOUT` the late transport resolution must not (a) overwrite the returned result,
 * (b) record a second row, or (c) trigger a fallback. Both racers are converted to VALUES before the
 * race, the race is awaited exactly once, and a `settled` latch guards the recording site, so a late
 * resolution has nowhere to land.
 *
 * NO UNVALIDATED FALLBACK (PRD §17.3, §14.4). A fallback is attempted only when the resolved profile
 * carries `approvedFallbackProfileId` AND that profile itself resolves as `APPROVED`, and only for
 * provider-side failures. No shipped profile carries one, so on the shipped registry every failure
 * path calls exactly one profile, one provider and one model.
 *
 * A FALLBACK NEEDS ITS OWN RESERVATION. A `HeldReservation` is minted BY EVID-08 FOR ONE PROFILE and
 * `attempt` refuses a token whose `profileId` is not the profile it is about to call — so reusing the
 * primary token for a fallback profile could never do anything but refuse, which made the whole
 * fallback path unreachable. The reservation for the fallback is therefore its own optional argument:
 * the caller (who holds the budget) decides to reserve for the approved fallback, and if it did not,
 * THE ORIGINAL FAILURE STANDS and no second call is made. That is the conservative direction — the
 * gateway never invents budget, and it never calls a profile nothing was reserved for.
 *
 * THE RECORDING PORT IS NOT SWALLOWED (plan §6 risk 8). If `insert` throws, the error propagates:
 * losing the row is an accounting-integrity failure (PRD §35.8, §42.6), and rewriting the provider
 * outcome's `reason` to hide it would be worse than the outage.
 */
import { resolveProfile } from '../profiles/resolve.js';
import type { ProfileRefusalReason, ProfileResolution } from '../profiles/resolve.js';
import { MODEL_PROFILE_REGISTRY_V1 } from '../profiles/registry.js';
import type { GatewayEnvironment, ModelProfile, ModelProfileId } from '../profiles/types.js';
import { buildProviderRequest } from '../schema/request.js';
import type { RequestIdentifiers } from '../schema/request.js';
import type { EvidencePackInput } from '../schema/pack.js';
import type { SanitizedTaskFacts } from '../schema/sanitized.js';
import { parseModelResponse } from '../schema/response.js';
import type { ModelResponse } from '../schema/response.js';
import { PROVIDER_DESCRIPTORS, findProviderDescriptor } from './registry.js';
import type { ProviderDescriptor } from './registry.js';
import { createProviderAdapter } from './adapter.js';
import { killSwitchScope } from './killswitch.js';
import type { GatewayKillSwitchState } from './killswitch.js';
import { assertNever, retryAfterMsFrom, unavailable } from './failure.js';
import type { GatewayUnavailable, UnavailableReason } from './failure.js';
import { buildModelExecutionRecord } from './recording.js';
import type { ModelExecutionPort, ModelExecutionTx, SchemaStatus } from './recording.js';
import type { HeldReservation } from './reservation.js';
import type { Transport, TransportResponse } from './transport/types.js';

/** A monotonic-enough source of epoch milliseconds. Injected; this package holds no clock. */
export interface Clock {
  now(): number;
}

/** Resolves after `ms`. Injected, so the elapsed-ceiling test is deterministic, not wall-clock-flaky. */
export type Timer = (ms: number) => Promise<void>;

export interface GatewayDeps {
  readonly transport: Transport;
  readonly clock: Clock;
  readonly timer: Timer;
  readonly modelExecutions: ModelExecutionPort;
  readonly modelExecutionTx: ModelExecutionTx;
  readonly killSwitch: GatewayKillSwitchState;
  readonly environment: GatewayEnvironment;
  readonly providers?: readonly ProviderDescriptor[];
  readonly profileRegistry?: Readonly<Record<ModelProfileId, ModelProfile>>;
}

export interface GatewayCall {
  readonly profileId: string;
  readonly facts: SanitizedTaskFacts;
  readonly pack: EvidencePackInput;
  readonly ids: RequestIdentifiers;
}

export interface GatewaySuccess {
  readonly outcome: 'OK';
  readonly profileId: ModelProfileId;
  readonly providerId: string;
  readonly response: ModelResponse;
  readonly actualModelVersion: string | null;
  readonly latencyMs: number;
}

export type GatewayResult = GatewaySuccess | GatewayUnavailable;

/** Which reasons a fallback may be attempted for. Never a schema failure — repair is `ASK-02`'s. */
const FALLBACK_ELIGIBLE: readonly UnavailableReason[] = [
  'PROVIDER_FAILURE',
  'PROVIDER_RATE_LIMITED',
  'PROFILE_TIMEOUT',
];

function refusalToUnavailable(reason: ProfileRefusalReason, error: Error): GatewayUnavailable {
  switch (reason) {
    case 'UNKNOWN_PROFILE':
      return unavailable('PROFILE_NOT_APPROVED', 'PROFILE_UNKNOWN');
    case 'PROFILE_NOT_APPROVED':
      return unavailable('PROFILE_NOT_APPROVED', 'PROFILE_NOT_APPROVED_FOR_ENVIRONMENT');
    case 'PROVIDER_RETENTION_UNACCEPTABLE':
      return unavailable('PROFILE_NOT_APPROVED', 'PROVIDER_RETENTION_UNACCEPTABLE');
    default:
      return assertNever(reason, `profile refusal (${error.name})`);
  }
}

/**
 * Whether a token covers the profile that is about to be called, and if not, which fixed detail says
 * so. One function, used both by `attempt` (defence at the call site) and by the fallback gate in
 * `generate` (so an uncovered fallback is never attempted at all) — two copies of this rule is how
 * they would come to disagree.
 */
type ReservationDefect = 'RESERVATION_MISSING' | 'RESERVATION_EXPIRED' | 'RESERVATION_WRONG_PROFILE';

type ReservationCheck =
  | { readonly ok: true; readonly held: HeldReservation }
  | { readonly ok: false; readonly defect: ReservationDefect };

function checkReservation(
  held: HeldReservation | null | undefined,
  profileId: ModelProfileId,
  now: number,
): ReservationCheck {
  if (held === null || held === undefined) return { ok: false, defect: 'RESERVATION_MISSING' };
  if (typeof held.expiresAt !== 'number' || held.expiresAt <= now) {
    return { ok: false, defect: 'RESERVATION_EXPIRED' };
  }
  if (held.profileId !== profileId) return { ok: false, defect: 'RESERVATION_WRONG_PROFILE' };
  return { ok: true, held };
}

type RaceOutcome =
  | { readonly kind: 'RESPONSE'; readonly response: TransportResponse }
  | { readonly kind: 'THREW' }
  | { readonly kind: 'TIMEOUT' };

async function attempt(
  profile: ModelProfile,
  call: GatewayCall,
  reservation: HeldReservation,
  deps: GatewayDeps,
): Promise<GatewayResult> {
  const providerId = profile.allowedProviderIds[0];
  if (providerId === undefined) return unavailable('PROFILE_NOT_APPROVED', 'PROFILE_NOT_APPROVED_FOR_ENVIRONMENT');

  const descriptor = findProviderDescriptor(providerId);
  if (descriptor === undefined) return unavailable('PROFILE_NOT_APPROVED', 'PROVIDER_RETENTION_UNACCEPTABLE');

  // --- kill switch, before anything is sent -----------------------------------------------------
  const scope = killSwitchScope(deps.killSwitch, profile.id, providerId);
  if (scope !== null) {
    return unavailable('KILL_SWITCH', scope === 'PROFILE' ? 'KILL_SWITCH_PROFILE' : 'KILL_SWITCH_PROVIDER');
  }

  // --- reservation, before anything is sent -----------------------------------------------------
  // `reservation` is typed as required, so this is defence against a JavaScript caller and against a
  // cast — the compile-time half of the guarantee is the signature, not this block.
  const check = checkReservation(reservation as HeldReservation | null | undefined, profile.id, deps.clock.now());
  if (!check.ok) return unavailable('NO_RESERVATION', check.defect);
  const held = check.held;

  const request = buildProviderRequest(profile, call.facts, call.pack, call.ids);
  const adapter = createProviderAdapter(descriptor);

  const startedAt = deps.clock.now();
  let settled = false;

  // `Promise.resolve().then(...)` rather than calling the adapter directly: an injected transport that
  // throws SYNCHRONOUSLY would otherwise escape before `.catch` is attached and propagate out of the
  // gateway as an untyped exception, bypassing the matrix entirely. The host supplies the transport,
  // so this package cannot assume it is well behaved.
  const transportRace: Promise<RaceOutcome> = Promise.resolve()
    .then(() => adapter.generate(profile, request, held, deps.transport))
    .then((response): RaceOutcome => ({ kind: 'RESPONSE', response }))
    .catch((): RaceOutcome => ({ kind: 'THREW' }));
  const deadline: Promise<RaceOutcome> = deps.timer(profile.maxElapsedMs).then(
    (): RaceOutcome => ({ kind: 'TIMEOUT' }),
  );

  const outcome = await Promise.race([transportRace, deadline]);
  const latencyMs = Math.max(0, deps.clock.now() - startedAt);

  /** The one recording site. The latch is what makes "exactly one row per attempt" a property. */
  const record = (
    schemaStatus: SchemaStatus,
    response: TransportResponse | null,
  ): void => {
    if (settled) return;
    settled = true;
    deps.modelExecutions.insert(
      deps.modelExecutionTx,
      buildModelExecutionRecord({
        jobId: call.ids.jobId,
        profile: profile.id,
        providerId,
        actualModelVersion: response?.modelVersion ?? null,
        inputTokens: response?.inputTokens ?? null,
        outputTokens: response?.outputTokens ?? null,
        latencyMs,
        costMicroAud: response?.costMicroAud ?? null,
        schemaStatus,
        retentionMode: descriptor.retention.mode,
        instructionTemplateVersion: request.instructionTemplateVersion,
        packHash: call.pack.packHash,
      }),
    );
  };

  switch (outcome.kind) {
    case 'TIMEOUT':
      record('NOT_EVALUATED', null);
      return unavailable('PROFILE_TIMEOUT', 'ELAPSED_CEILING_EXCEEDED');

    case 'THREW':
      record('NOT_EVALUATED', null);
      return unavailable('PROVIDER_FAILURE', 'TRANSPORT_THREW');

    case 'RESPONSE': {
      const { response } = outcome;

      if (response.status === 429) {
        record('NOT_EVALUATED', response);
        const retryAfterMs = retryAfterMsFrom(response.headersSubset);
        return retryAfterMs === undefined
          ? unavailable('PROVIDER_RATE_LIMITED', 'PROVIDER_STATUS_429')
          : unavailable('PROVIDER_RATE_LIMITED', 'PROVIDER_STATUS_429', { retryAfterMs });
      }
      if (response.status >= 500) {
        record('NOT_EVALUATED', response);
        return unavailable('PROVIDER_FAILURE', 'PROVIDER_STATUS_5XX');
      }
      if (response.status < 200 || response.status >= 300) {
        record('NOT_EVALUATED', response);
        return unavailable('PROVIDER_FAILURE', 'PROVIDER_STATUS_4XX');
      }

      const parsed = parseModelResponse(response.body);
      if (!parsed.ok) {
        record('INVALID', response);
        return unavailable('SCHEMA_INVALID', 'RESPONSE_FAILED_SCHEMA', { failingPath: parsed.path });
      }

      record('VALID', response);
      return {
        outcome: 'OK',
        profileId: profile.id,
        providerId,
        response: parsed.value,
        actualModelVersion: response.modelVersion,
        latencyMs,
      };
    }

    default:
      return assertNever(outcome, 'transport race outcome');
  }
}

/**
 * Run one generation.
 *
 * `reservation` is positional and required: omitting it is a compile error, which is the acceptance
 * item. A forged or expired token is caught at runtime and yields `NO_RESERVATION`.
 *
 * `fallbackReservation` is optional and is the ONLY way an approved fallback profile is ever called.
 * It must be a token minted for that fallback profile; without it (or with a token for the wrong
 * profile, or an expired one) the original failure is returned unchanged and no second call happens.
 */
export async function generate(
  call: GatewayCall,
  reservation: HeldReservation,
  deps: GatewayDeps,
  fallbackReservation?: HeldReservation,
): Promise<GatewayResult> {
  const providers = deps.providers ?? PROVIDER_DESCRIPTORS;
  const registry = deps.profileRegistry ?? MODEL_PROFILE_REGISTRY_V1;

  // Throws `LocalProfileNotCallableError` for a local profile — deliberately not a matrix cell.
  const resolution: ProfileResolution = resolveProfile(call.profileId, deps.environment, providers, registry);
  if (resolution.outcome === 'REFUSED') {
    return refusalToUnavailable(resolution.reason, resolution.error);
  }

  const first = await attempt(resolution.profile, call, reservation, deps);
  if (first.outcome === 'OK') return first;
  if (!FALLBACK_ELIGIBLE.includes(first.reason)) return first;

  const fallbackId = resolution.profile.approvedFallbackProfileId;
  if (fallbackId === undefined) return first;

  // PRD §14.4: a fallback is only ever to another INDEPENDENTLY APPROVED profile. A fallback pointing
  // at a CANDIDATE is refused and the original failure stands — it is never "try it anyway".
  const fallback = resolveProfile(fallbackId, deps.environment, providers, registry);
  if (fallback.outcome === 'REFUSED') return first;
  if (fallback.profile.promotionState !== 'APPROVED') return first;

  // The fallback runs on ITS OWN reservation. Nothing here promotes the primary token: a token held
  // for the primary profile is not budget for a second, differently priced model.
  const covered = checkReservation(fallbackReservation, fallback.profile.id, deps.clock.now());
  if (!covered.ok) return first;

  return attempt(fallback.profile, call, covered.held, deps);
}
