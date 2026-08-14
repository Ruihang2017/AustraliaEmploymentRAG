/**
 * EVID-07 deliverable 3 — the ceilings, as frozen data.
 *
 * Two different things live here and they must not be confused:
 *
 *  - `PROFILE_CALL_CEILINGS` carries PRD §36.7's own table cells VERBATIM, including the prose of the
 *    "Hosted synthesis calls" and "Hard elapsed execution" rows. The *number of calls* per workflow is
 *    `ASK-02`/`ASK-10`'s to enforce, not this package's; the cells are published here so the workflow
 *    and the gateway cannot disagree about what the PRD says. `test/profiles/ceilings.test.ts`
 *    compares each string against `docs/PRD.md` itself.
 *  - `REGISTRY_CEILINGS` is the absolute per-profile maximum a configured profile may declare. A
 *    registry entry above it is REJECTED AT LOAD (`load.ts`), never clamped at call time — a clamp
 *    would let a mis-configuration serve quietly at the wrong limit.
 *
 * The token numbers are benchmark-selected configuration (PRD §14.4: *"provider token/time ceilings
 * are benchmark-selected configuration—not permanent requirements"*). They ship conservative and are
 * marked for `GOLD-15` writeback; changing one is a docs PR against the EVID-07 ticket, never a taste
 * edit here.
 */
import { deepFreeze } from './freeze.js';
import type { ModelProfileId, ProfileLimits } from './types.js';

/** PRD §36.7's Quick and Deep columns, transcribed. */
export interface CallCeiling {
  /** The PRD's own "Hosted synthesis calls" cell. */
  readonly hostedSynthesisCalls: string;
  /** The same cell as a number of NON-REPAIR calls, for a workflow that needs to count. */
  readonly maxHostedSynthesisCalls: number;
  /** PRD §36.7 allows exactly one repair call in both columns (*"+ optional repair"*). */
  readonly maxRepairCalls: 1;
  /** The PRD's own "Hard elapsed execution" cell. */
  readonly hardElapsedExecution: string;
  readonly hardElapsedMs: number;
}

export const PROFILE_CALL_CEILINGS: Readonly<Record<'QUICK' | 'DEEP', CallCeiling>> = deepFreeze({
  QUICK: {
    hostedSynthesisCalls: '1 + optional repair',
    maxHostedSynthesisCalls: 1,
    maxRepairCalls: 1,
    hardElapsedExecution: '60 seconds',
    hardElapsedMs: 60_000,
  },
  DEEP: {
    hostedSynthesisCalls: 'Up to 3 total + optional repair',
    maxHostedSynthesisCalls: 3,
    maxRepairCalls: 1,
    hardElapsedExecution: '180 seconds',
    hardElapsedMs: 180_000,
  },
} as const);

/**
 * The maximum a registry entry may declare, per profile.
 *
 * `maxElapsedMs` is NOT configuration: it comes straight from PRD §36.7's hard elapsed limits (Quick
 * 60 s, Deep 180 s). `STRUCTURED_REPAIR` sits inside the parent Quick workflow's budget, so it may not
 * exceed the Quick ceiling. The token numbers are the `GOLD-15` writeback targets.
 *
 * The two `LOCAL_IN_SEARCH_BOUNDARY` profiles carry ceilings only so the load check is total; they are
 * never called through this gateway.
 */
export const REGISTRY_CEILINGS: Readonly<Record<ModelProfileId, ProfileLimits>> = deepFreeze({
  // GOLD-15 writeback: local runtime limits belong to RETR-07; these exist for load-check totality.
  QUERY_EMBEDDING: { maxInputTokens: 8_192, maxOutputTokens: 0, maxElapsedMs: 5_000 },
  // GOLD-15 writeback: as above.
  LOCAL_RERANK: { maxInputTokens: 32_768, maxOutputTokens: 0, maxElapsedMs: 10_000 },
  // GOLD-15 writeback: token ceilings are benchmark-selected (PRD §14.4).
  QUICK_SYNTHESIS: { maxInputTokens: 128_000, maxOutputTokens: 8_192, maxElapsedMs: 60_000 },
  // GOLD-15 writeback: as above.
  DEEP_SYNTHESIS: { maxInputTokens: 200_000, maxOutputTokens: 16_384, maxElapsedMs: 180_000 },
  // GOLD-15 writeback: as above. Bounded by the Quick ceiling — the repair sits inside its parent.
  STRUCTURED_REPAIR: { maxInputTokens: 128_000, maxOutputTokens: 8_192, maxElapsedMs: 60_000 },
  // GOLD-15 writeback: as above.
  EVALUATION_JUDGE: { maxInputTokens: 200_000, maxOutputTokens: 8_192, maxElapsedMs: 180_000 },
} as const);
