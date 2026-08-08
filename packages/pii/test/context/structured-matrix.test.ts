/**
 * EVID-02 acceptance item 2 — `UAT-PII-02`'s mechanical half.
 *
 * *"Enter employer name, valid ABN and public case party → allowed only through correct
 * structured/public context"* (PRD §41.2). Every case is submitted twice: once in its structured
 * channel, once as free text, and BOTH recorded outcomes are asserted.
 *
 * READ THE CORPUS NOTES BEFORE READING THE NUMBERS. Two rows record `ACCEPT`/`ACCEPT` honestly:
 * nothing in the shipped detector set fires on eleven bare digits or on one capitalised word, so at
 * the DECISION level those rows cannot distinguish the channels. The rules that make the difference
 * — the ABN checksum and the citation requirement — are asserted where they are not vacuous, in
 * `public-entity.test.ts`, against the predicate itself. Recording that rather than inventing a
 * differential is the point: a corpus that quietly asserts nothing is worse than one that says so.
 */
import { describe, expect, it } from 'vitest';

import type { PiiAdmissionRequest, StructuredChannels } from '../../src/contract/request.js';
import { admit } from '../../src/contract/pipeline.js';
import { PII_STAGES } from '../../src/context/stages.js';
import { loadPublicEntityMatrix } from '../entity/fixture.js';

const matrix = loadPublicEntityMatrix();

function structuredFor(channel: string, value: string): StructuredChannels {
  if (channel === 'employer') return { employer: value };
  if (channel === 'abn') return { abn: value };
  return { publicCaseParty: value };
}

describe('the public-entity matrix', () => {
  it('covers all three structured channels and is entirely synthetic', () => {
    expect(new Set(matrix.map((entry) => entry.channel))).toEqual(
      new Set(['employer', 'abn', 'publicCaseParty']),
    );
    for (const entry of matrix) {
      expect(entry.synthetic, entry.id).toBe(true);
      expect(entry.prdAllowedRow.length, entry.id).toBeGreaterThan(10);
      expect(entry.note.length, entry.id).toBeGreaterThan(20);
    }
  });

  it('contains at least one case that is REJECTED even through the structured channel', () => {
    expect(matrix.some((entry) => entry.structuredDecision === 'REJECT')).toBe(true);
  });
});

describe('through the structured channel', () => {
  it.each(matrix.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    const request: PiiAdmissionRequest = {
      freeText: [],
      structured: structuredFor(entry.channel, entry.value),
    };
    expect(admit(request, PII_STAGES).decision, entry.note).toBe(entry.structuredDecision);
  });
});

describe('the identical string in free text', () => {
  it.each(matrix.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    const request: PiiAdmissionRequest = { freeText: [{ field: 'question', value: entry.value }] };
    expect(admit(request, PII_STAGES).decision, entry.note).toBe(entry.freeTextDecision);
  });
});

describe('the channel is never a general clearing house', () => {
  it('an employer channel does not clear a TFN in a free-text field', () => {
    const result = admit(
      {
        freeText: [{ field: 'question', value: 'Their tax file number is 123 456 782.' }],
        structured: { employer: 'Their tax file number is 123 456 782.' },
      },
      PII_STAGES,
    );
    expect(result.decision).toBe('REJECT');
    expect(result.findings.some((finding) => finding.field === 'question')).toBe(true);
  });

  it('a valid ABN in the abn channel does not clear an identical string in free text', () => {
    const result = admit(
      {
        freeText: [{ field: 'question', value: 'The employee tax file number is 123 456 782.' }],
        structured: { abn: '51824753556' },
      },
      PII_STAGES,
    );
    expect(result.decision).toBe('REJECT');
  });
});
