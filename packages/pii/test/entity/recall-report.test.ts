/**
 * EVID-02 deliverable 11 — the committed measurement report for stages 4-6.
 *
 * The report is RECOMPUTED here and asserted deep-equal to `test/entity/recall-report.json`, so it
 * cannot be hand-written and cannot drift. Regenerate deliberately with
 *
 *     PII_UPDATE_ENTITY_REPORT=1 pnpm --filter @taxrag/pii test
 *
 * (the environment variable is read HERE, in the test — `src/**` reads none at all).
 *
 * `detectedByStage` is what makes this report worth committing: it is derived by running every case
 * under `CONSERVATIVE_STAGE_DEFAULTS` and under `PII_STAGES` and diffing, so "which stage found
 * this" is measured rather than asserted. `IDENTIFYING_COMBINATION` moving off 0% — `EVID-01`'s
 * honest gap — is the headline number, and it is attributed to the `combination` stage, not claimed
 * by the deterministic one.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PII_ADMISSION_LIMITS } from '../../src/deterministic/limits.js';
import { COMBINATION_RULE_V1 } from '../../src/context/combination.js';
import type { EntityRecallReport } from '../../src/entity/report.js';
import { buildEntityRecallReport } from '../../src/entity/report.js';
import {
  ENTITY_RECALL_REPORT_PATH,
  loadCombinedCorpus,
  runBaseline,
  runFull,
} from './fixture.js';
import { RUNTIME_SKIP_REASON } from './recall-report-input.js';

const corpus = loadCombinedCorpus();
const report = buildEntityRecallReport(
  corpus,
  { baseline: runBaseline, full: runFull },
  PII_ADMISSION_LIMITS.version,
  COMBINATION_RULE_V1.version,
  RUNTIME_SKIP_REASON,
);

if (process.env.PII_UPDATE_ENTITY_REPORT === '1') {
  writeFileSync(ENTITY_RECALL_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

const committed = JSON.parse(readFileSync(ENTITY_RECALL_REPORT_PATH, 'utf8')) as EntityRecallReport;

describe('the committed entity recall report', () => {
  it('reproduces byte-identically from the corpora', () => {
    expect(report).toEqual(committed);
    expect(`${JSON.stringify(report, null, 2)}\n`).toBe(
      readFileSync(ENTITY_RECALL_REPORT_PATH, 'utf8').split('\r\n').join('\n'),
    );
  });

  it('is deterministic: two builds are byte-equal', () => {
    const second = buildEntityRecallReport(
      corpus,
      { baseline: runBaseline, full: runFull },
      PII_ADMISSION_LIMITS.version,
      COMBINATION_RULE_V1.version,
      RUNTIME_SKIP_REASON,
    );
    expect(JSON.stringify(second)).toBe(JSON.stringify(report));
  });

  it('records the versions it was measured under', () => {
    expect(report.limitsVersion).toBe(PII_ADMISSION_LIMITS.version);
    expect(report.combinationRuleVersion).toBe(COMBINATION_RULE_V1.version);
  });

  it('names the runtime-ON row as skipped, never silently omits it', () => {
    expect(report.runtimeOn).toEqual({ skipped: RUNTIME_SKIP_REASON });
  });
});

describe('what the numbers say', () => {
  const name = report.runtimeOff.categories.EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME;
  const combination = report.runtimeOff.categories.IDENTIFYING_COMBINATION;

  it('measures both categories this ticket owns', () => {
    expect(name?.positives).toBeGreaterThanOrEqual(40);
    expect(combination?.positives).toBeGreaterThanOrEqual(20);
  });

  it('records recall and precision for the person-name category', () => {
    expect(name?.recall).toBeGreaterThan(0);
    expect(name?.falsePositives).toBe(0);
    expect(name?.precision).toBe(1);
  });

  it('moves IDENTIFYING_COMBINATION off EVID-01’s 0%', () => {
    expect(combination?.recall).toBeGreaterThan(0);
    expect(combination?.falsePositives).toBe(0);
  });

  it('attributes each detection to the stage that actually made it', () => {
    expect(combination?.detectedByStage.combination).toBe(combination?.detected);
    expect(combination?.detectedByStage.deterministic).toBe(0);
    expect(name?.detectedByStage.entity).toBeGreaterThan(0);
  });

  it('replays PRD §37.1’s allowed rows against both categories', () => {
    expect(name?.negatives).toBeGreaterThanOrEqual(60);
    expect(combination?.negatives).toBeGreaterThanOrEqual(40);
  });
});
