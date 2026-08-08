/**
 * EVID-01 acceptance — the synthetic corpus replay (the two `[fixture]` items).
 *
 * WHAT THIS SUITE IS FOR: it asserts, case by case, that every PRD §37.1 "Blocked" row has passing
 * positive cases and that every PRD §37.1 "Allowed" row is ADMITTED. The recall/precision NUMBERS
 * live in `recall-report.test.ts`; this file is where a failure names the case that broke.
 *
 * A CASE IS NEVER DELETED TO MAKE A NUMBER GO UP. A positive case the detectors miss is a red test
 * and, per the ticket's Feedback obligation, either a widened pattern (ordinary work) or a Q-EVID-2
 * writeback (a Founder risk decision) — never a quiet corpus edit. The one honest exclusion is the
 * `deferred` list, which carries an owner and a reason and is printed by the report on every run.
 */
import { describe, expect, it } from 'vitest';

import { NON_PRD_CATEGORY, PII_CATEGORY_VALUES } from '../../src/contract/category.js';
import { admitField, loadCorpus, runField } from '../contract/fixture.js';

const corpus = loadCorpus();

describe('corpus shape', () => {
  it('has one file per category, in the vocabulary', () => {
    expect(corpus.categories.map((file) => file.category).sort()).toEqual(
      [...PII_CATEGORY_VALUES].sort(),
    );
  });

  it.each(corpus.categories.map((file) => [file.category, file] as const))(
    '%s carries at least 20 positive (or deferred) cases and at least 20 negatives',
    (_category, file) => {
      expect(file.positives.length + file.deferred.length).toBeGreaterThanOrEqual(20);
      expect(file.negatives.length).toBeGreaterThanOrEqual(5);
      const negatives =
        file.category === NON_PRD_CATEGORY
          ? file.negatives.length
          : file.negatives.length + corpus.sharedNegatives.length;
      expect(negatives).toBeGreaterThanOrEqual(20);
    },
  );

  it('declares every case synthetic (PRD §45.1 item 6, sub-PRD D22)', () => {
    for (const file of corpus.categories) {
      for (const kase of [...file.positives, ...file.negatives, ...file.deferred]) {
        expect(kase.synthetic, `${kase.id} is not marked synthetic`).toBe(true);
      }
    }
    for (const kase of corpus.sharedNegatives) expect(kase.synthetic).toBe(true);
  });

  it('quotes the PRD §37.1 row each category comes from', () => {
    for (const file of corpus.categories) expect(file.prdRow.length).toBeGreaterThan(10);
  });

  it('gives every deferred case an owner and a reason', () => {
    for (const file of corpus.categories) {
      for (const kase of file.deferred) {
        expect(kase.owner).toBe('EVID-02');
        expect(kase.reason).toContain('EVID-02');
      }
    }
  });
});

describe('positive cases (PRD §37.1 blocked rows)', () => {
  for (const file of corpus.categories) {
    for (const kase of file.positives) {
      it(`${kase.id}: ${file.category} is detected at the expected span`, () => {
        const findings = runField(kase.field, kase.value);
        for (const span of kase.expected) {
          expect(
            findings.some(
              (finding) =>
                finding.category === file.category &&
                finding.start === span.start &&
                finding.end === span.end,
            ),
            `${kase.id} (${kase.note}) produced ${JSON.stringify(
              findings.map((finding) => [finding.category, finding.start, finding.end]),
            )}`,
          ).toBe(true);
        }
      });
    }
  }

  it('rejects every positive case (a blocking finding forces REJECT)', () => {
    for (const file of corpus.categories) {
      for (const kase of file.positives) {
        expect(admitField(kase.field, kase.value).decision, kase.id).toBe('REJECT');
      }
    }
  });
});

describe('PRD §37.1 allowed rows are admitted', () => {
  for (const kase of corpus.sharedNegatives) {
    it(`${kase.id} (${kase.prdAllowedRow}) is ACCEPTed`, () => {
      const result = admitField(kase.field, kase.value);
      expect(
        result.decision,
        `${kase.id} produced ${JSON.stringify(
          result.findings.map((finding) => [finding.category, finding.start, finding.end]),
        )}`,
      ).toBe('ACCEPT');
    });
  }

  it("covers every allowed row named in the ticket's acceptance item", () => {
    const rows = new Set(corpus.sharedNegatives.map((kase) => kase.prdAllowedRow));
    for (const row of [
      'Public employer name and ABN',
      'State/territory and non-precise work location',
      'Anonymous role, duties, qualifications and employment type',
      'Public case party/citation',
      'Age band where legally relevant',
      '"Employee A", "the worker", synthetic placeholders',
      'Approximate wage/rate facts without identity',
    ]) {
      expect(rows, `no shared negative for the §37.1 allowed row: ${row}`).toContain(row);
    }
  });
});

describe('per-category negatives', () => {
  for (const file of corpus.categories) {
    for (const kase of file.negatives) {
      it(`${kase.id} does not produce a ${file.category} finding`, () => {
        const findings = runField(kase.field, kase.value);
        expect(
          findings.filter((finding) => finding.category === file.category),
          `${kase.id} (${kase.note})`,
        ).toEqual([]);
      });
    }
  }
});
