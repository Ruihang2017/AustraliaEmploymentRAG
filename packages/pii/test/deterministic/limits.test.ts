/**
 * EVID-01 deliverable 6 — request byte/field limits, including the reserved-name smuggling path.
 *
 * The smuggling case is the one this suite exists for. The conservative public-entity allow rule may
 * clear a finding whose field is `structured.abn`; if a caller could NAME a free-text field that, the
 * allow rule would clear a blocking finding on attacker-controlled text. The limits stage rejects the
 * request before any scanning, and the assertion below is what keeps that true.
 */
import { describe, expect, it } from 'vitest';

import { CONSERVATIVE_STAGE_DEFAULTS, admit } from '../../src/contract/pipeline.js';
import type { PiiAdmissionRequest } from '../../src/contract/request.js';
import {
  PII_ADMISSION_LIMITS,
  REQUEST_SCOPE_FIELD,
  enforceLimits,
  utf8Length,
} from '../../src/deterministic/limits.js';

const ok = (value: string, field = 'question'): PiiAdmissionRequest => ({
  freeText: [{ field, value }],
});

describe('PII_ADMISSION_LIMITS', () => {
  it('is versioned frozen data (deliverable 6)', () => {
    expect(PII_ADMISSION_LIMITS.version).toBe(1);
    expect(Object.isFrozen(PII_ADMISSION_LIMITS)).toBe(true);
    expect(Object.keys(PII_ADMISSION_LIMITS).sort()).toEqual([
      'maxFieldChars',
      'maxFieldCount',
      'maxFieldNameChars',
      'maxTotalBytes',
      'version',
    ]);
  });
});

describe('enforceLimits', () => {
  it('passes an ordinary request', () => {
    expect(enforceLimits(ok('Is the Sunday penalty rate different for casuals?'))).toEqual([]);
  });

  it('rejects a field longer than maxFieldChars, and never truncates', () => {
    const value = 'a'.repeat(PII_ADMISSION_LIMITS.maxFieldChars + 1);
    const findings = enforceLimits(ok(value));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('REQUEST_LIMIT_EXCEEDED');
    expect(findings[0]?.end).toBe(value.length);
    const result = admit(ok(value), CONSERVATIVE_STAGE_DEFAULTS);
    expect(result.decision).toBe('REJECT');
    expect('sanitizedPayload' in result).toBe(false);
  });

  it('accepts exactly maxFieldChars', () => {
    expect(enforceLimits(ok('a'.repeat(PII_ADMISSION_LIMITS.maxFieldChars)))).toEqual([]);
  });

  it('rejects more than maxFieldCount fields', () => {
    const request: PiiAdmissionRequest = {
      freeText: Array.from({ length: PII_ADMISSION_LIMITS.maxFieldCount + 1 }, (_value, index) => ({
        field: `field_${String(index)}`,
        value: 'x',
      })),
    };
    const findings = enforceLimits(request);
    expect(findings.some((finding) => finding.field === REQUEST_SCOPE_FIELD)).toBe(true);
  });

  it('counts the structured channels towards the field count', () => {
    const request: PiiAdmissionRequest = {
      freeText: Array.from({ length: PII_ADMISSION_LIMITS.maxFieldCount }, (_value, index) => ({
        field: `field_${String(index)}`,
        value: 'x',
      })),
      structured: { employer: 'Example Widgets Pty Ltd' },
    };
    expect(enforceLimits(request).length).toBeGreaterThan(0);
  });

  it('rejects a request over maxTotalBytes even when every field is legal', () => {
    const perField = 'a'.repeat(PII_ADMISSION_LIMITS.maxFieldChars);
    const request: PiiAdmissionRequest = {
      freeText: Array.from({ length: 9 }, (_value, index) => ({
        field: `field_${String(index)}`,
        value: perField,
      })),
    };
    expect(enforceLimits(request).length).toBeGreaterThan(0);
  });

  it('counts BYTES, not characters, for the total', () => {
    const emoji = String.fromCodePoint(0x1f600);
    expect(utf8Length(emoji)).toBe(4);
    expect(utf8Length('a')).toBe(1);
    expect(utf8Length(String.fromCodePoint(0x00e9))).toBe(2);
    expect(utf8Length(String.fromCodePoint(0x4e2d))).toBe(3);
  });

  it('collects EVERY violation, so the caller gets one complete answer', () => {
    const request: PiiAdmissionRequest = {
      freeText: [
        { field: 'structured.abn', value: 'x' },
        { field: '9bad', value: 'y' },
        { field: 'question', value: 'a'.repeat(PII_ADMISSION_LIMITS.maxFieldChars + 1) },
      ],
    };
    expect(enforceLimits(request).length).toBeGreaterThanOrEqual(3);
  });
});

describe('the reserved-name smuggling path is closed', () => {
  it.each([
    'structured.abn',
    'structured.employer',
    'structured.publicCaseParty',
    'structured.anything',
  ])('rejects a freeText field named %s before any scanning', (field) => {
    const result = admit(ok('Their TFN is 123456782.', field), CONSERVATIVE_STAGE_DEFAULTS);
    expect(result.decision).toBe('REJECT');
    expect(result.findings.map((finding) => finding.category)).toEqual(['REQUEST_LIMIT_EXCEEDED']);
  });

  it.each(['', '9lives', 'my field', 'field-name', 'field.name', 'a'.repeat(65)])(
    'rejects the malformed field name %s',
    (field) => {
      expect(enforceLimits(ok('x', field)).length).toBeGreaterThan(0);
    },
  );

  it.each(['question', 'question_2', 'Q', 'freeText1', 'a'.repeat(64)])(
    'accepts the well-formed field name %s',
    (field) => {
      expect(enforceLimits(ok('x', field))).toEqual([]);
    },
  );

  it('rejects a duplicate field name (two spans in "the same" field are unresolvable)', () => {
    const request: PiiAdmissionRequest = {
      freeText: [
        { field: 'question', value: 'a' },
        { field: 'question', value: 'b' },
      ],
    };
    expect(enforceLimits(request).length).toBeGreaterThan(0);
  });
});

describe('malformed but legal input fails open to nothing, not to an exception', () => {
  it.each([
    ['no fields at all', { freeText: [] } as PiiAdmissionRequest],
    ['an empty value', { freeText: [{ field: 'question', value: '' }] } as PiiAdmissionRequest],
    ['an empty structured object', { freeText: [], structured: {} } as PiiAdmissionRequest],
  ])('%s is a well-defined ACCEPT with no findings', (_label, request) => {
    const result = admit(request, CONSERVATIVE_STAGE_DEFAULTS);
    expect(result.decision).toBe('ACCEPT');
    expect(result.findings).toEqual([]);
  });
});
