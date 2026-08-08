/**
 * FND-04 acceptance item 1 — "`schemas/openapi/openapi.yaml` validates against the OpenAPI 3.1
 * meta-schema and every `$ref` resolves (PRD §34 preamble)."
 *
 * Offline throughout: the meta-schema is vendored under `schemas/openapi/meta/`.
 */
import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_PATH,
  collectExternalValues,
  collectRefs,
  loadMetaSchema,
  loadOpenApiDocument,
  metaSchemaErrors,
  operations,
  resolvePointer,
  unresolvedExternalValues,
  unresolvedRefs,
} from '../../src/openapi/document.mjs';
import { copyOf, document, type Json } from './fixture.js';

describe('OpenAPI 3.1 validity (acceptance item 1)', () => {
  it('loads and validates the document', () => {
    expect(() => loadOpenApiDocument()).not.toThrow();
  });

  it('is OpenAPI 3.1 with `info.version` 1.0 and both PRD §16.1 base paths', () => {
    const doc = document();
    expect(doc.openapi).toMatch(/^3\.1\.\d+$/);
    expect((doc.info as Json).version).toBe('1.0');
    expect((doc.servers as { url: string }[]).map((server) => server.url)).toEqual([
      '/v1',
      '/internal/v1',
    ]);
  });

  it('resolves every `$ref`', () => {
    expect(unresolvedRefs(document())).toEqual([]);
  });

  it('resolves every `externalValue` to a file that exists', () => {
    expect(unresolvedExternalValues(document(), DOCUMENT_PATH)).toEqual([]);
  });

  // Non-vacuity. A ref walker that found nothing, or a resolver that returned a value for anything,
  // would make the two assertions above pass on an empty document.
  it('is not vacuous: the walkers find real refs and real external values', () => {
    const refs = collectRefs(document());
    expect(refs.length).toBeGreaterThan(200);
    expect(refs.some(({ ref }) => ref === '#/components/schemas/ErrorResponse')).toBe(true);
    expect(collectExternalValues(document()).length).toBe(10);
  });

  it('reports a broken `$ref` instead of silently ignoring it', () => {
    const broken = copyOf(document());
    ((broken.paths as Json)['/search'] as Json).post = {
      ...(((broken.paths as Json)['/search'] as Json).post as Json),
      responses: { '200': { $ref: '#/components/responses/NoSuchResponse' } },
    };
    expect(unresolvedRefs(broken)).toEqual([
      '/paths/~1search/post/responses/200/$ref: #/components/responses/NoSuchResponse',
    ]);
  });

  it('resolves a pointer that exists and returns undefined for one that does not', () => {
    expect(resolvePointer(document(), '#/components/schemas/ErrorResponse')).toBeTruthy();
    expect(resolvePointer(document(), '#/components/schemas/Nope')).toBeUndefined();
  });

  // The meta-schema pass is only worth something if it has been seen to fail. These run the REAL
  // compiled validator over in-memory mutated copies; the repository file is never touched.
  it('reports no meta-schema error for the real document', () => {
    expect(metaSchemaErrors(document())).toEqual([]);
  });

  it.each([
    ['a non-3.1 `openapi` version', (doc: Json) => { doc.openapi = '2.0'; }],
    ['a missing `info`', (doc: Json) => { delete doc.info; }],
    ['an operation whose response has no description', (doc: Json) => {
      ((((doc.paths as Json)['/search'] as Json).post as Json).responses as Json)['200'] = { content: {} };
    }],
    ['a parameter with no `name`', (doc: Json) => {
      ((doc.paths as Json)['/documents/{document_id}'] as Json).parameters = [{ in: 'path', required: true }];
    }],
  ])('rejects %s', (_label, mutate) => {
    const invalid = copyOf(document());
    mutate(invalid);
    expect(metaSchemaErrors(invalid).length).toBeGreaterThan(0);
  });

  it('statically resolves the vendored meta-schema\'s `$dynamicRef`, and says so if it stops finding one', () => {
    const { resolvedDynamicRefs } = loadMetaSchema();
    expect(resolvedDynamicRefs).toBeGreaterThan(0);
  });

  it('declares 93 operations across 7 PRD §16.2/§16.3 groups', () => {
    const ops = operations(document());
    expect(ops).toHaveLength(93);
    const tags = new Set(ops.flatMap(({ operation }) => (operation as Json).tags as string[]));
    expect(tags.size).toBe(7);
  });
});
