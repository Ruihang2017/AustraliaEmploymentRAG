/**
 * EVID-01 acceptance item 3 — "blocking implies reject", as a property over generated finding sets.
 *
 * PRD §10.1: *"Customers MUST NOT bypass a positive employee-PII finding."* The type makes the
 * bypass unspellable; this test makes the DECISION unavoidable: over 10,000 generated finding sets,
 * a set containing any `BLOCKING` finding always yields `REJECT` with no payload, and a set with
 * none always yields `ACCEPT`.
 *
 * The stage doubles inject the generated findings, which is also how the `ADVISORY` sanitisation path
 * is exercised — no shipped EVID-01 detector emits `ADVISORY`, and inventing one to make the path
 * live would have been the wrong fix.
 */
import { describe, expect, it } from 'vitest';

import { PII_CATEGORY_VALUES } from '../../src/contract/category.js';
import type { PiiFinding, PiiSeverity } from '../../src/contract/finding.js';
import type { PiiAdmissionRequest } from '../../src/contract/request.js';
import type { PiiStages } from '../../src/contract/pipeline.js';
import { admit } from '../../src/contract/pipeline.js';
import { PII_PLACEHOLDERS } from '../../src/deterministic/placeholders.js';
import { Rng, forEachDraw } from './rng.js';

const TEXT = 'The worker asked about the Sunday penalty rate and the roster pattern for casuals.';
const CASES = 10_000;

const REQUEST: PiiAdmissionRequest = { freeText: [{ field: 'question', value: TEXT }] };

function drawFindings(rng: Rng): readonly PiiFinding[] {
  const count = rng.int(5);
  const findings: PiiFinding[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = rng.int(TEXT.length - 2);
    const end = start + 1 + rng.int(Math.min(20, TEXT.length - start - 1));
    const category = rng.pick(PII_CATEGORY_VALUES);
    const severity: PiiSeverity = rng.bool() ? 'BLOCKING' : 'ADVISORY';
    findings.push({
      field: 'question',
      start,
      end,
      category,
      severity,
      suggestedPlaceholder: PII_PLACEHOLDERS[category],
    });
  }
  return findings;
}

/** Non-overlapping advisory findings only, so the sanitiser's right-to-left rewrite is well defined. */
function drawAdvisoryOnly(rng: Rng): readonly PiiFinding[] {
  const findings: PiiFinding[] = [];
  let cursor = 0;
  const count = rng.int(4);
  for (let index = 0; index < count; index += 1) {
    const start = cursor + rng.int(6);
    const end = start + 1 + rng.int(6);
    if (end >= TEXT.length) break;
    const category = rng.pick(PII_CATEGORY_VALUES);
    findings.push({
      field: 'question',
      start,
      end,
      category,
      severity: 'ADVISORY',
      suggestedPlaceholder: PII_PLACEHOLDERS[category],
    });
    cursor = end + 1;
  }
  return findings;
}

function stagesReturning(findings: readonly PiiFinding[]): PiiStages {
  return {
    recogniseEntities: () => findings,
    applyPublicEntityRules: (_input, current) => current,
    applyCombinationRules: (_input, current) => current,
  };
}

describe('a BLOCKING finding always forces REJECT (PRD §10.1)', () => {
  it(`holds over ${String(CASES)} generated finding sets`, () => {
    forEachDraw(CASES, (rng, index, seed) => {
      const findings = drawFindings(rng);
      const result = admit(REQUEST, stagesReturning(findings));
      const blocking = findings.some((finding) => finding.severity === 'BLOCKING');
      const label = `case ${String(index)} from seed 0x${seed.toString(16)}`;
      if (blocking) {
        expect(result.decision, label).toBe('REJECT');
        expect('sanitizedPayload' in result, `${label}: a REJECT carried a payload`).toBe(false);
      } else {
        expect(result.decision, label).toBe('ACCEPT');
      }
    });
  });

  it('accepts and sanitises when every finding is advisory', () => {
    forEachDraw(1_000, (rng, index, seed) => {
      const findings = drawAdvisoryOnly(rng);
      const result = admit(REQUEST, stagesReturning(findings));
      const label = `case ${String(index)} from seed 0x${seed.toString(16)}`;
      expect(result.decision, label).toBe('ACCEPT');
      if (result.decision !== 'ACCEPT') return;
      expect(result.sanitizedPayload.transformations, label).toHaveLength(findings.length);
      expect(result.sanitizedPayload.fields, label).toHaveLength(1);
    });
  });

  it('a single blocking finding among advisories still rejects', () => {
    const findings: readonly PiiFinding[] = [
      {
        field: 'question',
        start: 0,
        end: 3,
        category: 'PRIVATE_CONTACT_EMAIL',
        severity: 'ADVISORY',
        suggestedPlaceholder: PII_PLACEHOLDERS.PRIVATE_CONTACT_EMAIL,
      },
      {
        field: 'question',
        start: 4,
        end: 10,
        category: 'TAX_FILE_NUMBER',
        severity: 'BLOCKING',
        suggestedPlaceholder: PII_PLACEHOLDERS.TAX_FILE_NUMBER,
      },
    ];
    const result = admit(REQUEST, stagesReturning(findings));
    expect(result.decision).toBe('REJECT');
    expect('sanitizedPayload' in result).toBe(false);
  });
});
