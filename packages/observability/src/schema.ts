/**
 * The cross-language field contract — RUNT-07 Deliverable 10, built here and committed as
 * `schema/log-record.schema.json`.
 *
 * WHY IT EXISTS. `services/search-rs` is Rust (`11-retrieval-engine`) and cannot import this
 * package, but PRD §22 bullet 1 requires app, worker AND search to emit records that join on the
 * same correlation ids. The schema is the executable form of that contract.
 *
 * WHY IT IS BUILT IN CODE. `buildLogRecordSchema()` derives every property from `FIELD_SPECS`, and
 * `test/schema.test.ts` asserts the committed JSON deep-equals it. The file therefore cannot drift
 * from the allowlist without a red test — and no root `generate` script is needed, which matters
 * because `pnpm generate` is owned by `00-foundation`/`FND-04` and this ticket may not change it.
 */
import { ERROR_CODE_VALUES, UUID_V7_PATTERN } from './contracts.js';
import {
  FIELD_NAMES,
  FIELD_SPECS,
  HASH_PATTERN,
  MAX_ID_LENGTH,
  MAX_VERSION_LENGTH,
  VERSION_PATTERN,
} from './fields.js';
import { EVENT_CODES, PROCESS_ROLES } from './vocabulary.js';

/** Bumped when the record shape changes in a way the Rust emitter must follow (PRD §16.1 spirit). */
export const LOG_RECORD_SCHEMA_VERSION = '1.0.0';

export const LOG_RECORD_SCHEMA_ID = `https://taxrag.example/schemas/observability/log-record/${LOG_RECORD_SCHEMA_VERSION}.json`;

/** The four logger-produced envelope keys. A record without all four is not a record. */
export const ENVELOPE_KEYS = Object.freeze(['ts', 'level', 'event', 'process'] as const);

/** The `level` domain, mirroring `LogLevel` in src/logger.ts. */
export const LOG_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error'] as const);

/** The uuid body, without `RegExp` anchors, for embedding in a JSON Schema `pattern`. */
const uuidBody = UUID_V7_PATTERN.source.replace(/^\^/, '').replace(/\$$/, '');

/** A JSON Schema value. Deliberately a plain data type — nothing here is executable. */
export type SchemaValue = string | number | boolean | readonly SchemaValue[] | SchemaNode;

/** A JSON Schema fragment. */
export type SchemaNode = { readonly [key: string]: SchemaValue };

function nodeFor(name: (typeof FIELD_NAMES)[number]): SchemaNode {
  const spec = FIELD_SPECS[name];
  switch (spec.kind) {
    case 'opaque_id': {
      const prefix = spec.prefix === null ? '[a-z]{2,8}' : spec.prefix;
      return {
        type: 'string',
        pattern: `^${prefix}_${uuidBody}$`,
        maxLength: MAX_ID_LENGTH,
        description: spec.basis,
      };
    }
    case 'code':
      return { type: 'string', enum: [...spec.vocabulary], description: spec.basis };
    case 'error_code':
      return { type: 'string', enum: [...ERROR_CODE_VALUES], description: spec.basis };
    case 'count':
    case 'duration_ms':
      return { type: 'integer', minimum: 0, description: spec.basis };
    case 'micro_aud':
      return { type: 'integer', description: spec.basis };
    case 'version':
      return {
        type: 'string',
        pattern: VERSION_PATTERN.source,
        maxLength: MAX_VERSION_LENGTH,
        description: spec.basis,
      };
    case 'hash':
      return {
        type: 'string',
        pattern: HASH_PATTERN.source,
        maxLength: 64,
        description: spec.basis,
      };
    case 'bool':
      return { type: 'boolean', description: spec.basis };
  }
}

/** Builds the schema from the allowlist. Pure: same input constants, same object, every time. */
export function buildLogRecordSchema(): SchemaNode {
  const properties: Record<string, SchemaNode> = {
    ts: {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$',
      maxLength: 24,
      description: 'ISO-8601 UTC timestamp from the injected clock.',
    },
    level: { type: 'string', enum: [...LOG_LEVELS], description: 'Severity.' },
    process: {
      type: 'string',
      enum: [...PROCESS_ROLES],
      description: 'Emitting runtime process (PRD §39.1).',
    },
  };
  for (const name of FIELD_NAMES) properties[name] = nodeFor(name);
  // `event` is both an envelope key and an allowlisted field; the allowlist's node is authoritative.
  properties['event'] = {
    type: 'string',
    enum: [...EVENT_CODES],
    description: FIELD_SPECS['event'].basis,
  };

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: LOG_RECORD_SCHEMA_ID,
    title: 'taxrag bounded operational log record',
    description:
      'PRD §22 bullet 1: app, worker and search emit bounded JSON operational logs with ' +
      'request/job/retrieval/model/answer correlations. Consumed by services/search-rs ' +
      '(11-retrieval-engine), which emits conforming records without importing @taxrag/observability. ' +
      'No property admits free text: every string property is an opaque id, a closed-vocabulary code, ' +
      'a bounded version token or a hex digest.',
    'x-generated-from': 'packages/observability/src/fields.ts',
    'x-schema-version': LOG_RECORD_SCHEMA_VERSION,
    type: 'object',
    additionalProperties: false,
    required: [...ENVELOPE_KEYS],
    properties,
  };
}
