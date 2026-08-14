/**
 * EVID-07 deliverable 2 — profile resolution, and the four ways it refuses.
 *
 * Resolution is the gate that stands between a request and a hosted model. It never substitutes: a
 * refusal is a typed error object handed back to the caller, and the caller's only options are to
 * report unavailability or to try an *independently approved* fallback (`generate.ts`). Nothing in
 * this file picks a different profile, provider or model. PRD §14.4, §17.3 (*"No unvalidated fallback
 * is permitted during provider failure or budget exhaustion"*).
 *
 * The order below is deliberate and tested:
 *
 *  1. unknown id                                  → `UNKNOWN_PROFILE`
 *  2. `LOCAL_IN_SEARCH_BOUNDARY`                  → THROWS `LocalProfileNotCallableError`
 *  3. not `APPROVED` outside `EVALUATION`         → `PROFILE_NOT_APPROVED`
 *  4. allowed provider fails PRD §10.2 retention  → `PROVIDER_RETENTION_UNACCEPTABLE`
 *
 * Step 2 throws rather than returning a refusal because it is a programming error, not a runtime
 * condition: `QUERY_EMBEDDING` and `LOCAL_RERANK` execute inside the search boundary and there is no
 * circumstance in which this gateway should run them. The message names `RETR-07` and PRD §17.3 so the
 * caller is pointed at the module that owns that runtime.
 */
import { MODEL_PROFILE_REGISTRY_V1 } from './registry.js';
import { isModelProfileId } from './types.js';
import type {
  GatewayEnvironment,
  ModelProfile,
  ModelProfileId,
  ProviderRetentionDescriptor,
  RetentionPosture,
} from './types.js';

const ACCEPTABLE_RETENTION: readonly RetentionPosture[] = ['ZERO', 'APPROVED_MINIMAL'];

/**
 * Thrown, never returned. Invoking a local profile through the hosted gateway is a wiring mistake:
 * PRD §17.3 places query embedding and small-set reranking in the online-local tier, and `RETR-07`
 * (`11-retrieval-engine`) owns that runtime. This package must never become a second execution path
 * for one.
 */
export class LocalProfileNotCallableError extends Error {
  public readonly profileId: ModelProfileId;

  public constructor(profileId: ModelProfileId) {
    super(
      `model profile ${profileId} executes inside the search boundary and is not callable through the ` +
        'hosted model gateway; it belongs to RETR-07 (11-retrieval-engine) per PRD §17.3',
    );
    this.name = 'LocalProfileNotCallableError';
    this.profileId = profileId;
  }
}

export class ProfileRefusalError extends Error {
  public readonly profileId: string;

  public constructor(name: string, profileId: string, message: string) {
    super(message);
    this.name = name;
    this.profileId = profileId;
  }
}

/** PRD §14.4 — a candidate has not passed the promotion gates, so it does not serve production. */
export class ProfileNotApprovedError extends ProfileRefusalError {
  public constructor(profileId: string, environment: GatewayEnvironment) {
    super(
      'ProfileNotApprovedError',
      profileId,
      `model profile ${profileId} is not APPROVED and cannot serve ${environment}; PRD §14.4 requires ` +
        'security/cost compatibility, development, frozen validation, blind testing and full ' +
        'non-regression before promotion. No substitute profile is selected.',
    );
  }
}

/** The id is not one of PRD §14.4's six. Unreachable through the typed API; possible from JSON. */
export class UnknownProfileError extends ProfileRefusalError {
  public constructor(profileId: string) {
    super('UnknownProfileError', profileId, `${profileId} is not one of the PRD §14.4 model profiles`);
  }
}

/** PRD §10.2 — the provider's commercial terms are a precondition of resolution, not a runtime check. */
export class ProviderRetentionUnacceptableError extends ProfileRefusalError {
  public readonly providerId: string;

  public constructor(profileId: string, providerId: string) {
    super(
      'ProviderRetentionUnacceptableError',
      profileId,
      `provider ${providerId} allowed by profile ${profileId} is not configured with no-training and ` +
        'zero or approved-minimal retention (PRD §10.2, sub-PRD Q-EVID-4)',
    );
    this.providerId = providerId;
  }
}

export type ProfileRefusalReason =
  | 'UNKNOWN_PROFILE'
  | 'PROFILE_NOT_APPROVED'
  | 'PROVIDER_RETENTION_UNACCEPTABLE';

export interface ResolvedProfile {
  readonly outcome: 'RESOLVED';
  readonly profile: ModelProfile;
  readonly environment: GatewayEnvironment;
}

export interface ProfileRefusal {
  readonly outcome: 'REFUSED';
  readonly reason: ProfileRefusalReason;
  readonly error: ProfileRefusalError;
}

export type ProfileResolution = ResolvedProfile | ProfileRefusal;

const refuse = (reason: ProfileRefusalReason, error: ProfileRefusalError): ProfileRefusal => ({
  outcome: 'REFUSED',
  reason,
  error,
});

/**
 * Resolve a profile for one call.
 *
 * `providers` is the descriptor list the host has configured. It is a required parameter with no
 * default: a default would mean this package could silently resolve against a registry the caller
 * never inspected, and PRD §10.2's retention posture is exactly the thing that must be explicit.
 */
export function resolveProfile(
  profileId: string,
  environment: GatewayEnvironment,
  providers: readonly ProviderRetentionDescriptor[],
  registry: Readonly<Record<ModelProfileId, ModelProfile>> = MODEL_PROFILE_REGISTRY_V1,
): ProfileResolution {
  if (!isModelProfileId(profileId)) {
    return refuse('UNKNOWN_PROFILE', new UnknownProfileError(profileId));
  }
  const profile = registry[profileId];

  if (profile.execution === 'LOCAL_IN_SEARCH_BOUNDARY') throw new LocalProfileNotCallableError(profileId);

  if (profile.promotionState !== 'APPROVED' && environment !== 'EVALUATION') {
    return refuse('PROFILE_NOT_APPROVED', new ProfileNotApprovedError(profileId, environment));
  }

  if (profile.allowedProviderIds.length === 0) {
    return refuse('PROFILE_NOT_APPROVED', new ProfileNotApprovedError(profileId, environment));
  }

  for (const providerId of profile.allowedProviderIds) {
    const descriptor = providers.find((candidate) => candidate.providerId === providerId);
    if (descriptor === undefined || !hasAcceptableRetention(descriptor)) {
      return refuse(
        'PROVIDER_RETENTION_UNACCEPTABLE',
        new ProviderRetentionUnacceptableError(profileId, providerId),
      );
    }
  }

  return { outcome: 'RESOLVED', profile, environment };
}

/** PRD §10.2, expressed once. `noTraining` must be true AND the mode must be one of the two allowed. */
export function hasAcceptableRetention(descriptor: ProviderRetentionDescriptor): boolean {
  return (
    descriptor.retention.noTraining === true &&
    (ACCEPTABLE_RETENTION as readonly string[]).includes(descriptor.retention.mode)
  );
}
