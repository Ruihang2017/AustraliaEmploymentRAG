/**
 * EVID-01 deliverable 12 — per-category recall and precision over the synthetic corpus.
 *
 * PURE. Corpus in, report out. Reading the corpus from disk and writing
 * `test/deterministic/recall-report.json` both live in the test tree, so `src/**` still opens no
 * file, imports no Node builtin and reads no environment variable — the property the import-graph
 * test enforces and the reason `PII-001`'s *"zero raw logging"* is checkable at all.
 *
 * DETERMINISM. The report is built by iterating `PII_CATEGORY_VALUES`, never `Object.keys` of an
 * accumulator, and every ratio is rounded to four decimal places, so the committed JSON is
 * byte-stable across runs and platforms. If two runs differ, the builder is wrong — do not loosen the
 * equality assertion in `recall-report.test.ts`.
 *
 * `deferred` IS THE ONLY WAY A POSITIVE CASE LEAVES THE RECALL NUMERATOR, it carries an owner and a
 * reason, and it is printed on every run. `IDENTIFYING_COMBINATION` (PRD §37.1 blocked row 7) is
 * deferred to `EVID-02` — it IS the combination/risk stage the Non-goals assign there — and its
 * cases are authored here so the gap is visible rather than absent. Quietly demoting a case the
 * detectors miss is the failure mode this mechanism exists to make impossible to hide.
 *
 * MINIMUM RECALL. 100% for the three checksum-verifiable categories (TFN, Medicare, bank/card), per
 * deliverable 12. Every other category is RECORDED, not floored: the target is sub-PRD Q-EVID-2, a
 * Founder risk decision (PRD §45.5). The test asserts no floor is below 1, so "lowering the bar"
 * cannot be done by editing a number.
 */
import type { PiiCategory } from '../contract/category.js';
import { NON_PRD_CATEGORY, PII_CATEGORY_VALUES } from '../contract/category.js';
import type { PiiFinding } from '../contract/finding.js';

export interface CorpusSpan {
  readonly start: number;
  readonly end: number;
}

export interface CorpusPositive {
  readonly id: string;
  readonly field: string;
  readonly value: string;
  readonly expected: readonly CorpusSpan[];
  readonly note: string;
  readonly synthetic: true;
}

export interface CorpusDeferred {
  readonly id: string;
  readonly field: string;
  readonly value: string;
  readonly owner: string;
  readonly reason: string;
  readonly synthetic: true;
}

export interface CorpusNegative {
  readonly id: string;
  readonly field: string;
  readonly value: string;
  readonly note: string;
  /** The PRD §37.1 ALLOWED row this case comes from, quoted. */
  readonly prdAllowedRow: string;
  readonly synthetic: true;
}

export interface CorpusCategoryFile {
  readonly category: PiiCategory;
  /** The PRD §37.1 row this category is derived from, quoted. */
  readonly prdRow: string;
  readonly positives: readonly CorpusPositive[];
  readonly negatives: readonly CorpusNegative[];
  readonly deferred: readonly CorpusDeferred[];
}

export interface Corpus {
  readonly categories: readonly CorpusCategoryFile[];
  readonly sharedNegatives: readonly CorpusNegative[];
}

/** How the report gets findings for one case. The test supplies `admit`; the builder stays pure. */
export type CorpusRunner = (field: string, value: string) => readonly PiiFinding[];

export interface CategoryReport {
  readonly positives: number;
  readonly detected: number;
  readonly recall: number;
  readonly negatives: number;
  readonly falsePositives: number;
  readonly precision: number;
  readonly deferred: number;
  readonly detectedBy: string;
}

export interface DeferredEntry {
  readonly caseId: string;
  readonly category: PiiCategory;
  readonly owner: string;
  readonly reason: string;
}

export interface RecallReport {
  readonly version: number;
  readonly limitsVersion: number;
  readonly categories: Readonly<Record<string, CategoryReport>>;
  readonly deferred: readonly DeferredEntry[];
  readonly minimumRecall: Readonly<Record<string, number>>;
}

/** Deliverable 12's floors. Checksum-verifiable categories only; never lowered, only added to. */
export const MINIMUM_RECALL: Readonly<Record<string, number>> = Object.freeze({
  TAX_FILE_NUMBER: 1,
  MEDICARE_NUMBER: 1,
  BANK_OR_CARD_DETAIL: 1,
});

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : round(numerator / denominator);
}

/** A case counts as detected when a finding of its category reproduces an expected span exactly. */
function isDetected(
  category: PiiCategory,
  expected: readonly CorpusSpan[],
  findings: readonly PiiFinding[],
): boolean {
  return expected.every((span) =>
    findings.some(
      (finding) =>
        finding.category === category &&
        finding.start === span.start &&
        finding.end === span.end,
    ),
  );
}

export function buildRecallReport(
  corpus: Corpus,
  run: CorpusRunner,
  limitsVersion: number,
): RecallReport {
  const byCategory = new Map<PiiCategory, CorpusCategoryFile>();
  for (const file of corpus.categories) byCategory.set(file.category, file);

  const categories: Record<string, CategoryReport> = {};
  const deferred: DeferredEntry[] = [];

  for (const category of PII_CATEGORY_VALUES) {
    const file = byCategory.get(category);
    if (!file) continue;

    let detected = 0;
    for (const positive of file.positives) {
      if (isDetected(category, positive.expected, run(positive.field, positive.value))) detected += 1;
    }

    for (const entry of file.deferred) {
      deferred.push({
        caseId: entry.id,
        category,
        owner: entry.owner,
        reason: entry.reason,
      });
    }

    // The whole-request limit category is not a §37.1 row, so §37.1's allowed rows are not its
    // negatives; it is scored against its own negatives only.
    const negatives =
      category === NON_PRD_CATEGORY
        ? file.negatives
        : [...file.negatives, ...corpus.sharedNegatives];
    let falsePositives = 0;
    for (const negative of negatives) {
      const findings = run(negative.field, negative.value);
      if (findings.some((finding) => finding.category === category)) falsePositives += 1;
    }

    // A category with no positives at all is a DEFERRED row, and it is reported at 0% — not at the
    // 1 that "0 of 0" would otherwise produce. A gap that reads as perfect recall is worse than no
    // measurement.
    const measured = file.positives.length > 0;

    categories[category] = {
      positives: file.positives.length,
      detected,
      recall: measured ? ratio(detected, file.positives.length) : 0,
      negatives: negatives.length,
      falsePositives,
      precision: measured ? ratio(detected, detected + falsePositives) : 0,
      deferred: file.deferred.length,
      detectedBy: measured ? 'EVID-01' : 'EVID-02',
    };
  }

  return {
    version: 1,
    limitsVersion,
    categories,
    deferred,
    minimumRecall: MINIMUM_RECALL,
  };
}
