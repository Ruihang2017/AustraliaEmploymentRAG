/**
 * EVID-07 test-plan step 6 — schema strictness.
 *
 * Every case in `fixtures/rejections.json` is replayed and asserted to fail with an exact code and an
 * exact path. Two properties are checked on top of the code/path pair, and they are the security ones:
 *
 *  - the failure carries NO value from the response (plan §6 risk 6). A failure object with anything
 *    beyond `{ ok, code, path }` would be a channel for provider text into a log;
 *  - the valid fixture still validates, so the rejections are not passing because everything fails.
 */
import { describe, expect, it } from 'vitest';

import '../providers/support/network-stub.js';
import { PACKAGE_ROOT, readJson } from '../providers/support/fixture.js';
import { parseModelResponse } from '../../src/schema/response.js';
import type { SchemaFailureCode } from '../../src/schema/response.js';

interface RejectionCase {
  readonly name: string;
  readonly why: string;
  readonly expect: { readonly code: SchemaFailureCode; readonly path: string };
  readonly patch?: Record<string, unknown>;
  readonly patchClaim?: Record<string, unknown>;
  readonly patchCitation?: Record<string, unknown>;
  readonly deleteKey?: string;
  readonly deleteCitationKey?: string;
  readonly raw?: string;
}

const FIXTURES = [PACKAGE_ROOT, 'test', 'schema', 'fixtures'] as const;
const validResponse = readJson<Record<string, unknown>>(...FIXTURES, 'valid-response.json');
const rejections = readJson<{ readonly cases: readonly RejectionCase[] }>(...FIXTURES, 'rejections.json');

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function buildBody(entry: RejectionCase): unknown {
  if (entry.raw !== undefined) return entry.raw;
  const body = clone(validResponse) as Record<string, unknown>;
  const claims = body.claims as Record<string, unknown>[];
  const firstClaim = claims[0] as Record<string, unknown>;
  const citations = firstClaim.evidence as Record<string, unknown>[];
  const firstCitation = citations[0] as Record<string, unknown>;

  if (entry.patch) Object.assign(body, entry.patch);
  if (entry.patchClaim) Object.assign(firstClaim, entry.patchClaim);
  if (entry.patchCitation) Object.assign(firstCitation, entry.patchCitation);
  if (entry.deleteKey !== undefined) delete body[entry.deleteKey];
  if (entry.deleteCitationKey !== undefined) delete firstCitation[entry.deleteCitationKey];
  return body;
}

describe('the positive control', () => {
  it('validates the PRD §36.5-shaped fixture', () => {
    const result = parseModelResponse(validResponse);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.proposed_status).toBe('CONDITIONAL');
    expect(result.value.claims).toHaveLength(2);
    expect(result.value.claims[0]?.evidence[0]?.evidence_id).toBe('ev_01');
  });

  it('validates the same fixture handed over as a JSON string', () => {
    expect(parseModelResponse(JSON.stringify(validResponse)).ok).toBe(true);
  });

  it('has cases to replay (non-vacuity)', () => {
    expect(rejections.cases.length).toBeGreaterThanOrEqual(20);
  });
});

describe('rejections', () => {
  it.each(rejections.cases.map((entry) => [entry.name, entry] as const))('rejects %s', (_name, entry) => {
    const result = parseModelResponse(buildBody(entry));
    expect(result.ok, `${entry.name} was accepted; ${entry.why}`).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe(entry.expect.code);
    expect(result.path).toBe(entry.expect.path);
  });

  it.each(rejections.cases.map((entry) => [entry.name, entry] as const))(
    'carries no value from the response for %s (PRD §37.3)',
    (_name, entry) => {
      const result = parseModelResponse(buildBody(entry));
      if (result.ok) throw new Error('unreachable');
      expect(Object.keys(result).sort()).toEqual(['code', 'ok', 'path']);
      // The path is structural: a key name or an index, never a quoted value.
      expect(result.path).toMatch(/^\$(\.[A-Za-z_][\w]*|\[\d+\])*$/);
    },
  );
});

describe('no salvage path exists', () => {
  it('does not repair a missing property by defaulting it', () => {
    const body = clone(validResponse) as Record<string, unknown>;
    delete body.next_checks;
    const result = parseModelResponse(body);
    expect(result.ok).toBe(false);
  });

  it('does not accept a claim list where one entry is bad and the rest are good', () => {
    const body = clone(validResponse) as Record<string, unknown>;
    (body.claims as Record<string, unknown>[])[1] = { ...((body.claims as Record<string, unknown>[])[1] ?? {}), kind: 'NONSENSE' };
    const result = parseModelResponse(body);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.path).toBe('$.claims[1].kind');
  });

  it('accepts an empty claim list — an empty answer is a legitimate §36.5 shape, not a repair', () => {
    const body = clone(validResponse) as Record<string, unknown>;
    body.claims = [];
    expect(parseModelResponse(body).ok).toBe(true);
  });

  it.each([null, undefined, 42, true])('rejects the non-object body %s', (body) => {
    expect(parseModelResponse(body).ok).toBe(false);
  });
});
