/**
 * EVID-01 deliverable 12 / acceptance item 4 — the committed measurement report.
 *
 * The report is RECOMPUTED here and asserted deep-equal to the committed
 * `test/deterministic/recall-report.json`, so it cannot be hand-written and cannot drift: the
 * `generated:check` idea, applied locally. Regenerate deliberately with
 *
 *     PII_UPDATE_RECALL_REPORT=1 pnpm --filter @taxrag/pii test
 *
 * (the environment variable is read HERE, in the test — `src/**` reads no environment variable at
 * all, which `purity.test.ts` enforces).
 *
 * If two runs disagree, the report builder is non-deterministic and that is the bug — do not loosen
 * this assertion.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { NON_PRD_CATEGORY, PII_CATEGORY_VALUES } from '../../src/contract/category.js';
import { PII_ADMISSION_LIMITS } from '../../src/deterministic/limits.js';
import { MINIMUM_RECALL, buildRecallReport } from '../../src/deterministic/report.js';
import type { RecallReport } from '../../src/deterministic/report.js';
import { RECALL_REPORT_PATH, loadCorpus, runField } from '../contract/fixture.js';

const corpus = loadCorpus();
const report = buildRecallReport(corpus, runField, PII_ADMISSION_LIMITS.version);

if (process.env.PII_UPDATE_RECALL_REPORT === '1') {
  writeFileSync(RECALL_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

const committed = JSON.parse(readFileSync(RECALL_REPORT_PATH, 'utf8')) as RecallReport;

describe('the committed recall report', () => {
  it('reproduces byte-identically from the corpus', () => {
    expect(report).toEqual(committed);
    expect(`${JSON.stringify(report, null, 2)}\n`).toBe(
      readFileSync(RECALL_REPORT_PATH, 'utf8').split('\r\n').join('\n'),
    );
  });

  it('is deterministic: two builds are deeply equal', () => {
    const second = buildRecallReport(corpus, runField, PII_ADMISSION_LIMITS.version);
    expect(JSON.stringify(second)).toBe(JSON.stringify(report));
  });

  it('records the limits version it was measured under', () => {
    expect(report.limitsVersion).toBe(PII_ADMISSION_LIMITS.version);
  });

  it('has an entry for every category, in vocabulary order', () => {
    expect(Object.keys(report.categories)).toEqual([...PII_CATEGORY_VALUES]);
  });
});

describe('the floors deliverable 12 sets', () => {
  it('holds 100% recall for the checksum-verifiable categories', () => {
    for (const category of ['TAX_FILE_NUMBER', 'MEDICARE_NUMBER', 'BANK_OR_CARD_DETAIL']) {
      expect(MINIMUM_RECALL[category], `${category} has no floor`).toBe(1);
      expect(report.categories[category]?.recall, `${category} recall`).toBe(1);
    }
  });

  it('contains no floor below 1, so a bar cannot be lowered by editing a number', () => {
    for (const [category, floor] of Object.entries(MINIMUM_RECALL)) {
      expect(floor, `${category} floor was lowered`).toBe(1);
    }
  });

  it('meets every floor it declares', () => {
    for (const [category, floor] of Object.entries(MINIMUM_RECALL)) {
      expect(report.categories[category]?.recall, category).toBeGreaterThanOrEqual(floor);
    }
  });
});

describe('every §37.1 blocked row has a passing positive case, or an owned deferral', () => {
  it.each(
    PII_CATEGORY_VALUES.filter((category) => category !== NON_PRD_CATEGORY).map(
      (category) => [category] as const,
    ),
  )('%s', (category) => {
    const entry = report.categories[category];
    expect(entry, `${category} is missing from the report`).toBeDefined();
    if (!entry) return;
    if (entry.positives === 0) {
      // The only permitted form: authored cases, deferred to a named owner, reported at 0%.
      expect(entry.deferred, `${category} has neither positives nor deferred cases`).toBeGreaterThan(
        0,
      );
      expect(entry.detectedBy).toBe('EVID-02');
      expect(report.deferred.some((item) => item.category === category)).toBe(true);
      return;
    }
    expect(entry.detected, `${category} detected nothing`).toBeGreaterThan(0);
  });

  it('reports a deferred row at 0%, never at the 1 that "0 of 0" would produce', () => {
    expect(report.categories.IDENTIFYING_COMBINATION?.recall).toBe(0);
    expect(report.categories.IDENTIFYING_COMBINATION?.precision).toBe(0);
    expect(report.categories.IDENTIFYING_COMBINATION?.detectedBy).toBe('EVID-02');
  });

  it('defers exactly IDENTIFYING_COMBINATION, with an owner and a reason on every case', () => {
    expect(new Set(report.deferred.map((item) => item.category))).toEqual(
      new Set(['IDENTIFYING_COMBINATION']),
    );
    expect(report.deferred.length).toBeGreaterThanOrEqual(20);
    for (const item of report.deferred) {
      expect(item.owner).toBe('EVID-02');
      expect(item.reason.length).toBeGreaterThan(20);
    }
  });
});

describe('precision is recorded, and false positives are visible', () => {
  it('records a precision for every category', () => {
    for (const category of PII_CATEGORY_VALUES) {
      const entry = report.categories[category];
      expect(entry?.precision, category).toBeGreaterThanOrEqual(0);
      expect(entry?.precision, category).toBeLessThanOrEqual(1);
    }
  });

  it('replays the §37.1 allowed rows against every category', () => {
    for (const category of PII_CATEGORY_VALUES) {
      if (category === NON_PRD_CATEGORY) continue;
      expect(report.categories[category]?.negatives, category).toBeGreaterThanOrEqual(
        corpus.sharedNegatives.length,
      );
    }
  });

  it('has no false positive on the PRD §37.1 allowed rows', () => {
    for (const category of PII_CATEGORY_VALUES) {
      expect(report.categories[category]?.falsePositives, category).toBe(0);
    }
  });
});
