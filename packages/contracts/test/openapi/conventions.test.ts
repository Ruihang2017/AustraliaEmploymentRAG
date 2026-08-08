/**
 * FND-04 acceptance items 10, 11, 12 and 13 — the document-wide conventions.
 *
 *   10  ETag / If-Match / 409 CONCURRENT_MODIFICATION on every mutable-resource operation
 *   11  Idempotency-Key, 16-128 characters, on every write documented as retryable
 *   12  pagination declared once and reused
 *   13  `POST /v1/search` documented as read-only and non-charging
 *
 * Plus the two security-sensitive rules the ticket's Background makes binding: PRD §16.5's uniform
 * not-found response, and PRD §16.4's "keys are displayed only on entry".
 *
 * Every scan is proved NON-VACUOUS by a mutated in-memory copy that must produce a finding. A scan
 * that has never been seen to fail is indistinguishable from one that returns `[]` unconditionally.
 */
import { describe, expect, it } from 'vitest';

import { operations } from '../../src/openapi/document.mjs';
import {
  SEARCH_READ_ONLY_SENTENCE,
  declaredErrorCodes,
  scanConventions,
  scanMutableResources,
  scanNotFoundUniformity,
  scanPagination,
  scanPrdBasis,
  scanResponseEnvelope,
  scanRetryableWrites,
  scanSearchReadOnly,
  scanSecretsInResponses,
} from '../../src/openapi/conventions.mjs';
import { copyOf, document, fixture, type Json } from './fixture.js';

const tenantFixture = fixture<{ secretResponseFieldNames: string[] }>('tenant-forbidden-fields.json');

function searchPost(doc: Json): Json {
  return ((doc.paths as Json)['/search'] as Json).post as Json;
}
function researchRecordItem(doc: Json): Json {
  return (doc.paths as Json)['/research-records/{id}'] as Json;
}

