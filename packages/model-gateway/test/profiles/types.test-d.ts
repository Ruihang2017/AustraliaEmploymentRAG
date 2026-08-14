/**
 * EVID-07 — the type-level assertions for the profiles leaf.
 *
 * Runs under `tsc` through `pnpm typecheck` (named in tsconfig#include). See
 * `test/schema/types.test-d.ts` for why not `vitest --typecheck`.
 */
import { expectTypeOf } from 'vitest';

import { MODEL_PROFILE_REGISTRY_V1 } from '../../src/profiles/registry.js';
import { resolveProfile } from '../../src/profiles/resolve.js';
import type { ProfileResolution } from '../../src/profiles/resolve.js';
import type {
  GatewayEnvironment,
  ModelProfile,
  ModelProfileId,
  ProfileExecution,
  PromotionState,
  RetentionPosture,
} from '../../src/profiles/types.js';

// --- the vocabulary is closed --------------------------------------------------------------------

expectTypeOf<ModelProfileId>().toEqualTypeOf<
  | 'QUERY_EMBEDDING'
  | 'LOCAL_RERANK'
  | 'QUICK_SYNTHESIS'
  | 'DEEP_SYNTHESIS'
  | 'STRUCTURED_REPAIR'
  | 'EVALUATION_JUDGE'
>();
expectTypeOf<ProfileExecution>().toEqualTypeOf<'HOSTED' | 'LOCAL_IN_SEARCH_BOUNDARY'>();
expectTypeOf<PromotionState>().toEqualTypeOf<'CANDIDATE' | 'APPROVED'>();
expectTypeOf<RetentionPosture>().toEqualTypeOf<'ZERO' | 'APPROVED_MINIMAL'>();
expectTypeOf<GatewayEnvironment>().toEqualTypeOf<'PRODUCTION' | 'EVALUATION'>();

// --- determinism is not configurable into sampling ----------------------------------------------

declare const profile: ModelProfile;

expectTypeOf<ModelProfile['determinism']['temperature']>().toEqualTypeOf<0>();
expectTypeOf<ModelProfile['determinism']['topP']>().toEqualTypeOf<1>();

// @ts-expect-error a profile cannot turn sampling on
const sampling: ModelProfile['determinism'] = { temperature: 0.7, topP: 0.9 };
void sampling;

// @ts-expect-error retention posture is not optional and noTraining cannot be false
const training: ModelProfile['retention'] = { noTraining: false, mode: 'ZERO' };
void training;

// --- the registry is readonly at every level ----------------------------------------------------

// @ts-expect-error the shipped registry is readonly
MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS = profile;

// @ts-expect-error a registry entry is readonly
MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS.promotionState = 'APPROVED';

// @ts-expect-error an allowlist is readonly
MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS.allowedProviderIds.push('anything');

// --- resolveProfile always states which providers it resolved against ---------------------------

// @ts-expect-error the provider descriptor list is required — there is no implicit registry
export const withoutProviders: ProfileResolution = resolveProfile('QUICK_SYNTHESIS', 'PRODUCTION');

// @ts-expect-error a profile has no member naming a concrete model
export const modelName: unknown = profile.model;

// @ts-expect-error a profile carries no credential
export const profileKey: unknown = profile.apiKey;

// @ts-expect-error a profile carries no base URL
export const profileUrl: unknown = profile.baseUrl;
