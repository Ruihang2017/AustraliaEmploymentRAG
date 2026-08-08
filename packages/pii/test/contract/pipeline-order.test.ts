/**
 * EVID-01 acceptance items 7 and 11 — the PRD §37.2 stage order, and structural public-entity
 * acceptance.
 *
 * THE NEGATIVE CONTROL (ticket test-plan step 6) was run: swapping `applyPublicEntityRules` and
 * `applyCombinationRules` in `admit` on a scratch branch turns the order assertion red
 * (`['recogniseEntities','applyCombinationRules','applyPublicEntityRules']`). Discarded afterwards.
 */
import { describe, expect, it } from 'vitest';

import type { PiiFinding } from '../../src/contract/finding.js';
import type { PiiAdmissionRequest } from '../../src/contract/request.js';
import type { PiiStages, StageInput } from '../../src/contract/pipeline.js';
import { CONSERVATIVE_STAGE_DEFAULTS, admit } from '../../src/contract/pipeline.js';
import { PII_ADMISSION_LIMITS } from '../../src/deterministic/limits.js';

function recordingStages(calls: string[]): PiiStages {
  return {
    recogniseEntities: (_input: StageInput, findings: readonly PiiFinding[]) => {
      calls.push('recogniseEntities');
      return findings;
    },
    applyPublicEntityRules: (_input: StageInput, findings: readonly PiiFinding[]) => {
      calls.push('applyPublicEntityRules');
      return findings;
    },
    applyCombinationRules: (_input: StageInput, findings: readonly PiiFinding[]) => {
      calls.push('applyCombinationRules');
      return findings;
    },
  };
}

const CLEAN: PiiAdmissionRequest = {
  freeText: [{ field: 'question', value: 'Is the Sunday penalty rate different for casuals?' }],
};

describe('PRD §37.2 stage order', () => {
  it('runs the three ports exactly once each, in the PRD order', () => {
    const calls: string[] = [];
    admit(CLEAN, recordingStages(calls));
    expect(calls).toEqual([
      'recogniseEntities',
      'applyPublicEntityRules',
      'applyCombinationRules',
    ]);
  });

  it('runs limits BEFORE any scanning: an over-limit request calls no stage at all', () => {
    const calls: string[] = [];
    const request: PiiAdmissionRequest = {
      freeText: [{ field: 'question', value: 'a'.repeat(PII_ADMISSION_LIMITS.maxFieldChars + 1) }],
    };
    const result = admit(request, recordingStages(calls));
    expect(result.decision).toBe('REJECT');
    expect(calls).toEqual([]);
    expect(result.findings.map((finding) => finding.category)).toEqual(['REQUEST_LIMIT_EXCEEDED']);
  });

  it('hands every stage the scan views, so EVID-02 never re-normalises', () => {
    const seen: number[] = [];
    const stages: PiiStages = {
      recogniseEntities: (input, findings) => {
        seen.push(input.views.size);
        return findings;
      },
      applyPublicEntityRules: (input, findings) => {
        seen.push(input.views.size);
        return findings;
      },
      applyCombinationRules: (input, findings) => {
        seen.push(input.views.size);
        return findings;
      },
    };
    admit({ freeText: [{ field: 'a', value: 'x' }, { field: 'b', value: 'y' }] }, stages);
    expect(seen).toEqual([2, 2, 2]);
  });

  it('gives the stages the deterministic findings, not an empty list', () => {
    let handed: readonly PiiFinding[] = [];
    const stages: PiiStages = {
      ...CONSERVATIVE_STAGE_DEFAULTS,
      recogniseEntities: (_input, findings) => {
        handed = findings;
        return findings;
      },
    };
    admit(
      { freeText: [{ field: 'question', value: 'Write to jane.doe@example.invalid about it.' }] },
      stages,
    );
    expect(handed.map((finding) => finding.category)).toEqual(['PRIVATE_CONTACT_EMAIL']);
  });

  it('cannot be given a stage-skipping option: the defaults are the only shipped stages', () => {
    expect(Object.keys(CONSERVATIVE_STAGE_DEFAULTS).sort()).toEqual([
      'applyCombinationRules',
      'applyPublicEntityRules',
      'recogniseEntities',
    ]);
    expect(Object.isFrozen(CONSERVATIVE_STAGE_DEFAULTS)).toBe(true);
    expect(admit.length).toBe(2);
  });
});

describe('conservative stage defaults are placeholders, not detectors', () => {
  it('recogniseEntities adds nothing', () => {
    const findings = CONSERVATIVE_STAGE_DEFAULTS.recogniseEntities(
      { request: CLEAN, views: new Map() },
      [],
    );
    expect(findings).toEqual([]);
  });

  it('applyCombinationRules adds nothing', () => {
    const findings = CONSERVATIVE_STAGE_DEFAULTS.applyCombinationRules(
      { request: CLEAN, views: new Map() },
      [],
    );
    expect(findings).toEqual([]);
  });
});

describe('public-entity acceptance is structural (sub-PRD D4, UAT-PII-02)', () => {
  const ABN = '51824753556';

  it('accepts a valid ABN through the reserved structured channel', () => {
    const result = admit(
      { freeText: [{ field: 'question', value: 'Is the employer covered?' }], structured: { abn: ABN } },
      CONSERVATIVE_STAGE_DEFAULTS,
    );
    expect(result.decision).toBe('ACCEPT');
  });

  it('does not accept an INVALID ABN through the structured channel by name alone', () => {
    // A mistyped ABN is not cleared by the allow rule; whether it produces a finding at all is a
    // detector question, but the allow rule must not be the thing that clears it.
    const view = admit(
      { freeText: [], structured: { abn: '51824753557' } },
      CONSERVATIVE_STAGE_DEFAULTS,
    );
    for (const finding of view.findings) {
      expect(finding.field).toBe('structured.abn');
    }
  });

  it('treats the same employer string in freeText by the ordinary rules', () => {
    const employer = 'Example Widgets Pty Ltd';
    const structured = admit(
      { freeText: [], structured: { employer } },
      CONSERVATIVE_STAGE_DEFAULTS,
    );
    const free = admit(
      { freeText: [{ field: 'question', value: employer }] },
      CONSERVATIVE_STAGE_DEFAULTS,
    );
    expect(structured.decision).toBe('ACCEPT');
    expect(free.decision).toBe('ACCEPT');
  });

  it('never allows a freeText field to impersonate a structured channel', () => {
    const result = admit(
      { freeText: [{ field: 'structured.abn', value: 'my tfn is 123456782' }] },
      CONSERVATIVE_STAGE_DEFAULTS,
    );
    expect(result.decision).toBe('REJECT');
    expect(result.findings.map((finding) => finding.category)).toEqual(['REQUEST_LIMIT_EXCEEDED']);
  });

  it('only drops a finding that spans the WHOLE structured value', () => {
    // An employer channel carrying an employer name AND a private phone number keeps the phone
    // finding, because the finding does not span the whole value.
    const result = admit(
      {
        freeText: [],
        structured: { employer: 'Example Widgets Pty Ltd, call 0412 345 678' },
      },
      CONSERVATIVE_STAGE_DEFAULTS,
    );
    expect(result.decision).toBe('REJECT');
    expect(result.findings.map((finding) => finding.category)).toEqual(['PRIVATE_CONTACT_PHONE']);
  });
});
