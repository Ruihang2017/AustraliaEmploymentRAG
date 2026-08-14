/**
 * EVID-07 deliverable 3 — ceilings are enforced at LOAD, never clamped at call time.
 *
 * `registry.ts` calls `assertProfileWithinCeilings` for every entry during module evaluation, so a
 * profile configured above `REGISTRY_CEILINGS` makes importing this package throw. A clamp would let
 * the mis-configured profile serve quietly at a limit nobody chose; a throw makes the mistake
 * impossible to deploy. PRD §36.7, §14.4.
 */
import { REGISTRY_CEILINGS } from './ceilings.js';
import type { ModelProfile } from './types.js';

export class ProfileCeilingExceededError extends Error {
  public readonly profileId: string;
  public readonly limit: string;

  public constructor(profileId: string, limit: string, configured: number, ceiling: number) {
    super(
      `model profile ${profileId} declares ${limit}=${String(configured)}, above the registry ceiling ` +
        `${String(ceiling)}; ceilings are rejected at load, never clamped (PRD §36.7, §14.4)`,
    );
    this.name = 'ProfileCeilingExceededError';
    this.profileId = profileId;
    this.limit = limit;
  }
}

/** Throws `ProfileCeilingExceededError` on the first limit the profile exceeds. Returns the profile. */
export function assertProfileWithinCeilings(profile: ModelProfile): ModelProfile {
  const ceiling = REGISTRY_CEILINGS[profile.id];
  const checks = [
    ['maxInputTokens', profile.maxInputTokens, ceiling.maxInputTokens],
    ['maxOutputTokens', profile.maxOutputTokens, ceiling.maxOutputTokens],
    ['maxElapsedMs', profile.maxElapsedMs, ceiling.maxElapsedMs],
  ] as const;
  for (const [limit, configured, allowed] of checks) {
    if (!Number.isFinite(configured) || !Number.isInteger(configured) || configured < 0) {
      throw new ProfileCeilingExceededError(profile.id, limit, configured, allowed);
    }
    if (configured > allowed) {
      throw new ProfileCeilingExceededError(profile.id, limit, configured, allowed);
    }
  }
  return profile;
}
