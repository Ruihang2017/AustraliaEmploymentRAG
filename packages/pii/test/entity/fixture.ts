/**
 * EVID-02 — the shared fixture for the stage-4-6 suites: paths, the corpora loaders and the two
 * runners the differential report is built from.
 *
 * Not a `*.test.*` file, so Vitest does not collect it. Paths are derived from
 * `test/contract/fixture.ts`'s `PACKAGE_ROOT`, which is itself resolved from `import.meta.url` and
 * never from `process.cwd()` — one root, so no suite can disagree about it. The corpora are read
 * with `readFileSync` + `JSON.parse` because `packages/pii/tsconfig.json` may carry only
 * `extends`/`include` (the FND-01 skeleton rule), so `resolveJsonModule` is unavailable.
 *
 * `loadStageCanaries` reads the SECOND key of `EVID-01`'s canary manifest. One manifest, one module:
 * `ASSR-03` gets both lists from here and never forks its own copy (this ticket's Feedback
 * obligation).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PiiFinding } from '../../src/contract/finding.js';
import type { PiiAdmissionRequest } from '../../src/contract/request.js';
import type { PiiAdmissionResult } from '../../src/contract/result.js';
import { CONSERVATIVE_STAGE_DEFAULTS, admit } from '../../src/contract/pipeline.js';
import { PII_STAGES } from '../../src/context/stages.js';
import type { Corpus, CorpusCategoryFile } from '../../src/deterministic/report.js';
import type { CanaryCase } from '../contract/fixture.js';
import { CORPORA_DIR, PACKAGE_ROOT, loadCorpus } from '../contract/fixture.js';

export const ENTITY_CORPORA_DIR = join(PACKAGE_ROOT, 'test', 'entity', 'corpora');
export const CONTEXT_CORPORA_DIR = join(PACKAGE_ROOT, 'test', 'context', 'corpora');
export const ENTITY_RECALL_REPORT_PATH = join(PACKAGE_ROOT, 'test', 'entity', 'recall-report.json');
export const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
export const ADR_PATH = join(REPO_ROOT, 'docs', 'adr', '0001-local-pii-entity-runtime.md');

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** The person-name corpus, in `EVID-01`'s `CorpusCategoryFile` shape. */
export function loadEntityCorpus(): CorpusCategoryFile {
  return readJson<CorpusCategoryFile>(join(ENTITY_CORPORA_DIR, 'entity-person-name.json'));
}

export interface CombinationCase {
  readonly id: string;
  readonly field: string;
  readonly value: string;
  readonly expectedDimensions: readonly string[];
  readonly note: string;
  readonly synthetic: true;
}

export interface ContextNegative {
  readonly id: string;
  readonly field: string;
  readonly value: string;
  readonly note: string;
  readonly prdAllowedRow: string;
  readonly synthetic: true;
}

export interface CombinationCorpus {
  readonly rule: string;
  readonly prdRow: string;
  readonly blocked: readonly CombinationCase[];
  readonly nearMisses: readonly ContextNegative[];
}

export function loadCombinationCorpus(): CombinationCorpus {
  return readJson<CombinationCorpus>(join(CONTEXT_CORPORA_DIR, 'combination.json'));
}

export interface NecessaryFactCase {
  readonly id: string;
  readonly field: string;
  readonly value: string;
  readonly rule: string;
  readonly note: string;
  readonly prdAllowedRow: string;
  readonly synthetic: true;
}

export function loadNecessaryFacts(): readonly NecessaryFactCase[] {
  return readJson<{ cases: readonly NecessaryFactCase[] }>(
    join(CONTEXT_CORPORA_DIR, 'necessary-facts.json'),
  ).cases;
}

export interface PublicEntityCase {
  readonly id: string;
  readonly channel: 'employer' | 'abn' | 'publicCaseParty';
  readonly value: string;
  readonly structuredDecision: 'ACCEPT' | 'REJECT';
  readonly freeTextDecision: 'ACCEPT' | 'REJECT';
  readonly note: string;
  readonly prdAllowedRow: string;
  readonly synthetic: true;
}

export function loadPublicEntityMatrix(): readonly PublicEntityCase[] {
  return readJson<{ cases: readonly PublicEntityCase[] }>(
    join(CONTEXT_CORPORA_DIR, 'public-entity-matrix.json'),
  ).cases;
}

/**
 * `EVID-01`'s canary manifest, second key. Same file, same shape, plus the `stage` the canary
 * exercises — added by this ticket so `ASSR-03` reuses one manifest.
 */
export interface StageCanaryCase extends CanaryCase {
  readonly stage: 'recogniseEntities' | 'applyCombinationRules';
}

export function loadStageCanaries(): readonly StageCanaryCase[] {
  return readJson<{ stageCanaries: readonly StageCanaryCase[] }>(
    join(CORPORA_DIR, 'canaries.json'),
  ).stageCanaries;
}

/** The combined corpus the entity recall report is measured over. */
export function loadCombinedCorpus(): Corpus {
  const shared = loadCorpus().sharedNegatives;
  const name = loadEntityCorpus();
  const combination = loadCombinationCorpus();
  const combinationFile: CorpusCategoryFile = {
    category: 'IDENTIFYING_COMBINATION',
    prdRow: combination.prdRow,
    // A combination finding's span is a union across dimensions, so the corpus pins no span: the
    // `{0, 0}` marker means "a finding of this category, on this field, with a non-empty span".
    positives: combination.blocked.map((entry) => ({
      id: entry.id,
      field: entry.field,
      value: entry.value,
      expected: [{ start: 0, end: 0 }],
      note: entry.note,
      synthetic: true as const,
    })),
    negatives: combination.nearMisses,
    deferred: [],
  };
  return { categories: [name, combinationFile], sharedNegatives: shared };
}

export function admitFieldWith(
  stages: typeof PII_STAGES,
  field: string,
  value: string,
): PiiAdmissionResult {
  const request: PiiAdmissionRequest = { freeText: [{ field, value }] };
  return admit(request, stages);
}

/** The two runners the differential report diffs. */
export const runBaseline = (field: string, value: string): readonly PiiFinding[] =>
  admitFieldWith(CONSERVATIVE_STAGE_DEFAULTS, field, value).findings;

export const runFull = (field: string, value: string): readonly PiiFinding[] =>
  admitFieldWith(PII_STAGES, field, value).findings;
