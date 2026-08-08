/**
 * RUNT-07 acceptance item 11 — "`schema/log-record.schema.json` validates a record emitted by the
 * TypeScript logger, so the Rust search process has an executable contract to conform to"
 * (PRD §22 bullet 1).
 *
 * The committed JSON is asserted to deep-equal `buildLogRecordSchema()`, so it cannot drift from
 * `src/fields.ts` without a red test.
 */
import { describe, expect, it } from 'vitest';

import { withCorrelation } from '../src/correlation.js';
import type { LogFields } from '../src/fields.js';
import { createLogger } from '../src/logger.js';
import { LOG_RECORD_SCHEMA_ID, buildLogRecordSchema } from '../src/schema.js';
import { createMemorySink } from '../src/sinks.js';
import { id } from './support/ids.js';
import { readPackageFile } from './support/paths.js';
import { assertSupportedKeywords, validate } from './support/validate-json-schema.js';

const committed = JSON.parse(readPackageFile('schema', 'log-record.schema.json')) as Record<
  string,
  unknown
>;

function emitOne(fields: Record<string, unknown>, requestId: string): Record<string, unknown> {
  const sink = createMemorySink();
  const logger = createLogger({
    sink,
    process: 'search',
    clock: () => Date.parse('2026-08-07T03:04:05.678Z'),
  });
  withCorrelation({ request_id: requestId }, () => {
    logger.info('retrieval.executed', fields as LogFields);
  });
  return JSON.parse(sink.lines()[0] as string) as Record<string, unknown>;
}

describe('the mini JSON Schema validator', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['a'],
    properties: {
      a: { type: 'string', pattern: '^x+$', maxLength: 3 },
      b: { type: 'integer', minimum: 0 },
      c: { type: 'string', enum: ['one', 'two'] },
    },
  };

  it('accepts a valid document (positive control)', () => {
    expect(validate(schema, { a: 'xx', b: 0, c: 'one' })).toEqual([]);
  });

  it('rejects each violation it claims to implement (negative controls)', () => {
    expect(validate(schema, {})).toHaveLength(1);
    expect(validate(schema, { a: 'xx', d: 1 })).toHaveLength(1);
    expect(validate(schema, { a: 'yy' })).toHaveLength(1);
    expect(validate(schema, { a: 'xxxx' })).toHaveLength(1);
    expect(validate(schema, { a: 'xx', b: -1 })).toHaveLength(1);
    expect(validate(schema, { a: 'xx', b: 1.5 })).toHaveLength(1);
    expect(validate(schema, { a: 'xx', c: 'three' })).toHaveLength(1);
  });

  it('refuses a keyword it does not implement, rather than ignoring it', () => {
    expect(() => assertSupportedKeywords({ oneOf: [] })).toThrow(/oneOf/);
  });
});

describe('schema/log-record.schema.json', () => {
  it('deep-equals the schema derived from the allowlist', () => {
    expect(committed).toEqual(buildLogRecordSchema());
  });

  it('is draft 2020-12, versioned, closed and rooted in the allowlist', () => {
    expect(committed['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(committed['$id']).toBe(LOG_RECORD_SCHEMA_ID);
    expect(committed['additionalProperties']).toBe(false);
    expect(committed['required']).toEqual(['ts', 'level', 'event', 'process']);
    expect(committed['x-generated-from']).toBe('packages/observability/src/fields.ts');
    assertSupportedKeywords(committed);
  });

  it('validates a record the TypeScript logger actually emitted', () => {
    const record = emitOne(
      {
        retrieval_id: id('srx'),
        latency_ms: 12,
        cost_micro_aud: -4200,
        status: 'ok',
        operation: 'search',
        count: 0,
        release_id: '2026.08.07+1',
        artifact_sha256: 'a'.repeat(64),
        degraded: false,
      },
      id('req'),
    );
    expect(validate(committed, record)).toEqual([]);
  });

  it('rejects records the contract forbids (negative controls)', () => {
    const valid = emitOne({ latency_ms: 1 }, id('req'));

    expect(validate(committed, { ...valid, question: 'what is div 7a?' })).not.toEqual([]);
    expect(validate(committed, { ...valid, cost_micro_aud: 1.5 })).not.toEqual([]);
    expect(validate(committed, { ...valid, request_id: 'req_not-a-uuid' })).not.toEqual([]);
    expect(validate(committed, { ...valid, release_id: 'x'.repeat(200) })).not.toEqual([]);
    expect(validate(committed, { ...valid, status: 'made_up' })).not.toEqual([]);
    expect(validate(committed, { ...valid, latency_ms: -1 })).not.toEqual([]);
    expect(validate(committed, { ...valid, event: 'anything.at.all' })).not.toEqual([]);

    const withoutEnvelope = { ...valid } as Record<string, unknown>;
    delete withoutEnvelope['process'];
    expect(validate(committed, withoutEnvelope)).not.toEqual([]);
  });

  it('gives every declared property a bounded grammar — no free-text string anywhere', () => {
    const properties = committed['properties'] as Record<string, Record<string, unknown>>;
    for (const [name, node] of Object.entries(properties)) {
      if (node['type'] !== 'string') continue;
      const bounded = node['enum'] !== undefined || node['pattern'] !== undefined;
      expect(bounded, `property ${name} admits free text`).toBe(true);
    }
  });
});
