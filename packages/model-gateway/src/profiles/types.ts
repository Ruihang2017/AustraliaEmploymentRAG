/**
 * EVID-07 deliverable 1 — the model-profile vocabulary.
 *
 * The six profile names are PRD §14.4's list, transcribed verbatim in the PRD's own order. Spelling,
 * underscores and order are the spec: renaming or removing one is a PRD change (PRD §45.5), not a
 * refactor. The shape (frozen tuple + derived union + runtime guard) is deliberately the FND-03
 * enum-family shape, so if these names are ever promoted into `packages/contracts` it is a file move
 * rather than a rewrite.
 *
 * `test/profiles/prd-14-4-profiles.test.ts` asserts every name below occurs verbatim in `docs/PRD.md`.
 */
export const MODEL_PROFILE_IDS = Object.freeze([
  'QUERY_EMBEDDING',
  'LOCAL_RERANK',
  'QUICK_SYNTHESIS',
  'DEEP_SYNTHESIS',
  'STRUCTURED_REPAIR',
  'EVALUATION_JUDGE',
] as const);

export type ModelProfileId = (typeof MODEL_PROFILE_IDS)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isModelProfileId = (value: unknown): value is ModelProfileId =>
  typeof value === 'string' && (MODEL_PROFILE_IDS as readonly string[]).includes(value);

/**
 * Where a profile executes (PRD §17.3).
 *
 * `LOCAL_IN_SEARCH_BOUNDARY` profiles appear in this registry because PRD §14.4's promotion process
 * covers all six, but they execute inside the search boundary (`11-retrieval-engine`/`RETR-07`) and
 * calling one through this gateway is a typed error. This package loads no local model and holds no
 * ONNX or tokenizer artefact.
 */
export type ProfileExecution = 'HOSTED' | 'LOCAL_IN_SEARCH_BOUNDARY';

/**
 * PRD §14.4: *"A candidate MUST pass security/cost compatibility, development, frozen validation,
 * blind testing and full non-regression before promotion."* Everything ships `CANDIDATE` until
 * `GOLD-15` has measured it and the Founder has approved the promotion on that evidence.
 */
export type PromotionState = 'CANDIDATE' | 'APPROVED';

/** PRD §10.2: *"Provider configurations MUST use no-training and zero or approved minimal retention."* */
export type RetentionPosture = 'ZERO' | 'APPROVED_MINIMAL';

/**
 * The environment a resolution is requested for. `EVALUATION` is `21-evaluation-600`'s harness, the
 * only place a `CANDIDATE` profile may run — that is what "candidate" means.
 */
export type GatewayEnvironment = 'PRODUCTION' | 'EVALUATION';

/** Determinism settings sent with every call. Sampling is off; there is no "creative" profile. */
export interface ProfileDeterminism {
  readonly temperature: 0;
  readonly topP: 1;
  readonly seed?: number;
}

export interface ProfileRetentionRequirement {
  readonly noTraining: true;
  readonly mode: RetentionPosture;
}

/** The hard ceilings PRD §36.7 and §14.4 place on ONE call. */
export interface ProfileLimits {
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxElapsedMs: number;
}

export interface ModelProfile {
  readonly id: ModelProfileId;
  readonly execution: ProfileExecution;
  readonly promotionState: PromotionState;
  /** Provider ids this profile may use. A provider outside this list is never selected — PRD §17.3. */
  readonly allowedProviderIds: readonly string[];
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxElapsedMs: number;
  readonly determinism: ProfileDeterminism;
  readonly retention: ProfileRetentionRequirement;
  /**
   * PRD §14.4: *"Every fallback requires independent approval."* Absent by default and absent from
   * every shipped entry; when present, `resolveProfile` still refuses it unless the target profile is
   * itself `APPROVED`.
   */
  readonly approvedFallbackProfileId?: ModelProfileId;
}

/**
 * The structural minimum `resolveProfile` needs to check PRD §10.2's retention precondition.
 * `src/providers/registry.ts`'s `ProviderDescriptor` satisfies it; declaring it here rather than
 * importing the provider leaf keeps `src/profiles/**` free of any dependency on the transport side.
 */
export interface ProviderRetentionDescriptor {
  readonly providerId: string;
  readonly retention: { readonly noTraining: boolean; readonly mode: string };
}
