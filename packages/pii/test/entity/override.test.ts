/**
 * EVID-02 acceptance item 6 — NO STAGE MAY OVERRIDE AN EARLIER BLOCK.
 *
 * PRD §10.1 says the three techniques *"MUST combine"*, not "may override", and PRD §37.2 orders
 * them so the deterministic stage runs first. This suite is the mechanical form of that sentence:
 *
 * - a deterministic TFN finding survives the whole of `PII_STAGES`;
 * - it survives when `recogniseEntities` is replaced by a stub that reports "high confidence, not
 *   PII" — the exact shape a model integration would take;
 * - as a PROPERTY over generated finding sets: `applyPublicEntityRules` removes a finding only when
 *   `isExplainedByStructuredChannel` is true for it, and neither `recogniseEntities` nor
 *   `applyCombinationRules` ever shrinks the list.
 */
import { describe, expect, it } from 'vitest';

import type { PiiCategory } from '../../src/contract/category.js';
import { PII_CATEGORY_VALUES } from '../../src/contract/category.js';
import type { PiiFinding, PiiSeverity } from '../../src/contract/finding.js';
import type { PiiAdmissionRequest } from '../../src/contract/request.js';
import type { StageInput } from '../../src/contract/pipeline.js';
import { admit } from '../../src/contract/pipeline.js';
import { buildScanViews } from '../../src/deterministic/detect.js';
import { PII_PLACEHOLDERS } from '../../src/deterministic/placeholders.js';
import { PII_STAGES, createPiiStages } from '../../src/context/stages.js';
import { isExplainedByStructuredChannel } from '../../src/context/publicEntity.js';
import { mulberry32 } from '../contract/rng.js';

const TFN_REQUEST: PiiAdmissionRequest = {
  freeText: [{ field: 'question', value: 'Their tax file number is 123 456 782 on the form.' }],
};

describe('a deterministic BLOCKING finding survives every later stage', () => {
  it('under the real stages', () => {
    const result = admit(TFN_REQUEST, PII_STAGES);
    expect(result.decision).toBe('REJECT');
    expect(result.findings.map((finding) => finding.category)).toContain('TAX_FILE_NUMBER');
  });

  it('when the recogniser claims high confidence that nothing is PII', () => {
    const stages = createPiiStages({
      recogniser: {
        // The shape a model integration takes, and the shape that must not be able to help.
        recognise: () => [],
        readiness: () => 'READY',
      },
    });
    const result = admit(TFN_REQUEST, stages);
    expect(result.decision).toBe('REJECT');
    expect(result.findings.map((finding) => finding.category)).toContain('TAX_FILE_NUMBER');
  });

  it('when the structured channels are populated with unrelated public entities', () => {
    const result = admit(
      {
        ...TFN_REQUEST,
        structured: {
          employer: 'Example Widgets Pty Ltd',
          abn: '51824753556',
          publicCaseParty: 'Smith v Acme Pty Ltd [2024] FWC 123',
        },
      },
      PII_STAGES,
    );
    expect(result.decision).toBe('REJECT');
    expect(result.findings.map((finding) => finding.category)).toContain('TAX_FILE_NUMBER');
  });
});

describe('the property: only stage 5 removes, and only for its own reason', () => {
  const random = mulberry32(0xe1d02);
  const severities: readonly PiiSeverity[] = ['BLOCKING', 'ADVISORY'];
  const fields = ['question', 'context', 'structured.employer', 'structured.abn', 'structured.publicCaseParty'];

  function generateFindings(count: number): PiiFinding[] {
    const findings: PiiFinding[] = [];
    for (let index = 0; index < count; index += 1) {
      const category = PII_CATEGORY_VALUES[
        Math.floor(random() * PII_CATEGORY_VALUES.length)
      ] as PiiCategory;
      const field = fields[Math.floor(random() * fields.length)] ?? 'question';
      const start = Math.floor(random() * 20);
      findings.push({
        field,
        start,
        end: start + 1 + Math.floor(random() * 20),
        category,
        severity: severities[Math.floor(random() * severities.length)] ?? 'BLOCKING',
        suggestedPlaceholder: PII_PLACEHOLDERS[category],
      });
    }
    return findings;
  }

  const request: PiiAdmissionRequest = {
    freeText: [{ field: 'question', value: 'The worker asked about the Sunday penalty rate.' }],
    structured: {
      employer: 'Example Widgets Pty Ltd',
      abn: '51824753556',
      publicCaseParty: 'Smith v Acme Pty Ltd [2024] FWC 123',
    },
  };
  const input: StageInput = { request, views: buildScanViews(request) };

  it('applyPublicEntityRules removes exactly the explained findings, over 200 generated sets', () => {
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const findings = generateFindings(1 + Math.floor(random() * 6));
      const after = PII_STAGES.applyPublicEntityRules(input, findings);
      const removed = findings.filter((finding) => !after.includes(finding));
      for (const finding of removed) {
        expect(isExplainedByStructuredChannel(finding, request.structured)).toBe(true);
      }
      for (const finding of after) {
        expect(isExplainedByStructuredChannel(finding, request.structured)).toBe(false);
      }
    }
  });

  it('recogniseEntities and applyCombinationRules never shrink the list', () => {
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const findings = generateFindings(1 + Math.floor(random() * 6));
      const recognised = PII_STAGES.recogniseEntities(input, findings);
      expect(recognised.length).toBeGreaterThanOrEqual(findings.length);
      for (const finding of findings) expect(recognised).toContain(finding);

      const combined = PII_STAGES.applyCombinationRules(input, findings);
      expect(combined.length).toBeGreaterThanOrEqual(findings.length);
      for (const finding of findings) expect(combined).toContain(finding);
    }
  });
});

describe('the reserved-channel smuggling path stays closed', () => {
  it('a freeText field named structured.abn is rejected before any scanning', () => {
    const result = admit(
      { freeText: [{ field: 'structured.abn', value: '51824753556' }] },
      PII_STAGES,
    );
    expect(result.decision).toBe('REJECT');
    expect(result.findings.map((finding) => finding.category)).toEqual(['REQUEST_LIMIT_EXCEEDED']);
  });
});
