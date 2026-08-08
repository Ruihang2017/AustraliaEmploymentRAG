/**
 * EVID-02 acceptance item 1 — STRUCTURED-ONLY SUPPRESSION, proved by the compiler.
 *
 * HOW THIS RUNS: by `tsc`, through `pnpm typecheck`. This file is named in
 * `packages/pii/tsconfig.json`'s `include`, so a violation is a compile error in the standing gate,
 * not a silently skipped test. (`vitest --typecheck` reports no diagnostics at all with this
 * repository's pinned toolchain — the finding `EVID-01` records in
 * `test/contract/types.test-d.ts`.)
 *
 * WHAT IT ASSERTS. `isExplainedByStructuredChannel` takes EXACTLY the finding and the `structured`
 * block. No role, header, flag, environment variable, acknowledgement or permission can reach it —
 * PRD §37.2's *"not a generic 'ignore warning' button"*, sub-PRD D4, `UAT-PII-02`. Both styles are
 * deliberate: `expectTypeOf` states the parameter list positively, and each `@ts-expect-error` fails
 * the build if a wider call ever STARTS compiling.
 *
 * THE NEGATIVE CONTROL (ticket test-plan step 4) WAS RUN: on a scratch branch an
 * `acknowledged: boolean` third parameter was added to the predicate and made to suppress. The
 * `Parameters<>` assertion below went red and every `@ts-expect-error` in the widening block became
 * an "unused '@ts-expect-error' directive" error, so `pnpm typecheck` failed. Discarded afterwards.
 */
import { expectTypeOf } from 'vitest';

import type { PiiFinding } from '../../src/contract/finding.js';
import type { StructuredChannels } from '../../src/contract/request.js';
import type { PiiStages } from '../../src/contract/pipeline.js';
import type { CombinationAssessment } from '../../src/context/combination.js';
import type { CombinationDimensionName } from '../../src/context/dimensions.js';
import { applyCombinationRules, evaluateCombination } from '../../src/context/combination.js';
import { applyPublicEntityRules, isExplainedByStructuredChannel } from '../../src/context/publicEntity.js';

// --- acceptance item 1: the suppression predicate's inputs are closed --------------------------

expectTypeOf<Parameters<typeof isExplainedByStructuredChannel>>().toEqualTypeOf<
  [PiiFinding, StructuredChannels | undefined]
>();

expectTypeOf<ReturnType<typeof isExplainedByStructuredChannel>>().toEqualTypeOf<boolean>();

const FINDING: PiiFinding = {
  field: 'structured.employer',
  start: 0,
  end: 1,
  category: 'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME',
  severity: 'BLOCKING',
  suggestedPlaceholder: 'Employee A',
};

// @ts-expect-error an acknowledgement cannot reach the suppression predicate
export const withAcknowledgement = isExplainedByStructuredChannel(FINDING, {}, true);

// @ts-expect-error a role cannot reach the suppression predicate
export const withRole = isExplainedByStructuredChannel(FINDING, {}, 'OWNER');

// @ts-expect-error a header cannot reach the suppression predicate
export const withHeader = isExplainedByStructuredChannel(FINDING, {}, { 'x-override': '1' });

// @ts-expect-error a flag cannot reach the suppression predicate
export const withFlag = isExplainedByStructuredChannel(FINDING, {}, { force: true });

/** …and the structured block itself still carries exactly the three PRD §37.2 channels. */
expectTypeOf<keyof StructuredChannels>().toEqualTypeOf<'employer' | 'abn' | 'publicCaseParty'>();

// @ts-expect-error a fourth structured channel is a product change (PRD §45.5), not a refactor
export const fourthChannel: StructuredChannels = { publicRegisterId: 'x' };

// --- the stages are exactly EVID-01's frozen ports, not a superset ------------------------------

expectTypeOf(applyPublicEntityRules).toEqualTypeOf<PiiStages['applyPublicEntityRules']>();
expectTypeOf(applyCombinationRules).toEqualTypeOf<PiiStages['applyCombinationRules']>();

// --- acceptance item 7: the explanation surface names dimensions, and cannot carry text ---------

expectTypeOf<CombinationAssessment['fired']>().toEqualTypeOf<readonly CombinationDimensionName[]>();

expectTypeOf<keyof CombinationAssessment>().toEqualTypeOf<
  'rule' | 'version' | 'fired' | 'field' | 'start' | 'end' | 'blocked'
>();

const ASSESSMENT_BASE = {
  rule: 'COMBINATION_RULE_V1',
  version: 1,
  fired: [],
  field: 'question',
  start: 0,
  end: 0,
  blocked: false,
} as const;

export const assessmentWithText: CombinationAssessment = {
  ...ASSESSMENT_BASE,
  // @ts-expect-error the assessment must not be able to carry the matched text
  matchedText: 'the only night baker',
};

export const assessmentWithExcerpt: CombinationAssessment = {
  ...ASSESSMENT_BASE,
  // @ts-expect-error nor an excerpt, nor any other rendering of the request
  excerpt: 'the only night baker',
};

expectTypeOf(evaluateCombination).returns.toEqualTypeOf<CombinationAssessment>();
