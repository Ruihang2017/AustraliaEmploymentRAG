/**
 * EVID-07 deliverable 1 — the six PRD §14.4 profiles as versioned frozen data.
 *
 * TWO PROPERTIES OF THIS FILE ARE LOAD-BEARING AND MUST NOT BE "IMPROVED":
 *
 *  1. **Every hosted profile ships `CANDIDATE`.** Nothing here has passed PRD §14.4's promotion gates
 *     — `GOLD-15` measures the candidates and the Founder approves promotion AFTER seeing that report.
 *     Shipping `APPROVED` would fake a promotion that never happened. The consequence is intended and
 *     is documented in README.md: in `PRODUCTION` every hosted profile resolves to
 *     `PROFILE_NOT_APPROVED` → `GENERATION_UNAVAILABLE` (503) while Search stays available
 *     (PRD §8.2, §34.9; `UAT-ANS-08`). Tests resolve in the `EVALUATION` environment.
 *  2. **No entry carries `approvedFallbackProfileId`.** PRD §14.4: *"Every fallback requires
 *     independent approval."* An absent field is the encoding of "no approval has been given".
 *     `test/providers/fallback.test.ts` asserts the shipped registry declares none.
 *
 * The single provider id named here is the deterministic in-process stub. Which real providers meet
 * PRD §10.2's no-training / zero-or-approved-minimal retention terms is sub-PRD **Q-EVID-4**, a
 * Founder decision; this ticket encodes the requirement as a precondition and names no vendor.
 */
import { STUB_PROVIDER_ID } from './provider-ids.js';
import { assertProfileWithinCeilings } from './load.js';
import { deepFreeze } from './freeze.js';
import { MODEL_PROFILE_IDS } from './types.js';
import type { ModelProfile, ModelProfileId } from './types.js';

/** The registry version recorded alongside every `model_execution` row. */
export const MODEL_PROFILE_REGISTRY_VERSION = 'model-profile-registry-v1';

const DETERMINISM = { temperature: 0, topP: 1 } as const;
const ZERO_RETENTION = { noTraining: true, mode: 'ZERO' } as const;

const ENTRIES: Readonly<Record<ModelProfileId, ModelProfile>> = {
  QUERY_EMBEDDING: {
    id: 'QUERY_EMBEDDING',
    execution: 'LOCAL_IN_SEARCH_BOUNDARY',
    promotionState: 'CANDIDATE',
    allowedProviderIds: [],
    maxInputTokens: 8_192,
    maxOutputTokens: 0,
    maxElapsedMs: 5_000,
    determinism: DETERMINISM,
    retention: ZERO_RETENTION,
  },
  LOCAL_RERANK: {
    id: 'LOCAL_RERANK',
    execution: 'LOCAL_IN_SEARCH_BOUNDARY',
    promotionState: 'CANDIDATE',
    allowedProviderIds: [],
    maxInputTokens: 32_768,
    maxOutputTokens: 0,
    maxElapsedMs: 10_000,
    determinism: DETERMINISM,
    retention: ZERO_RETENTION,
  },
  QUICK_SYNTHESIS: {
    id: 'QUICK_SYNTHESIS',
    execution: 'HOSTED',
    promotionState: 'CANDIDATE',
    allowedProviderIds: [STUB_PROVIDER_ID],
    // GOLD-15 writeback (PRD §14.4 benchmark-selected configuration).
    maxInputTokens: 96_000,
    maxOutputTokens: 4_096,
    // PRD §36.7 Quick "Hard elapsed execution | 60 seconds".
    maxElapsedMs: 60_000,
    determinism: DETERMINISM,
    retention: ZERO_RETENTION,
  },
  DEEP_SYNTHESIS: {
    id: 'DEEP_SYNTHESIS',
    execution: 'HOSTED',
    promotionState: 'CANDIDATE',
    allowedProviderIds: [STUB_PROVIDER_ID],
    // GOLD-15 writeback.
    maxInputTokens: 160_000,
    maxOutputTokens: 8_192,
    // PRD §36.7 Deep "Hard elapsed execution | 180 seconds".
    maxElapsedMs: 180_000,
    determinism: DETERMINISM,
    retention: ZERO_RETENTION,
  },
  STRUCTURED_REPAIR: {
    id: 'STRUCTURED_REPAIR',
    execution: 'HOSTED',
    promotionState: 'CANDIDATE',
    allowedProviderIds: [STUB_PROVIDER_ID],
    // GOLD-15 writeback.
    maxInputTokens: 96_000,
    maxOutputTokens: 4_096,
    // PRD §36.7 states no separate ceiling for the repair: it sits inside the parent Quick budget, so
    // it may not exceed the Quick hard elapsed limit. Configuration under PRD §14.4, not a PRD claim.
    maxElapsedMs: 60_000,
    determinism: DETERMINISM,
    retention: ZERO_RETENTION,
  },
  EVALUATION_JUDGE: {
    id: 'EVALUATION_JUDGE',
    execution: 'HOSTED',
    promotionState: 'CANDIDATE',
    allowedProviderIds: [STUB_PROVIDER_ID],
    // GOLD-15 writeback.
    maxInputTokens: 160_000,
    maxOutputTokens: 4_096,
    maxElapsedMs: 180_000,
    determinism: DETERMINISM,
    retention: ZERO_RETENTION,
  },
};

for (const id of MODEL_PROFILE_IDS) assertProfileWithinCeilings(ENTRIES[id]);

export const MODEL_PROFILE_REGISTRY_V1: Readonly<Record<ModelProfileId, ModelProfile>> =
  deepFreeze(ENTRIES);
