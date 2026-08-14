/**
 * EVID-07 — the public surface of the profiles leaf.
 *
 * WHY THIS IS THE BARREL AND `src/index.ts` IS NOT. `tools/workspace-assertions.mjs`
 * (`assertEntryFilesEmpty`, asserted on every branch by `tools/tests/skeleton.test.mjs`) requires
 * every pnpm member's `src/index.ts` to be byte-exactly `export {};` — the FND-01 skeleton rule. This
 * ticket's File-scope PERMITS appending to it; the repository guard FORBIDS it, and permission is not
 * obligation. `EVID-01` recorded the same resolution in `packages/pii/src/contract/index.ts`.
 *
 * CONSEQUENCE: until workspace links exist, downstream tickets deep-import
 * `packages/model-gateway/src/profiles/index.js` relatively, exactly as `EVID-02` and `ASK-06` do for
 * `packages/pii`. The `exports` map in package.json is declared for when they do.
 *
 * Explicit named re-exports, never `export *`, so the whole public surface is readable in one file and
 * `test/providers/public-surface.test.ts` can compare it against a literal.
 */
export { deepFreeze } from './freeze.js';

export { MODEL_PROFILE_IDS, isModelProfileId } from './types.js';
export type {
  GatewayEnvironment,
  ModelProfile,
  ModelProfileId,
  ProfileDeterminism,
  ProfileExecution,
  ProfileLimits,
  ProfileRetentionRequirement,
  PromotionState,
  ProviderRetentionDescriptor,
  RetentionPosture,
} from './types.js';

export { PROFILE_CALL_CEILINGS, REGISTRY_CEILINGS } from './ceilings.js';
export type { CallCeiling } from './ceilings.js';

export { MODEL_PROFILE_REGISTRY_V1, MODEL_PROFILE_REGISTRY_VERSION } from './registry.js';

export { STUB_PROVIDER_ID } from './provider-ids.js';

export { ProfileCeilingExceededError, assertProfileWithinCeilings } from './load.js';

export {
  LocalProfileNotCallableError,
  ProfileNotApprovedError,
  ProfileRefusalError,
  ProviderRetentionUnacceptableError,
  UnknownProfileError,
  hasAcceptableRetention,
  resolveProfile,
} from './resolve.js';
export type {
  ProfileRefusal,
  ProfileRefusalReason,
  ProfileResolution,
  ResolvedProfile,
} from './resolve.js';
