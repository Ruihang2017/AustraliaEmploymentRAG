/**
 * FND-05 — the schema-side acceptance items: JSON Schema 2020-12 validity, `additionalProperties`,
 * registry/file-tree bijection in both directions, SSE completeness against PRD §34.4, the
 * `change_type` enum against FND-03, `schema_version` on every envelope, and id patterns that agree
 * with the real minter.
 *
 * Every checker here has a positive control: a checker that cannot fail discharges nothing.
 */
import { describe, expect, it } from 'vitest';

import { CHANGE_TYPE_VALUES } from '../../src/enums/change-type.js';
import { SSE_EVENT_TYPE_VALUES } from '../../src/enums/sse-event-type.js';
import { newId } from '../../src/ids/index.js';
import {
  type JsonObject,
  type JsonValue,
  loadAllSchemas,
  loadRegistry,
  loadSchema,
  schemaFilePaths,
} from './support/load.js';
import { SUPPORTED_KEYWORDS, collectKeywords, unsupportedKeywords, validate } from './support/validator.js';

const registry = loadRegistry();
const schemas = loadAllSchemas();
const envelope = loadSchema(registry.webhook.envelope.schema);

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every object subschema that declares `properties`, with its pointer. */
function objectSubschemas(schema: JsonObject): Array<[string, JsonObject]> {
  const found: Array<[string, JsonObject]> = [];
  const walk = (node: JsonValue, pointer: string): void => {
    if (!isObject(node)) return;
    if (isObject(node['properties'])) {
      found.push([pointer, node]);
      for (const [name, child] of Object.entries(node['properties'])) {
        walk(child, `${pointer}/properties/${name}`);
      }
    }
    if (isObject(node['items'])) walk(node['items'], `${pointer}/items`);
  };
  walk(schema, '#');
  return found;
}

describe('the schema corpus is non-empty and walked', () => {
  it('finds one registry, one envelope, one webhook type and nine SSE types', () => {
    expect(schemas.size).toBe(11);
    expect(schemaFilePaths()).toContain('webhook/v1/envelope.json');
    expect(schemaFilePaths()).not.toContain('registry.json');
  });
});

describe('JSON Schema 2020-12 validity (acceptance item 8)', () => {
  it.each([...schemas.keys()])('%s declares the 2020-12 dialect, a URN $id and a title', (path) => {
    const schema = schemas.get(path) as JsonObject;
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(String(schema['$id'])).toMatch(/^urn:taxrag:events:(webhook|sse):v1:[a-z.]+$/);
    expect(typeof schema['title']).toBe('string');
    expect(typeof schema['description']).toBe('string');
    expect(schema['type']).toBe('object');
  });

  it.each([...schemas.keys()])(
    '%s sets additionalProperties:false on every object subschema, with a required list of real properties',
    (path) => {
      const schema = schemas.get(path) as JsonObject;
      const subschemas = objectSubschemas(schema);
      expect(subschemas.length).toBeGreaterThan(0);
      for (const [pointer, node] of subschemas) {
        expect(node['additionalProperties'], `${path} ${pointer}`).toBe(false);
        const required = Array.isArray(node['required']) ? node['required'] : [];
        expect(required.length, `${path} ${pointer} has no required list`).toBeGreaterThan(0);
        const properties = node['properties'] as JsonObject;
        for (const name of required) {
          expect(Object.keys(properties), `${path} ${pointer}`).toContain(name);
        }
      }
    },
  );

  it('uses only keywords the validator implements — the subset is closed over the corpus', () => {
    for (const [path, schema] of schemas) {
      expect(unsupportedKeywords(schema), `${path} uses an unimplemented keyword`).toEqual([]);
    }
    // Non-vacuity: the walk really does see nested keywords.
    expect(collectKeywords(schemas.get('webhook/v1/alert.created.json') as JsonObject)).toContain(
      'minItems',
    );
    expect(Object.keys(SUPPORTED_KEYWORDS)).toContain('additionalProperties');
  });

  it('reports an unimplemented keyword when one is present (positive control)', () => {
    expect(unsupportedKeywords({ type: 'object', allOf: [] } as unknown as JsonObject)).toEqual([
      'allOf',
    ]);
    expect(
      unsupportedKeywords({
        type: 'object',
        properties: { a: { type: 'string', format: 'email' } },
      } as unknown as JsonObject),
    ).toEqual(['format']);
  });
});

