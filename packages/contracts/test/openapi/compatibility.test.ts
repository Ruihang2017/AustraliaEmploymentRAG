/**
 * FND-04 acceptance item 8 — "Breaking-change detection, negative test: a scratch copy of the
 * document with one response property removed is reported **breaking** by `checkCompatibility`; a
 * copy with one *optional* property added is reported compatible (PRD §16.1)."
 *
 * The rule table is sub-PRD **D25**, and each test below names the row it exercises. Every case runs
 * on an in-memory deep copy — the ticket's test-plan step 5 says "copy `openapi.yaml` to a scratch
 * file", and an in-memory copy is the same thing without the risk of leaving a scratch file behind
 * and dirtying `git status --porcelain` (acceptance item 6).
 */
import { describe, expect, it } from 'vitest';

import { checkCompatibility } from '../../src/openapi/compatibility.mjs';
import { loadOpenApiDocument } from '../../src/openapi/document.mjs';
import { BASELINE_PATH } from '../../src/openapi/document.mjs';
import { copyOf, document, type Json } from './fixture.js';

const base = document();
const schemas = (doc: Json) => (doc.components as Json).schemas as Record<string, Json>;
const rules = (result: { breaking: { rule: string }[] }) => result.breaking.map((finding) => finding.rule);

describe('breaking-change detection (acceptance item 8)', () => {
  it('reports nothing breaking when a document is compared with itself', () => {
    const result = checkCompatibility(base, copyOf(base));
    expect(result.breaking).toEqual([]);
  });

  it('is not vacuous: the checker walks real operations and real schemas', () => {
    const widened = copyOf(base);
    (schemas(widened).SearchRequest as Json).properties = {
      ...((schemas(widened).SearchRequest as Json).properties as Json),
      brand_new_optional: { type: 'string' },
    };
    const result = checkCompatibility(base, widened);
    expect(result.compatible.length).toBeGreaterThan(0);
    expect(result.breaking).toEqual([]);
  });

  // --- D25: removals ----------------------------------------------------------------------------
  it('reports a removed response property as breaking', () => {
    const narrowed = copyOf(base);
    delete ((schemas(narrowed).SearchResult as Json).properties as Json).pinpoint;
    const result = checkCompatibility(base, narrowed);
    expect(rules(result)).toContain('property-removed');
    expect(result.breaking.some((finding) => finding.message.includes('pinpoint'))).toBe(true);
  });

  it('reports a removed path as breaking', () => {
    const narrowed = copyOf(base);
    delete (narrowed.paths as Json)['/search'];
    expect(rules(checkCompatibility(base, narrowed))).toContain('path-removed');
  });

  it('reports a removed operation as breaking', () => {
    const narrowed = copyOf(base);
    delete ((narrowed.paths as Json)['/research-records/{id}'] as Json).delete;
    expect(rules(checkCompatibility(base, narrowed))).toContain('operation-removed');
  });

  it('reports a removed response status as breaking', () => {
    const narrowed = copyOf(base);
    delete (((narrowed.paths as Json)['/search'] as Json).post as Json).responses?.['503'];
    expect(rules(checkCompatibility(base, narrowed))).toContain('response-removed');
  });

  it('reports a removed enum member as breaking', () => {
    const narrowed = copyOf(base);
    const answerStatus = schemas(narrowed).AnswerStatus as Json;
    answerStatus.enum = (answerStatus.enum as string[]).slice(1);
    const result = checkCompatibility(base, narrowed);
    expect(rules(result)).toContain('enum-member-removed');
  });

  it('reports a removed parameter as breaking', () => {
    const narrowed = copyOf(base);
    ((narrowed.paths as Json)['/research-records'] as Json).get = {
      ...(((narrowed.paths as Json)['/research-records'] as Json).get as Json),
      parameters: [],
    };
    expect(rules(checkCompatibility(base, narrowed))).toContain('parameter-removed');
  });

  // --- D25: narrowings --------------------------------------------------------------------------
  it('reports a narrowed type as breaking', () => {
    const narrowed = copyOf(base);
    (schemas(narrowed).Cursor as Json).type = 'string'; // was ['string', 'null']
    expect(rules(checkCompatibility(base, narrowed))).toContain('type-narrowed');
  });

  it('reports a tightened bound as breaking', () => {
    const narrowed = copyOf(base);
    ((((narrowed.components as Json).parameters as Json).PageSize as Json).schema as Json).maximum = 50;
    expect(rules(checkCompatibility(base, narrowed))).toContain('bound-tightened');
  });

  it('reports a newly required request property as breaking', () => {
    const narrowed = copyOf(base);
    (schemas(narrowed).SearchRequest as Json).required = ['query', 'legal_as_at'];
    expect(rules(checkCompatibility(base, narrowed))).toContain('property-newly-required');
  });

  it('reports a request property added as required as breaking', () => {
    const narrowed = copyOf(base);
    const request = schemas(narrowed).SearchRequest as Json;
    request.properties = { ...(request.properties as Json), must_supply: { type: 'string' } };
    request.required = ['query', 'must_supply'];
    expect(rules(checkCompatibility(base, narrowed))).toContain('required-property-added');
  });

  it('reports a tightened request `format` as breaking', () => {
    const narrowed = copyOf(base);
    ((schemas(narrowed).SearchRequest as Json).properties as Json).query = {
      type: 'string',
      minLength: 1,
      format: 'uuid',
    };
    expect(rules(checkCompatibility(base, narrowed))).toContain('format-tightened');
  });

  it('reports a shrunken `oneOf` as breaking', () => {
    const narrowed = copyOf(base);
    const response = ((((narrowed.paths as Json)['/answers'] as Json).post as Json).responses as Json)[
      '202'
    ] as Json;
    const media = (response.content as Json)['application/json'] as Json;
    (media.schema as Json).oneOf = [((media.schema as Json).oneOf as Json[])[0] as Json];
    expect(rules(checkCompatibility(base, narrowed))).toContain('type-narrowed');
  });

  // --- D25: additive changes --------------------------------------------------------------------
  it('reports an added optional response property as compatible', () => {
    const widened = copyOf(base);
    (schemas(widened).SearchResult as Json).properties = {
      ...((schemas(widened).SearchResult as Json).properties as Json),
      new_hint: { type: 'string' },
    };
    const result = checkCompatibility(base, widened);
    expect(result.breaking).toEqual([]);
    expect(result.compatible.map((finding) => finding.rule)).toContain('optional-property-added');
  });

  it('reports an added path and an added response status as compatible', () => {
    const widened = copyOf(base);
    (widened.paths as Json)['/brand-new'] = {
      get: { operationId: 'brandNew', responses: { '200': { description: 'ok' } } },
    };
    (((widened.paths as Json)['/search'] as Json).post as Json).responses = {
      ...((((widened.paths as Json)['/search'] as Json).post as Json).responses as Json),
      '418': { description: 'teapot' },
    };
    const result = checkCompatibility(base, widened);
    expect(result.breaking).toEqual([]);
    const compatibleRules = result.compatible.map((finding) => finding.rule);
    expect(compatibleRules).toContain('path-added');
    expect(compatibleRules).toContain('response-added');
  });

  it('reports a loosened bound as compatible', () => {
    const widened = copyOf(base);
    ((((widened.components as Json).parameters as Json).PageSize as Json).schema as Json).maximum = 500;
    const result = checkCompatibility(base, widened);
    expect(result.breaking).toEqual([]);
    expect(result.compatible.map((finding) => finding.rule)).toContain('bound-loosened');
  });

  // --- D25: the enum-addition asymmetry ----------------------------------------------------------
  it('reports adding a member to a closed RESPONSE enum as breaking', () => {
    const widened = copyOf(base);
    const status = schemas(widened).AnswerStatus as Json;
    expect(status['x-enum-usage']).toBe('response');
    status.enum = [...(status.enum as string[]), 'BRAND_NEW_STATUS'];
    expect(rules(checkCompatibility(base, widened))).toContain('enum-member-added');
  });

  it('reports adding a member to an open enum as compatible', () => {
    const widened = copyOf(base);
    const status = schemas(widened).AnswerStatus as Json;
    status['x-closed-enum'] = false;
    status.enum = [...(status.enum as string[]), 'BRAND_NEW_STATUS'];
    const result = checkCompatibility(base, widened);
    expect(result.breaking).toEqual([]);
    expect(result.compatible.map((finding) => finding.rule)).toContain('enum-member-added');
  });

  // --- determinism -------------------------------------------------------------------------------
  it('sorts findings by pointer, so a report diffs cleanly', () => {
    const narrowed = copyOf(base);
    delete ((schemas(narrowed).SearchResult as Json).properties as Json).pinpoint;
    delete ((schemas(narrowed).Citation as Json).properties as Json).quote;
    const first = checkCompatibility(base, narrowed);
    const second = checkCompatibility(base, copyOf(narrowed));
    expect(first).toEqual(second);
    const pointers = first.breaking.map((finding) => finding.pointer);
    expect([...pointers].sort()).toEqual(pointers);
  });
});

describe('the committed baseline (deliverable 5)', () => {
  it('is byte-compatible with the published document — a tautology by design at first capture', () => {
    // The baseline is a verbatim capture living one directory deeper, so its `externalValue`s are
    // still relative to `schemas/openapi/`. Re-pointing them would make it not a capture.
    const baseline = loadOpenApiDocument(BASELINE_PATH, 'schemas/openapi') as Json;
    const result = checkCompatibility(baseline, base);
    expect(result.breaking).toEqual([]);
    expect(result.compatible).toEqual([]);
  });

  it('documents its own advance procedure', () => {
    expect(BASELINE_PATH).toBe('schemas/openapi/baseline/v1.yaml');
  });
});
