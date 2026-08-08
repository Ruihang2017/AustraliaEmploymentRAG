/**
 * EVID-02 deliverable 7 — the versioned identifying-combination rule (PRD §37.2 stage 6).
 *
 * THE RULE IS FROZEN DATA, NEVER A CONDITION. `COMBINATION_RULE_V1` carries the threshold, the
 * required dimension and the narrowing set as values; the evaluator reads them. Changing the
 * behaviour means shipping a `COMBINATION_RULE_V2` with a new `version`, not editing a number inside
 * an `if` — which is what makes the ticket's *"thresholded and versioned"* checkable and what
 * Q-EVID-2 will re-measure against.
 *
 * WHY THESE NUMBERS — derived from `EVID-01`'s corpus, not chosen:
 *
 * - `EVID-01` authored 20 `deferred` cases in
 *   `test/deterministic/corpora/identifying-combination.json` and this ticket must close them. Only
 *   9 of the 20 carry an explicit headcount ("three-person stable", "four-person workshop"). The
 *   other 11 (e.g. "Our one saltwater crocodile handler took stress leave after the incident.")
 *   carry exactly two dimensions: role specificity and a personal event. A plain threshold of 3
 *   would miss 11 of the 20 cases this stage exists to catch. (Negative control, run on a scratch
 *   branch and discarded: setting `threshold` to 3 turns those 11 red.)
 * - A plain threshold of 2 over-fires. `EVID-01`'s `EXACT_DATE_OF_BIRTH` negative *"The dismissal
 *   took effect on 12/03/2024 after the meeting."* has `PERSONAL_EVENT` + `PRECISE_TIME_OR_PLACE`
 *   and would be blocked — a false positive on an ordinary, legitimate question and a direct hit on
 *   PRD §10.1's *"necessary role/duty/location facts MAY be accepted"*.
 * - Hence: a personal event is REQUIRED, and at least one partner must be identity-NARROWING. A
 *   precise time or place counts toward the total but can never be the only partner.
 *
 * THE EXPLANATION IS A SIDE CHANNEL, BY NECESSITY. The ticket asks that *"the finding names the
 * dimensions that fired"*, but `PiiFinding` has exactly six members and
 * `test/contract/types.test-d.ts` asserts that `keyof` list exhaustively — a seventh member is a
 * write to `EVID-01`'s frozen contract, which this ticket's Non-goals forbid. `evaluateCombination`
 * is therefore exported alongside the stage and returns the fired dimension NAMES; `EVID-03` and
 * `ASSR-03` consume it. It carries names, a field and offsets — never text (sub-PRD D3), asserted by
 * a canary scan over `JSON.stringify(assessment)` in `test/entity/leak.test.ts`.
 *
 * THE FINDING'S SPAN. `PiiFinding` has ONE field, so a span cannot cross fields. The finding is
 * attached to the field where `PERSONAL_EVENT` first fired in view order, and spans min-start..
 * max-end of the dimensions that fired IN THAT SAME FIELD.
 */
import type { PiiFinding } from '../contract/finding.js';
import type { PiiStages, StageInput } from '../contract/pipeline.js';
import { deepFreeze } from '../contract/freeze.js';
import { PII_PLACEHOLDERS } from '../deterministic/placeholders.js';
import type { CombinationDimensionName, DimensionHit } from './dimensions.js';
import { COMBINATION_DIMENSION_NAMES, detectDimensions } from './dimensions.js';

export const COMBINATION_RULE_V1 = deepFreeze({
  rule: 'COMBINATION_RULE_V1',
  version: 1,
  /** How many distinct dimensions must fire in total. */
  threshold: 2,
  /** Every one of these must fire. */
  required: ['PERSONAL_EVENT'],
  /** At least one of these must fire. */
  narrowing: ['ROLE_SPECIFICITY', 'SMALL_WORKPLACE', 'RESIDUAL_IDENTIFIER'],
  dimensions: COMBINATION_DIMENSION_NAMES,
} as const);

export interface CombinationAssessment {
  readonly rule: 'COMBINATION_RULE_V1';
  readonly version: number;
  /** Names only. Never text. In `COMBINATION_DIMENSION_NAMES` order, so two runs agree. */
  readonly fired: readonly CombinationDimensionName[];
  /** The field the finding would be attached to; `''` when nothing fired. */
  readonly field: string;
  readonly start: number;
  readonly end: number;
  readonly blocked: boolean;
}

function firstFieldOf(
  fields: Iterable<string>,
  hits: readonly DimensionHit[],
  dimension: CombinationDimensionName,
): string | undefined {
  for (const field of fields) {
    if (hits.some((hit) => hit.field === field && hit.dimension === dimension)) return field;
  }
  return undefined;
}

/**
 * The whole rule, as a pure function of the request and the findings so far. Exported because it is
 * this ticket's explanation surface (see the header) and because it is what the corpus asserts
 * `expectedDimensions` against.
 */
export function evaluateCombination(
  input: StageInput,
  findings: readonly PiiFinding[],
): CombinationAssessment {
  const hits = detectDimensions(input.views, findings);
  const fired = COMBINATION_DIMENSION_NAMES.filter((dimension) =>
    hits.some((hit) => hit.dimension === dimension),
  );

  const requiredMet = COMBINATION_RULE_V1.required.every((dimension) => fired.includes(dimension));
  const narrowingMet = COMBINATION_RULE_V1.narrowing.some((dimension) => fired.includes(dimension));
  const anchorField = firstFieldOf(input.views.keys(), hits, 'PERSONAL_EVENT');
  const blocked =
    requiredMet && narrowingMet && fired.length >= COMBINATION_RULE_V1.threshold && anchorField !== undefined;

  if (!blocked || anchorField === undefined) {
    return {
      rule: 'COMBINATION_RULE_V1',
      version: COMBINATION_RULE_V1.version,
      fired,
      field: '',
      start: 0,
      end: 0,
      blocked: false,
    };
  }

  const inField = hits.filter((hit) => hit.field === anchorField && fired.includes(hit.dimension));
  const start = Math.min(...inField.map((hit) => hit.start));
  const end = Math.max(...inField.map((hit) => hit.end));

  return {
    rule: 'COMBINATION_RULE_V1',
    version: COMBINATION_RULE_V1.version,
    fired,
    field: anchorField,
    start,
    end,
    blocked: true,
  };
}

/** PRD §37.2 stage 6. Appends at most one finding per request; never removes one. */
export const applyCombinationRules: PiiStages['applyCombinationRules'] = (
  input: StageInput,
  findings: readonly PiiFinding[],
): readonly PiiFinding[] => {
  const assessment = evaluateCombination(input, findings);
  if (!assessment.blocked) return findings;
  return [
    ...findings,
    {
      field: assessment.field,
      start: assessment.start,
      end: assessment.end,
      category: 'IDENTIFYING_COMBINATION',
      severity: 'BLOCKING',
      suggestedPlaceholder: PII_PLACEHOLDERS.IDENTIFYING_COMBINATION,
    },
  ];
};
