/**
 * EVID-01 — the shared test fixture: paths, the corpus loader and the standard runner.
 *
 * Not a `*.test.*` file, so Vitest does not collect it. Every suite reads the corpus through this one
 * accessor instead of re-parsing it with an ad-hoc shape, and the paths are resolved from
 * `import.meta.url`, never from `process.cwd()`.
 *
 * The corpus is read with `readFileSync` + `JSON.parse` rather than `import x from './x.json'`
 * because `packages/pii/tsconfig.json` may carry only `extends` and `include` (the FND-01 skeleton
 * rule, asserted by `tools/tests/skeleton.test.mjs`), so `resolveJsonModule` is not available.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PiiCategory } from '../../src/contract/category.js';
import type { PiiFinding } from '../../src/contract/finding.js';
import type { PiiAdmissionRequest } from '../../src/contract/request.js';
import type { PiiAdmissionResult } from '../../src/contract/result.js';
import { CONSERVATIVE_STAGE_DEFAULTS, admit } from '../../src/contract/pipeline.js';
import type { Corpus, CorpusCategoryFile, CorpusNegative } from '../../src/deterministic/report.js';

export const TEST_CONTRACT_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/pii */
export const PACKAGE_ROOT = join(TEST_CONTRACT_DIR, '..', '..');
/** the repository root */
export const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
export const CORPORA_DIR = join(PACKAGE_ROOT, 'test', 'deterministic', 'corpora');
export const RECALL_REPORT_PATH = join(PACKAGE_ROOT, 'test', 'deterministic', 'recall-report.json');

export interface CanaryCase {
  readonly id: string;
  readonly category: PiiCategory;
  readonly token: string;
  readonly field: string;
  readonly value: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Corpus files, sorted by name so the load order is identical on every platform. */
export function loadCorpus(): Corpus {
  const names = readdirSync(CORPORA_DIR)
    .filter((name) => name.endsWith('.json'))
    .filter((name) => name !== 'negatives-shared.json' && name !== 'canaries.json')
    .sort();
  const categories = names.map((name) => readJson<CorpusCategoryFile>(join(CORPORA_DIR, name)));
  const shared = readJson<{ cases: readonly CorpusNegative[] }>(
    join(CORPORA_DIR, 'negatives-shared.json'),
  );
  return { categories, sharedNegatives: shared.cases };
}

export function loadCanaries(): readonly CanaryCase[] {
  return readJson<{ canaries: readonly CanaryCase[] }>(join(CORPORA_DIR, 'canaries.json')).canaries;
}

/** One free-text field, the conservative defaults: the standard replay request. */
export function admitField(field: string, value: string): PiiAdmissionResult {
  const request: PiiAdmissionRequest = { freeText: [{ field, value }] };
  return admit(request, CONSERVATIVE_STAGE_DEFAULTS);
}

/** The runner the recall report is built with. */
export function runField(field: string, value: string): readonly PiiFinding[] {
  return admitField(field, value).findings;
}
