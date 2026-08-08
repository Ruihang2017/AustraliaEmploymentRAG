/**
 * FND-05 deliverable 5 / acceptance item 10 — non-additive change detection against a committed
 * baseline (PRD §16.1: *"Webhooks carry their own schema version"*).
 *
 * The baseline lands in the same commit as the schemas it describes, so this is the `v1` publication
 * record. To change it legitimately you either made an additive change (the baseline is regenerated
 * and the diff is additive) or you needed a `v2` directory.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { type Baseline, buildBaseline, compare } from './support/baseline.js';
import { type JsonObject, EVENTS_TEST_DIR, loadAllSchemas, readJson } from './support/load.js';

const BASELINE_PATH = join(EVENTS_TEST_DIR, 'baseline', 'v1.json');
const schemas = loadAllSchemas();
const current = buildBaseline(schemas);
const committed = readJson(BASELINE_PATH) as unknown as Baseline;

/** Regenerates the committed baseline. Run deliberately, never as part of a test. */
export function writeBaseline(): void {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}

function clone(): Baseline {
  return JSON.parse(JSON.stringify(current)) as Baseline;
}

describe('the committed baseline', () => {
  it('describes every schema in the tree, and nothing else', () => {
    expect(Object.keys(committed).sort()).toEqual([...schemas.keys()].sort());
  });

  it('compares clean against the current schemas', () => {
    expect(compare(committed, current)).toEqual([]);
  });

  it('records required lists and property shapes (non-vacuity)', () => {
    const alertCreated = committed['webhook/v1/alert.created.json'];
    expect(alertCreated?.required).toContain('data/change_type');
    expect(alertCreated?.properties['schema_version']?.const).toBe('1.0');
    expect(alertCreated?.properties['data/change_type']?.enum).toHaveLength(8);
  });
});

describe('non-additive changes are reported', () => {
  it('a removed schema', () => {
    const after = clone();
    delete (after as Record<string, unknown>)['sse/v1/heartbeat.json'];
    expect(compare(current, after).join('\n')).toContain('sse/v1/heartbeat.json: schema removed');
  });

  it('a removed property, naming the schema and the property', () => {
    const after = clone();
    const shape = after['webhook/v1/alert.created.json'] as { properties: Record<string, unknown> };
    delete shape.properties['data/effective_date'];
    const problems = compare(current, after);
    expect(problems.join('\n')).toContain('webhook/v1/alert.created.json');
    expect(problems.join('\n')).toContain('"data/effective_date" was removed or renamed');
  });

  it('a renamed property (a removal plus an addition)', () => {
    const after = clone();
    const shape = after['sse/v1/stage.changed.json'] as {
      required: string[];
      properties: Record<string, unknown>;
    };
    shape.properties['stage_name'] = shape.properties['stage'];
    delete shape.properties['stage'];
    shape.required = shape.required.map((name) => (name === 'stage' ? 'stage_name' : name));
    const problems = compare(current, after).join('\n');
    expect(problems).toContain('"stage" was removed or renamed');
    expect(problems).toContain('new property "stage_name" is required');
  });

  it('a property that stops being required', () => {
    const after = clone();
    const shape = after['sse/v1/heartbeat.json'] as { required: string[] };
    shape.required = shape.required.filter((name) => name !== 'job_id');
    expect(compare(current, after).join('\n')).toContain('"job_id" was required and is now optional');
  });

  it('a changed type, a changed const and a dropped enum member', () => {
    const after = clone();
    const alertCreated = after['webhook/v1/alert.created.json'] as {
      properties: Record<string, { type?: string; const?: unknown; enum?: unknown[] }>;
    };
    (alertCreated.properties['sandbox'] as { type?: string }).type = 'string';
    (alertCreated.properties['schema_version'] as { const?: unknown }).const = '1.1';
    const changeType = alertCreated.properties['data/change_type'] as { enum?: unknown[] };
    changeType.enum = (changeType.enum ?? []).filter((member) => member !== 'FRESHNESS');
    const problems = compare(current, after).join('\n');
    expect(problems).toContain('"sandbox" changed type');
    expect(problems).toContain('"schema_version" changed its const value');
    expect(problems).toContain('dropped enum member "FRESHNESS"');
  });

  it('a new REQUIRED property', () => {
    const after = clone();
    const shape = after['sse/v1/heartbeat.json'] as {
      required: string[];
      properties: Record<string, unknown>;
    };
    shape.properties['sequence'] = { type: 'integer' };
    shape.required = [...shape.required, 'sequence'].sort();
    expect(compare(current, after).join('\n')).toContain('new property "sequence" is required');
  });
});

describe('additive changes are allowed', () => {
  it('a new optional property', () => {
    const after = clone();
    const shape = after['sse/v1/heartbeat.json'] as { properties: Record<string, unknown> };
    shape.properties['sequence'] = { type: 'integer' };
    expect(compare(current, after)).toEqual([]);
  });

  it('a new enum member', () => {
    const after = clone();
    const changeType = (
      after['webhook/v1/alert.created.json'] as {
        properties: Record<string, { enum?: unknown[] }>;
      }
    ).properties['data/change_type'] as { enum: unknown[] };
    changeType.enum = [...changeType.enum, 'REPEAL'];
    expect(compare(current, after)).toEqual([]);
  });

  it('a new schema file', () => {
    const after = clone() as Record<string, unknown>;
    after['webhook/v1/alert.updated.json'] = JSON.parse(
      JSON.stringify(current['webhook/v1/alert.created.json']),
    ) as JsonObject;
    expect(compare(current, after as unknown as Baseline)).toEqual([]);
  });
});