describe('the validator itself fails when it should (positive controls)', () => {
  const schema = loadSchema('sse/v1/job.started.json');
  const valid = {
    schema_version: '1.0',
    job_id: newId('job'),
    occurred_at: '2026-08-03T03:00:09Z',
  };

  it('accepts a valid instance', () => {
    expect(validate(schema, valid)).toEqual([]);
  });

  it('rejects an extra property, a wrong const, a bad pattern and a missing required member', () => {
    expect(validate(schema, { ...valid, sneaky: 1 }).join()).toContain('is not allowed');
    expect(validate(schema, { ...valid, schema_version: '2.0' }).join()).toContain('const');
    expect(validate(schema, { ...valid, job_id: 'job_not-a-uuid' }).join()).toContain('does not match');
    const missing: Record<string, unknown> = { ...valid };
    delete missing['occurred_at'];
    expect(validate(schema, missing as never).join()).toContain(
      'required property "occurred_at" is missing',
    );
  });
});

describe('registry <-> file tree bijection (acceptance item 8)', () => {
  const registryPaths = [
    registry.webhook.envelope.schema,
    ...Object.values(registry.webhook.types).map((entry) => entry.schema),
    ...Object.values(registry.sse.types).map((entry) => entry.schema),
  ].sort();

  it('registers every schema file on disk', () => {
    expect(schemaFilePaths().sort()).toEqual(registryPaths);
  });

  it('gives every registry entry a file whose $id matches its key', () => {
    for (const [type, entry] of Object.entries(registry.webhook.types)) {
      expect(loadSchema(entry.schema)['$id']).toBe(`urn:taxrag:events:webhook:v1:${type}`);
      expect(entry.version).toBe('v1');
      expect(entry.schema_version).toBe('1.0');
    }
    for (const [type, entry] of Object.entries(registry.sse.types)) {
      expect(loadSchema(entry.schema)['$id']).toBe(`urn:taxrag:events:sse:v1:${type}`);
      expect(entry.version).toBe('v1');
      expect(entry.schema_version).toBe('1.0');
    }
  });

  it('catches both directions (positive control)', () => {
    const onDisk = schemaFilePaths().sort();
    expect([...onDisk, 'sse/v1/rogue.json'].sort()).not.toEqual(registryPaths);
    expect(onDisk.slice(1)).not.toEqual(registryPaths);
  });
});

describe('SSE completeness against PRD §34.4 (acceptance item 7)', () => {
  it('has exactly one schema per allowed type and no tenth', () => {
    expect(Object.keys(registry.sse.types).sort()).toEqual([...SSE_EVENT_TYPE_VALUES].sort());
    expect(schemaFilePaths().filter((path) => path.startsWith('sse/'))).toHaveLength(
      SSE_EVENT_TYPE_VALUES.length,
    );
  });

  it('requires schema_version, job_id and occurred_at on every SSE payload', () => {
    for (const entry of Object.values(registry.sse.types)) {
      const schema = loadSchema(entry.schema);
      const required = schema['required'] as string[];
      expect(required, entry.schema).toEqual(expect.arrayContaining(['schema_version', 'job_id', 'occurred_at']));
      const properties = schema['properties'] as JsonObject;
      expect((properties['schema_version'] as JsonObject)['const']).toBe('1.0');
    }
  });
});

