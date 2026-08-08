/**
 * FND-04 acceptance item 9 — "No operation accepts an organisation/tenant identifier in a path,
 * query or body parameter — asserted by scanning every operation's parameters and request schemas
 * (PRD §34.1, §16.5)."
 *
 * This is the security-sensitive one. Everything downstream — `DATA-02`'s tenant-scoped
 * repositories, `RUNT-02`'s admission chain, `SEC-001` — assumes the CONTRACT never lets a client
 * name an organisation, so a scan that only reads top-level path parameters would discharge
 * nothing. The positive controls below are deliberately nastier than the real document: a forbidden
 * name three levels deep behind a `$ref`, one in a header, one in a cookie, and one on a security
 * scheme.
 */
import { describe, expect, it } from 'vitest';

import { operations } from '../../src/openapi/document.mjs';
import { REQUEST_LOCATIONS, propertyNames, scanTenantLeaks } from '../../src/openapi/tenant-leak.mjs';
import { copyOf, document, fixture, type Json } from './fixture.js';

interface TenantFixture {
  requestFieldNames: string[];
  securitySchemeNames: string[];
  secretResponseFieldNames: string[];
}

const forbidden = fixture<TenantFixture>('tenant-forbidden-fields.json');

describe('tenant leak scan (acceptance item 9)', () => {
  it('finds nothing in the real document', () => {
    expect(
      scanTenantLeaks(document(), forbidden).map((finding) => `${finding.location}: ${finding.name}`),
    ).toEqual([]);
  });

  it('inspects path, query, header AND cookie parameters — not only path', () => {
    expect(REQUEST_LOCATIONS).toEqual(['path', 'query', 'header', 'cookie']);
  });

  it('is not vacuous: the walker reaches deeply nested, `$ref`\'d property names', () => {
    const searchRequest = { $ref: '#/components/schemas/SearchRequest' };
    const names = propertyNames(document(), searchRequest).map((entry) => entry.name);
    expect(names).toContain('query');
    expect(names).toContain('abn'); // nested inside `employer`

    const snapshot = { $ref: '#/components/schemas/AnswerSnapshot' };
    const paths = propertyNames(document(), snapshot).map((entry) => entry.path);
    // claims[] -> citation_ids proves it follows $ref -> array items -> property.
    expect(paths).toContain('claims[].citation_ids');
  });

  it('reads every operation, so no path is skipped', () => {
    expect(operations(document())).toHaveLength(93);
  });

  it.each(forbidden.requestFieldNames)('rejects `%s` as a top-level path parameter', (name) => {
    const leaky = copyOf(document());
    ((leaky.paths as Json)['/search'] as Json).parameters = [
      { name, in: 'path', required: true, schema: { type: 'string' } },
    ];
    const findings = scanTenantLeaks(leaky, forbidden);
    expect(findings.map((finding) => finding.name)).toContain(name);
  });

  it('rejects a tenant header, which a path-only scan would miss', () => {
    const leaky = copyOf(document());
    (((leaky.paths as Json)['/search'] as Json).post as Json).parameters = [
      { name: 'X-Tenant-Id', in: 'header', schema: { type: 'string' } },
      { name: 'tenant_id', in: 'header', schema: { type: 'string' } },
    ];
    expect(scanTenantLeaks(leaky, forbidden).map((finding) => finding.name)).toContain('tenant_id');
  });

  it('rejects a tenant cookie', () => {
    const leaky = copyOf(document());
    (((leaky.paths as Json)['/search'] as Json).post as Json).parameters = [
      { name: 'org_id', in: 'cookie', schema: { type: 'string' } },
    ];
    expect(scanTenantLeaks(leaky, forbidden).map((finding) => finding.name)).toContain('org_id');
  });

  // THE control that matters: three levels deep, behind a $ref, inside an array.
  it('rejects a forbidden name nested three levels inside a request body behind a `$ref`', () => {
    const leaky = copyOf(document());
    const schemas = (leaky.components as Json).schemas as Record<string, Json>;
    schemas.DeeplyNested = {
      type: 'object',
      properties: { organisation_id: { type: 'string' } },
    };
    schemas.MiddleLayer = {
      type: 'object',
      properties: { inner: { type: 'array', items: { $ref: '#/components/schemas/DeeplyNested' } } },
    };
    (schemas.SearchRequest as Json).properties = {
      ...((schemas.SearchRequest as Json).properties as Json),
      outer: { $ref: '#/components/schemas/MiddleLayer' },
    };
    const findings = scanTenantLeaks(leaky, forbidden);
    expect(findings.map((finding) => finding.name)).toContain('organisation_id');
    expect(findings[0]?.location).toContain('POST /search body.outer');
  });

  it('rejects a forbidden name reached through `allOf`', () => {
    const leaky = copyOf(document());
    const schemas = (leaky.components as Json).schemas as Record<string, Json>;
    schemas.TenantMixin = { type: 'object', properties: { workspace_id: { type: 'string' } } };
    schemas.ResearchRecordCreateRequest = {
      allOf: [
        { $ref: '#/components/schemas/TenantMixin' },
        copyOf(schemas.ResearchRecordCreateRequest) as Json,
      ],
    };
    expect(scanTenantLeaks(leaky, forbidden).map((finding) => finding.name)).toContain('workspace_id');
  });

  it('rejects a security scheme that reads the tenant from the request', () => {
    const leaky = copyOf(document());
    ((leaky.components as Json).securitySchemes as Json).tenantHeader = {
      type: 'apiKey',
      in: 'header',
      name: 'X-Organisation-Id',
    };
    const findings = scanTenantLeaks(leaky, forbidden);
    expect(findings.map((finding) => finding.location)).toContain(
      '#/components/securitySchemes/tenantHeader',
    );
  });

  it('accepts the three real security schemes, none of which names a tenant', () => {
    const schemes = (document().components as Json).securitySchemes as Record<string, Json>;
    expect(Object.keys(schemes).sort()).toEqual(['apiCredential', 'sessionCookie', 'widgetSessionToken']);
    expect(schemes.sessionCookie?.name).toBe('aer_session');
  });

  it('terminates on a cyclic schema instead of hanging', () => {
    const cyclic = copyOf(document());
    const schemas = (cyclic.components as Json).schemas as Record<string, Json>;
    schemas.Cycle = {
      type: 'object',
      properties: { self: { $ref: '#/components/schemas/Cycle' }, tenant_id: { type: 'string' } },
    };
    (schemas.SearchRequest as Json).properties = {
      ...((schemas.SearchRequest as Json).properties as Json),
      loop: { $ref: '#/components/schemas/Cycle' },
    };
    expect(scanTenantLeaks(cyclic, forbidden).map((finding) => finding.name)).toContain('tenant_id');
  });
});
