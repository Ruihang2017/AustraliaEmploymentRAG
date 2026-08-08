/**
 * EVID-01 deliverable 9 — sanitisation on the ACCEPT path only.
 *
 * NO SHIPPED EVID-01 DETECTOR EMITS `ADVISORY`. The severity exists for the `EVID-02` stage ports, so
 * the advisory path is driven here by a STAGE DOUBLE that returns an advisory finding. The
 * alternative — inventing an advisory detector so the path would be "live" — would have added a
 * detector the PRD does not ask for, purely to make a test look natural.
 */
import { describe, expect, it } from 'vitest';

import type { PiiFinding } from '../../src/contract/finding.js';
import type { PiiStages } from '../../src/contract/pipeline.js';
import { CONSERVATIVE_STAGE_DEFAULTS, admit } from '../../src/contract/pipeline.js';
import { PII_PLACEHOLDERS } from '../../src/deterministic/placeholders.js';

const ZWSP = String.fromCodePoint(0x200b);

function stagesAdding(findings: readonly PiiFinding[]): PiiStages {
  return {
    ...CONSERVATIVE_STAGE_DEFAULTS,
    recogniseEntities: (_input, current) => [...current, ...findings],
  };
}

describe('the ACCEPT path', () => {
  it('returns a branded payload carrying every scanned field', () => {
    const result = admit(
      {
        freeText: [
          { field: 'question', value: 'What notice period applies?' },
          { field: 'context', value: 'The worker is a casual.' },
        ],
        structured: { employer: 'Example Widgets Pty Ltd' },
      },
      CONSERVATIVE_STAGE_DEFAULTS,
    );
    expect(result.decision).toBe('ACCEPT');
    if (result.decision !== 'ACCEPT') return;
    expect(result.sanitizedPayload.fields.map((field) => field.field)).toEqual([
      'question',
      'context',
      'structured.employer',
    ]);
    expect(result.sanitizedPayload.transformations).toEqual([]);
  });

  it('drops zero-width characters (a real formatting normalisation)', () => {
    const result = admit(
      { freeText: [{ field: 'question', value: `Is over${ZWSP}time paid?` }] },
      CONSERVATIVE_STAGE_DEFAULTS,
    );
    if (result.decision !== 'ACCEPT') throw new Error('expected ACCEPT');
    expect(result.sanitizedPayload.fields[0]?.value).toBe('Is overtime paid?');
  });

  it('does NOT fold the customer own characters (folding is a matching aid only)', () => {
    const emDash = String.fromCodePoint(0x2014);
    const result = admit(
      { freeText: [{ field: 'question', value: `Overtime ${emDash} is it paid?` }] },
      CONSERVATIVE_STAGE_DEFAULTS,
    );
    if (result.decision !== 'ACCEPT') throw new Error('expected ACCEPT');
    expect(result.sanitizedPayload.fields[0]?.value).toContain(emDash);
  });

  it('replaces an ADVISORY span with its placeholder and records the transformation', () => {
    const value = 'Contact SECRETTOKEN about the roster.';
    const start = value.indexOf('SECRETTOKEN');
    const advisory: PiiFinding = {
      field: 'question',
      start,
      end: start + 'SECRETTOKEN'.length,
      category: 'PRIVATE_CONTACT_EMAIL',
      severity: 'ADVISORY',
      suggestedPlaceholder: PII_PLACEHOLDERS.PRIVATE_CONTACT_EMAIL,
    };
    const result = admit({ freeText: [{ field: 'question', value }] }, stagesAdding([advisory]));
    expect(result.decision).toBe('ACCEPT');
    if (result.decision !== 'ACCEPT') return;
    expect(result.sanitizedPayload.fields[0]?.value).toBe(
      'Contact [EMAIL REMOVED] about the roster.',
    );
    expect(result.sanitizedPayload.transformations).toEqual([
      {
        field: 'question',
        start,
        end: start + 'SECRETTOKEN'.length,
        replacementLength: PII_PLACEHOLDERS.PRIVATE_CONTACT_EMAIL.length,
      },
    ]);
  });

  it('applies several advisory spans right to left, so earlier offsets stay valid', () => {
    const value = 'AAA and BBB and CCC.';
    const spans = [
      [0, 3, 'PRIVATE_CONTACT_EMAIL'],
      [8, 11, 'PRIVATE_CONTACT_PHONE'],
      [16, 19, 'PRIVATE_SOCIAL_IDENTIFIER'],
    ] as const;
    const advisories: PiiFinding[] = spans.map(([start, end, category]) => ({
      field: 'question',
      start,
      end,
      category,
      severity: 'ADVISORY',
      suggestedPlaceholder: PII_PLACEHOLDERS[category],
    }));
    const result = admit({ freeText: [{ field: 'question', value }] }, stagesAdding(advisories));
    if (result.decision !== 'ACCEPT') throw new Error('expected ACCEPT');
    expect(result.sanitizedPayload.fields[0]?.value).toBe(
      '[EMAIL REMOVED] and [PHONE REMOVED] and [SOCIAL HANDLE REMOVED].',
    );
    expect(result.sanitizedPayload.transformations.map((entry) => entry.start)).toEqual([0, 8, 16]);
  });

  it('is offset-stable: the transformations map back to the ORIGINAL NFC offsets', () => {
    const value = 'Contact SECRETTOKEN about the roster.';
    const start = value.indexOf('SECRETTOKEN');
    const advisory: PiiFinding = {
      field: 'question',
      start,
      end: start + 'SECRETTOKEN'.length,
      category: 'PRIVATE_CONTACT_EMAIL',
      severity: 'ADVISORY',
      suggestedPlaceholder: PII_PLACEHOLDERS.PRIVATE_CONTACT_EMAIL,
    };
    const result = admit({ freeText: [{ field: 'question', value }] }, stagesAdding([advisory]));
    if (result.decision !== 'ACCEPT') throw new Error('expected ACCEPT');
    const transformation = result.sanitizedPayload.transformations[0];
    if (!transformation) throw new Error('no transformation');
    expect(value.normalize('NFC').slice(transformation.start, transformation.end)).toBe(
      'SECRETTOKEN',
    );
  });
});

describe('a BLOCKING finding never produces a cleaned payload (PRD §10.1, §34.9)', () => {
  it('rejects instead of sanitising', () => {
    const result = admit(
      { freeText: [{ field: 'question', value: 'Their TFN is 123456782 on the form.' }] },
      CONSERVATIVE_STAGE_DEFAULTS,
    );
    expect(result.decision).toBe('REJECT');
    expect('sanitizedPayload' in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain('123456782');
  });

  it('rejects even when the blocking finding sits beside advisory ones', () => {
    const value = 'Their TFN is 123456782 and AAA.';
    const advisory: PiiFinding = {
      field: 'question',
      start: value.indexOf('AAA'),
      end: value.indexOf('AAA') + 3,
      category: 'PRIVATE_CONTACT_EMAIL',
      severity: 'ADVISORY',
      suggestedPlaceholder: PII_PLACEHOLDERS.PRIVATE_CONTACT_EMAIL,
    };
    const result = admit({ freeText: [{ field: 'question', value }] }, stagesAdding([advisory]));
    expect(result.decision).toBe('REJECT');
  });
});