describe('document conventions (acceptance items 10-13)', () => {
  it('reports nothing on the real document', () => {
    const findings = scanConventions(document(), {
      secretResponseFieldNames: tenantFixture.secretResponseFieldNames,
    });
    expect(
      findings.map((finding) => `${finding.rule} @ ${finding.location}: ${finding.message}`),
    ).toEqual([]);
  });

  it('is not vacuous: the scans see every operation and every write', () => {
    const ops = operations(document());
    expect(ops).toHaveLength(93);
    const writes = ops.filter(({ method }) => ['post', 'put', 'patch', 'delete'].includes(method));
    expect(writes.length).toBeGreaterThan(40);
    const mutations = ops.filter(({ method }) => ['patch', 'delete'].includes(method));
    expect(mutations.length).toBeGreaterThan(8);
  });

  // --- acceptance item 10 ------------------------------------------------------------------------
  describe('mutable resources (item 10)', () => {
    it('gives every PATCH/DELETE an explicit `x-mutable-resource`', () => {
      for (const { path, method, operation } of operations(document())) {
        if (!['patch', 'delete', 'put'].includes(method)) continue;
        expect(
          typeof (operation as Json)['x-mutable-resource'],
          `${method.toUpperCase()} ${path}`,
        ).toBe('boolean');
      }
    });

    it('flags a mutable write that drops `If-Match`', () => {
      const broken = copyOf(document());
      (researchRecordItem(broken).patch as Json).parameters = [];
      expect(scanMutableResources(broken).map((finding) => finding.rule)).toContain(
        'mutable-resource-if-match',
      );
    });

    it('flags a mutable write that drops its 409', () => {
      const broken = copyOf(document());
      delete ((researchRecordItem(broken).patch as Json).responses as Json)['409'];
      expect(scanMutableResources(broken).map((finding) => finding.rule)).toContain('mutable-resource-409');
    });

    it('flags a mutable resource whose GET drops the `ETag` header', () => {
      const broken = copyOf(document());
      delete (((researchRecordItem(broken).get as Json).responses as Json)['200'] as Json).headers;
      expect(scanMutableResources(broken).map((finding) => finding.rule)).toContain('mutable-resource-etag');
    });

    it('flags a PATCH that omits the marker entirely', () => {
      const broken = copyOf(document());
      delete (researchRecordItem(broken).patch as Json)['x-mutable-resource'];
      expect(scanMutableResources(broken).map((finding) => finding.rule)).toContain(
        'mutable-resource-marker',
      );
    });
  });

  // --- acceptance item 11 ------------------------------------------------------------------------
  describe('retryable writes (item 11)', () => {
    it('constrains the shared `Idempotency-Key` header to 16-128 characters', () => {
      const parameter = ((document().components as Json).parameters as Json)
        .IdempotencyKeyHeader as Json;
      expect(parameter.name).toBe('Idempotency-Key');
      expect(parameter.in).toBe('header');
      expect((parameter.schema as Json).minLength).toBe(16);
      expect((parameter.schema as Json).maxLength).toBe(128);
    });

    it('gives every write an explicit `x-retryable-write`', () => {
      for (const { path, method, operation } of operations(document())) {
        if (!['post', 'put', 'patch', 'delete'].includes(method)) continue;
        expect(typeof (operation as Json)['x-retryable-write'], `${method.toUpperCase()} ${path}`).toBe(
          'boolean',
        );
      }
    });

    it('flags a retryable write that drops the key', () => {
      const broken = copyOf(document());
      (((broken.paths as Json)['/answers'] as Json).post as Json).parameters = [];
      expect(scanRetryableWrites(broken).map((finding) => finding.rule)).toContain('retryable-write-key');
    });

    it('flags a loosened key constraint', () => {
      const broken = copyOf(document());
      (
        (((broken.components as Json).parameters as Json).IdempotencyKeyHeader as Json).schema as Json
      ).minLength = 1;
      expect(scanRetryableWrites(broken).map((finding) => finding.rule)).toContain('idempotency-parameter');
    });

    it('never conflates the two 409s: no operation declares both', () => {
      for (const { path, method, operation } of operations(document())) {
        const codes = declaredErrorCodes(document(), operation);
        expect(
          codes.has('IDEMPOTENCY_CONFLICT') && codes.has('CONCURRENT_MODIFICATION'),
          `${method.toUpperCase()} ${path} declares both 409 causes`,
        ).toBe(false);
      }
    });

    // A `responses` map has one entry per status, so the only way to declare both 409 causes on one
    // operation is a composite response naming both codes. That is exactly the silent conflation the
    // rule exists to catch, so the control has to take that route.
    it('flags an operation whose composite 409 names both causes', () => {
      const broken = copyOf(document());
      ((broken.components as Json).responses as Json).EitherConflict = {
        description: 'either conflict',
        'x-error-codes': ['IDEMPOTENCY_CONFLICT', 'CONCURRENT_MODIFICATION'],
        'x-http-status': 409,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      };
      ((researchRecordItem(broken).patch as Json).responses as Json)['409'] = {
        $ref: '#/components/responses/EitherConflict',
      };
      expect(scanRetryableWrites(broken).map((finding) => finding.rule)).toContain(
        'conflict-codes-distinct',
      );
    });

    it('flags a retryable create that swaps its 409 for the wrong cause', () => {
      const broken = copyOf(document());
      ((((broken.paths as Json)['/answers'] as Json).post as Json).responses as Json)['409'] = {
        $ref: '#/components/responses/ConcurrentModification',
      };
      expect(scanRetryableWrites(broken).map((finding) => finding.rule)).toContain('retryable-write-409');
    });
  });

  // --- acceptance item 12 ------------------------------------------------------------------------
  describe('pagination (item 12)', () => {
    it('declares `page_size` once, 1-100 default 25, and an opaque cursor', () => {
      const parameters = (document().components as Json).parameters as Record<string, Json>;
      expect((parameters.PageSize?.schema as Json).minimum).toBe(1);
      expect((parameters.PageSize?.schema as Json).maximum).toBe(100);
      expect((parameters.PageSize?.schema as Json).default).toBe(25);
      expect(parameters.Cursor?.name).toBe('cursor');
    });

    it('reuses the shared parameters everywhere, never inlining them', () => {
      expect(scanPagination(document())).toEqual([]);
    });

    it('flags an inlined `page_size`', () => {
      const broken = copyOf(document());
      ((broken.paths as Json)['/research-records'] as Json).get = {
        ...(((broken.paths as Json)['/research-records'] as Json).get as Json),
        parameters: [{ name: 'page_size', in: 'query', schema: { type: 'integer' } }],
      };
      expect(scanPagination(broken).map((finding) => finding.rule)).toContain('pagination-reused');
    });

    it('flags a loosened page-size bound', () => {
      const broken = copyOf(document());
      (((broken.components as Json).parameters as Json).PageSize as Json).schema = {
        type: 'integer',
        minimum: 1,
        maximum: 1000,
        default: 25,
      };
      expect(scanPagination(broken).map((finding) => finding.rule)).toContain('pagination-declared-once');
    });
  });

  // --- acceptance item 13 ------------------------------------------------------------------------
  describe('search is read-only and non-charging (item 13)', () => {
    it('marks it and quotes PRD §16.2', () => {
      expect(scanSearchReadOnly(document())).toEqual([]);
      expect(String(searchPost(document()).description)).toContain(SEARCH_READ_ONLY_SENTENCE);
    });

    it('declares no `CREDIT_LIMIT_REACHED`', () => {
      expect(declaredErrorCodes(document(), searchPost(document())).has('CREDIT_LIMIT_REACHED')).toBe(
        false,
      );
    });

    it('flags search if it ever starts charging credits', () => {
      const broken = copyOf(document());
      (searchPost(broken).responses as Json)['429'] = {
        $ref: '#/components/responses/RateLimitedOrCreditLimitReached',
      };
      expect(scanSearchReadOnly(broken).map((finding) => finding.rule)).toContain('search-non-charging');
    });

    it('flags search if a marker is flipped', () => {
      const broken = copyOf(document());
      searchPost(broken)['x-read-only'] = false;
      expect(scanSearchReadOnly(broken).map((finding) => finding.rule)).toContain('search-read-only');
    });
  });

  // --- sub-PRD D27 -------------------------------------------------------------------------------
  describe('response envelope (sub-PRD D27)', () => {
    it('carries the envelope, or a reasoned exemption, on every 2xx JSON response', () => {
      expect(scanResponseEnvelope(document())).toEqual([]);
    });

    it('exempts exactly the two PRD-mandated schemas, each with a reason', () => {
      const schemas = (document().components as Json).schemas as Record<string, Json>;
      const exempt = Object.entries(schemas)
        .filter(([, schema]) => schema['x-envelope-exempt'] === true)
        .map(([name]) => name)
        .sort();
      expect(exempt).toEqual(['AnswerJobClarificationRequired', 'AnswerSnapshot']);
      for (const name of exempt) {
        expect(String(schemas[name]?.['x-envelope-exempt-reason'])).toContain('PRD §34');
      }
    });

    it('flags an unexplained exemption', () => {
      const broken = copyOf(document());
      delete ((broken.components as Json).schemas as Record<string, Json>).AnswerSnapshot?.[
        'x-envelope-exempt-reason'
      ];
      expect(scanResponseEnvelope(broken).map((finding) => finding.rule)).toContain('response-envelope');
    });

    it('flags a new 2xx schema that carries neither', () => {
      const broken = copyOf(document());
      ((broken.components as Json).schemas as Record<string, Json>).Bare = { type: 'object' };
      (((broken.paths as Json)['/system-status'] as Json).get as Json) = {
        ...(((broken.paths as Json)['/system-status'] as Json).get as Json),
        responses: {
          '200': { description: 'x', content: { 'application/json': { schema: { $ref: '#/components/schemas/Bare' } } } },
        },
      };
      expect(scanResponseEnvelope(broken).map((finding) => finding.rule)).toContain('response-envelope');
    });
  });

  // --- PRD §16.5 and §16.4 -----------------------------------------------------------------------
  describe('security-sensitive conventions', () => {
    it('keeps other-tenant and absent IDs on one not-found response (PRD §16.5)', () => {
      expect(scanNotFoundUniformity(document())).toEqual([]);
    });

    it('flags a 403 that could distinguish another tenant\'s resource', () => {
      const broken = copyOf(document());
      ((broken.components as Json).responses as Json).Forbidden = {
        description: 'forbidden',
        'x-error-code': 'RESOURCE_NOT_FOUND',
        'x-http-status': 403,
        'x-retryable': false,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      };
      ((researchRecordItem(broken).get as Json).responses as Json)['403'] = {
        $ref: '#/components/responses/Forbidden',
      };
      expect(scanNotFoundUniformity(broken).map((finding) => finding.rule)).toContain(
        'tenant-not-found-uniform',
      );
    });

    it('flags an ID-addressed operation with no 404', () => {
      const broken = copyOf(document());
      delete ((researchRecordItem(broken).get as Json).responses as Json)['404'];
      expect(scanNotFoundUniformity(broken).map((finding) => finding.rule)).toContain(
        'tenant-not-found-uniform',
      );
    });

    it('returns no secret-shaped property from any response (PRD §16.4)', () => {
      expect(scanSecretsInResponses(document(), tenantFixture.secretResponseFieldNames)).toEqual([]);
    });

    it('flags a BYOK key leaking into a response, including one nested behind a `$ref`', () => {
      const broken = copyOf(document());
      const credential = (
        ((broken.components as Json).schemas as Record<string, Json>)
          .ServiceAccountCredentialResponse as Json
      ).allOf as Json[];
      const body = credential[1] as Json;
      (((body.properties as Json).credential as Json).properties as Json).client_secret = {
        type: 'string',
      };
      const findings = scanSecretsInResponses(broken, tenantFixture.secretResponseFieldNames);
      expect(findings.map((finding) => finding.rule)).toContain('byok-secret-in-response');
      expect(findings[0]?.message).toContain('client_secret');
    });

    it('does not flag recovery codes, which PRD §16.3 returns once at generation', () => {
      expect(
        scanSecretsInResponses(document(), tenantFixture.secretResponseFieldNames).map(
          (finding) => finding.message,
        ),
      ).toEqual([]);
      expect(tenantFixture.secretResponseFieldNames).not.toContain('codes');
    });
  });

  describe('markers (sub-PRD D26)', () => {
    it('gives every operation an `x-prd-basis` and a unique `operationId`', () => {
      expect(scanPrdBasis(document())).toEqual([]);
    });

    it('flags a missing `x-prd-basis`', () => {
      const broken = copyOf(document());
      delete searchPost(broken)['x-prd-basis'];
      expect(scanPrdBasis(broken).map((finding) => finding.rule)).toContain('prd-basis');
    });

    it('flags a duplicated `operationId`', () => {
      const broken = copyOf(document());
      (((broken.paths as Json)['/alerts'] as Json).get as Json).operationId = 'search';
      expect(scanPrdBasis(broken).map((finding) => finding.rule)).toContain('operation-id');
    });
  });
});