describe('envelope rules (acceptance items 8 and 9)', () => {
  const perType = Object.values(registry.webhook.types).map((entry) => entry.schema);

  it('requires schema_version, and a payload missing it fails validation', () => {
    for (const path of ['webhook/v1/envelope.json', ...perType]) {
      const schema = loadSchema(path);
      expect(schema['required']).toContain('schema_version');
    }
    const alertCreated = loadSchema('webhook/v1/alert.created.json');
    const body = {
      id: newId('evt'),
      type: 'alert.created',
      created_at: '2026-08-03T03:00:12Z',
      sandbox: false,
      data: {
        alert_id: newId('alt'),
        watchlist_id: newId('wat'),
        change_type: 'COMMENCEMENT',
        effective_date: '2026-09-01',
        affected_research_record_ids: [],
      },
    };
    expect(validate(alertCreated, body).join()).toContain('required property "schema_version" is missing');
    expect(validate(alertCreated, { schema_version: '1.0', ...body })).toEqual([]);
  });

  it('keeps every per-type schema deep-equal to the envelope on the envelope members', () => {
    const envelopeProperties = envelope['properties'] as JsonObject;
    for (const path of perType) {
      const properties = loadSchema(path)['properties'] as JsonObject;
      expect(Object.keys(properties), path).toEqual(Object.keys(envelopeProperties));
      for (const name of Object.keys(envelopeProperties)) {
        // `type` is narrowed to a const and `data` is typed per event — everything else must match.
        if (name === 'type' || name === 'data') continue;
        expect(properties[name], `${path} drifted from the envelope on "${name}"`).toEqual(
          envelopeProperties[name],
        );
      }
      expect(loadSchema(path)['required']).toEqual(envelope['required']);
    }
  });

  it('lists exactly the registered webhook types in the envelope `type` enum', () => {
    const envelopeProperties = envelope['properties'] as JsonObject;
    expect((envelopeProperties['type'] as JsonObject)['enum']).toEqual(
      Object.keys(registry.webhook.types),
    );
  });
});

describe('vocabulary imported from FND-03, never re-transcribed', () => {
  it('matches CHANGE_TYPE_VALUES exactly', () => {
    const data = (loadSchema('webhook/v1/alert.created.json')['properties'] as JsonObject)['data'] as JsonObject;
    const changeType = (data['properties'] as JsonObject)['change_type'] as JsonObject;
    expect(changeType['enum']).toEqual([...CHANGE_TYPE_VALUES]);
  });
});

describe('id patterns agree with the real minter (acceptance item 10)', () => {
  const cases: Array<[string, JsonObject, 'evt' | 'alt' | 'wat' | 'rec' | 'job' | 'ans']> = [];
  const collect = (path: string): void => {
    const schema = loadSchema(path);
    const walk = (node: JsonValue): void => {
      if (!isObject(node)) return;
      const pattern = node['pattern'];
      if (typeof pattern === 'string') {
        const match = /^\^(evt|alt|wat|rec|job|ans)_/.exec(pattern);
        if (match) cases.push([path, node, match[1] as 'evt']);
      }
      if (isObject(node['properties'])) for (const child of Object.values(node['properties'])) walk(child);
      if (isObject(node['items'])) walk(node['items']);
    };
    walk(schema);
  };
  for (const path of schemas.keys()) collect(path);

  it('found id-shaped properties to check (non-vacuity)', () => {
    expect(cases.length).toBeGreaterThanOrEqual(6);
    expect(new Set(cases.map(([, , kind]) => kind)).size).toBe(6);
  });

  it('accepts a freshly minted id of its kind and rejects every other kind', () => {
    for (const [path, node, kind] of cases) {
      expect(validate(node, newId(kind)), `${path} rejected a real ${kind} id`).toEqual([]);
      for (const other of ['evt', 'alt', 'wat', 'rec', 'job', 'ans'] as const) {
        if (other === kind) continue;
        expect(validate(node, newId(other)).length, `${path} accepted a ${other} id`).toBeGreaterThan(0);
      }
    }
  });
});
