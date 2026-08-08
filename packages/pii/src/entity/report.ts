/**
 * EVID-02 deliverable 11 — per-category recall and precision for the stage-4-6 corpus.
 *
 * PURE, exactly like `src/deterministic/report.ts`: corpus in, report out. Reading the corpus and
 * writing `test/entity/recall-report.json` both live in the test tree, so `src/**` still opens no
 * file and reads no environment variable.
 *
 * WHY A NEW BUILDER RATHER THAN `buildRecallReport`. `EVID-01`'s report carries `detectedBy`, a
 * single string derived only from whether the category had any positives at all — true then, and
 * misleading now that three stages can produce the same category. This builder records
 * `detectedByStage` COUNTS (`deterministic` / `entity` / `combination`), derived by running each
 * case TWICE — once under `CONSERVATIVE_STAGE_DEFAULTS`, once under `PII_STAGES` — and diffing. No
 * instrumentation is added inside `src/**` to find out which stage fired.
 *
 * MATCHING. Person-name positives match on exact `(category, start, end)`, as `EVID-01` does.
 * Combination positives match on `(category, field)` plus a non-empty span inside the field: the
 * union span is an implementation detail, and pinning it in the corpus would make the corpus measure
 * the implementation against itself.
 *
 * DETERMINISM. Categories are iterated from `PII_CATEGORY_VALUES`, never `Object.keys` of an
 * accumulator, and every ratio is rounded to four decimal places, so the committed JSON is
 * byte-stable. NO TIMING OR MEMORY NUMBER GOES IN THIS FILE — those are one-off measurements
 * recorded in the ADR and the PR (`test/entity/budget.test.ts`).
 */
import type { PiiCategory } from '../contract/category.js';
import { PII_CATEGORY_VALUES } from '../contract/category.js';
import type { PiiFinding } from '../contract/finding.js';
import type { Corpus, CorpusPositive } from '../deterministic/report.js';

/** How the report gets findings for one case, under one stage set. */
export type EntityCorpusRunner = (field: string, value: string) => readonly PiiFinding[];

export interface EntityRunners {
  /** `CONSERVATIVE_STAGE_DEFAULTS` — what `EVID-01` alone detects. */
  readonly baseline: EntityCorpusRunner;
  /** `PII_STAGES` — the whole PRD §37.2 pipeline. */
  readonly full: EntityCorpusRunner;
}

export interface DetectedByStage {
  readonly deterministic: number;
  readonly entity: number;
  readonly combination: number;
}

export interface EntityCategoryReport {
  readonly positives: number;
  readonly detected: number;
  readonly recall: number;
  readonly negatives: number;
  readonly falsePositives: number;
  readonly precision: number;
  readonly detectedByStage: DetectedByStage;
}

export interface EntityRuntimeReport {
  readonly categories: Readonly<Record<string, EntityCategoryReport>>;
}

export interface EntityRecallReport {
  readonly version: number;
  readonly limitsVersion: number;
  readonly combinationRuleVersion: number;
  readonly runtimeOff: EntityRuntimeReport;
  /** Never silently absent: when no artifact is present the row states the reason by name. */
  readonly runtimeOn: { readonly skipped: string } | EntityRuntimeReport;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

/**
 * A combination case has no meaningful pinned span (see the header): `expected` is authored as a
 * single `{start: 0, end: 0}` marker and matching falls back to "a finding of this category, on this
 * field, with a non-empty span".
 */
function isSpanFree(positive: CorpusPositive): boolean {
  return positive.expected.every((span) => span.start === 0 && span.end === 0);
}

function detects(
  category: PiiCategory,
  positive: CorpusPositive,
  findings: readonly PiiFinding[],
): boolean {
  const ofCategory = findings.filter((finding) => finding.category === category);
  if (isSpanFree(positive)) {
    return ofCategory.some(
      (finding) => finding.field === positive.field && finding.end > finding.start,
    );
  }
  return positive.expected.every((span) =>
    ofCategory.some((finding) => finding.start === span.start && finding.end === span.end),
  );
}

export function buildEntityRecallReport(
  corpus: Corpus,
  runners: EntityRunners,
  limitsVersion: number,
  combinationRuleVersion: number,
  runtimeSkipReason: string,
): EntityRecallReport {
  const byCategory = new Map<PiiCategory, Corpus['categories'][number]>();
  for (const file of corpus.categories) byCategory.set(file.category, file);

  const categories: Record<string, EntityCategoryReport> = {};

  for (const category of PII_CATEGORY_VALUES) {
    const file = byCategory.get(category);
    if (!file) continue;

    let detected = 0;
    let byDeterministic = 0;
    let byEntity = 0;
    let byCombination = 0;

    for (const positive of file.positives) {
      const full = runners.full(positive.field, positive.value);
      if (!detects(category, positive, full)) continue;
      detected += 1;
      const baseline = runners.baseline(positive.field, positive.value);
      if (detects(category, positive, baseline)) byDeterministic += 1;
      else if (category === 'IDENTIFYING_COMBINATION') byCombination += 1;
      else byEntity += 1;
    }

    const negatives = [...file.negatives, ...corpus.sharedNegatives];
    let falsePositives = 0;
    for (const negative of negatives) {
      const findings = runners.full(negative.field, negative.value);
      if (findings.some((finding) => finding.category === category)) falsePositives += 1;
    }

    categories[category] = {
      positives: file.positives.length,
      detected,
      recall: ratio(detected, file.positives.length),
      negatives: negatives.length,
      falsePositives,
      precision: ratio(detected, detected + falsePositives),
      detectedByStage: {
        deterministic: byDeterministic,
        entity: byEntity,
        combination: byCombination,
      },
    };
  }

  return {
    version: 1,
    limitsVersion,
    combinationRuleVersion,
    runtimeOff: { categories },
    runtimeOn: { skipped: runtimeSkipReason },
  };
}
