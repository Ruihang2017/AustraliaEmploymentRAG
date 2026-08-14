/**
 * EVID-07 acceptance item "No reasoning field is requested or accepted" — one test per name
 * (PRD §9.4, sub-PRD D14).
 *
 * The request half of the item is asserted at compile time in `types.test-d.ts` and again by the
 * source scan in `test/providers/architecture.test.ts`. This file is the response half: at every level
 * of the §36.5 object, a reasoning-family member must be a SCHEMA FAILURE with the failing path — not
 * a dropped extra, not a warning, not a stripped field.
 */
import { describe, expect, it } from 'vitest';

import '../providers/support/network-stub.js';
import { PACKAGE_ROOT, readJson } from '../providers/support/fixture.js';
import { REASONING_FIELD_NAMES, isReasoningFieldName, parseModelResponse } from '../../src/schema/response.js';
import { INSTRUCTION_TEMPLATE_V1 } from '../../src/schema/request.js';

const validResponse = readJson<Record<string, unknown>>(
  PACKAGE_ROOT,
  'test',
  'schema',
  'fixtures',
  'valid-response.json',
);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The four names the acceptance item names explicitly, plus the rest of the family. */
const NAMED_BY_THE_TICKET = ['reasoning', 'thinking', 'chain_of_thought', 'scratchpad'] as const;

describe('the family is recognised', () => {
  it.each(NAMED_BY_THE_TICKET)('knows %s', (name) => {
    expect(isReasoningFieldName(name)).toBe(true);
  });

  it('also knows `analysis`, which the acceptance item lists as "or equivalent"', () => {
    expect(isReasoningFieldName('analysis')).toBe(true);
  });

  it('is not vacuous: a legitimate §36.5 member is not in the family', () => {
    for (const name of ['claims', 'short_answer', 'limitations', 'assumptions']) {
      expect(isReasoningFieldName(name)).toBe(false);
    }
  });
});

describe.each(REASONING_FIELD_NAMES)('a `%s` member is a schema failure', (name) => {
  it('at the top level', () => {
    const body = { ...clone(validResponse), [name]: 'some hidden trace' };
    const result = parseModelResponse(body);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('REASONING_FIELD_REJECTED');
    expect(result.path).toBe(`$.${name}`);
  });

  it('on a claim', () => {
    const body = clone(validResponse) as Record<string, unknown>;
    const claims = body.claims as Record<string, unknown>[];
    claims[0] = { ...(claims[0] ?? {}), [name]: 'some hidden trace' };
    const result = parseModelResponse(body);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('REASONING_FIELD_REJECTED');
    expect(result.path).toBe(`$.claims[0].${name}`);
  });

  it('on a citation', () => {
    const body = clone(validResponse) as Record<string, unknown>;
    const claims = body.claims as Record<string, unknown>[];
    const citations = (claims[0] as Record<string, unknown>).evidence as Record<string, unknown>[];
    citations[0] = { ...(citations[0] ?? {}), [name]: 'some hidden trace' };
    const result = parseModelResponse(body);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.path).toBe(`$.claims[0].evidence[0].${name}`);
  });

  it('on an assumption', () => {
    const body = clone(validResponse) as Record<string, unknown>;
    const assumptions = body.assumptions as Record<string, unknown>[];
    assumptions[0] = { ...(assumptions[0] ?? {}), [name]: 'some hidden trace' };
    const result = parseModelResponse(body);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.path).toBe(`$.assumptions[0].${name}`);
  });

  it('is rejected rather than dropped — the failure never carries the trace text', () => {
    const body = { ...clone(validResponse), [name]: 'CANARY-TRACE-should-never-be-echoed' };
    const result = parseModelResponse(body);
    if (result.ok) throw new Error('unreachable');
    expect(JSON.stringify(result)).not.toContain('CANARY-TRACE');
  });
});

describe('nothing in the request asks for reasoning', () => {
  it.each(REASONING_FIELD_NAMES)('the instruction template never mentions %s', (name) => {
    const text = INSTRUCTION_TEMPLATE_V1.segments.join('\n').toLowerCase();
    expect(text).not.toContain(name.toLowerCase().replace(/_/g, ' '));
    expect(text).not.toContain(name.toLowerCase());
  });

  it('is not vacuous: the template does contain its own words', () => {
    expect(INSTRUCTION_TEMPLATE_V1.segments.join('\n')).toContain('evidence_id');
  });
});
