/**
 * RUNT-07 acceptance item 1 — "Only allowlisted fields are emitted: an unknown key is dropped, not
 * stringified, and increments `observability_dropped_fields_total` labelled by key name with no
 * value (PRD §22 bullets 2-3)."
 */
import { describe, expect, it } from 'vitest';

import { FIELD_NAMES, isFieldName, isValidFieldValue } from '../src/fields.js';
import type { LogFields } from '../src/fields.js';
import { createLogger, TRUNCATION_MARKER } from '../src/logger.js';
import { createDefaultRegistry } from '../src/metrics.js';
import { createMemorySink } from '../src/sinks.js';
import { id } from './support/ids.js';

const CLOCK = () => Date.parse('2026-08-07T03:04:05.678Z');

function harness(options: { maxValueLength?: number } = {}) {
  const sink = createMemorySink();
  const registry = createDefaultRegistry();
  const logger = createLogger({
    sink,
    process: 'app',
    clock: CLOCK,
    metrics: registry,
    ...(options.maxValueLength !== undefined ? { maxValueLength: options.maxValueLength } : {}),
  });
  return { sink, registry, logger };
}

/** The counter's total across every label combination. */
function droppedTotal(registry: ReturnType<typeof createDefaultRegistry>): number {
  return registry
    .snapshot()
    .filter((sample) => sample.name === 'observability_dropped_fields_total')
    .reduce((sum, sample) => sum + sample.value, 0);
}

describe('the field allowlist', () => {
  it('emits only allowlisted fields and drops five unknown keys, counting each', () => {
    const { sink, registry, logger } = harness();
    const requestId = id('req');

    logger.info('request.completed', {
      request_id: requestId,
      message: 'the taxpayer asked about div 7a loans',
      extra: { nested: 'evidence text' },
      payload: ['provider', 'response'],
      meta: 'assertion',
      stack: 'Error: boom\n    at x',
    } as unknown as LogFields);

    const lines = sink.lines();
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0] as string) as Record<string, unknown>;

    expect(Object.keys(record).sort()).toEqual(
      ['event', 'level', 'process', 'request_id', 'ts'].sort(),
    );
    expect(record['request_id']).toBe(requestId);
    expect(record['ts']).toBe('2026-08-07T03:04:05.678Z');
    expect(record['process']).toBe('app');

    expect(droppedTotal(registry)).toBe(5);
  });

  it('never renders a dropped value anywhere in the metric snapshot', () => {
    const { registry, logger } = harness();
    const research = 'CANARY-RESEARCH-BODY-4a9f';
    const keyThatIsItselfContent = `key-${research}`;

    logger.info('request.completed', {
      message: research,
      [keyThatIsItselfContent]: research,
    } as unknown as LogFields);

    const serialised = JSON.stringify(registry.snapshot());
    expect(serialised).not.toContain(research);
    // The caller-controlled key collapses onto the closed domain, never the raw name.
    expect(serialised).toContain('"key":"__other__"');
    expect(serialised).toContain('"key":"message"');
    expect(serialised).toContain('"reason":"unknown_key"');
  });

  it('drops an allowlisted key whose value fails its kind, counting reason=invalid_value', () => {
    const { sink, registry, logger } = harness();

    logger.info('request.completed', {
      request_id: 'not-an-opaque-id',
      latency_ms: 1.5,
      cost_micro_aud: 0.001,
      status: 'made_up',
    } as unknown as LogFields);

    const record = JSON.parse(sink.lines()[0] as string) as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual(['event', 'level', 'process', 'ts']);

    const invalid = registry
      .snapshot()
      .filter(
        (sample) =>
          sample.name === 'observability_dropped_fields_total' &&
          sample.labels['reason'] === 'invalid_value',
      )
      .reduce((sum, sample) => sum + sample.value, 0);
    expect(invalid).toBe(4);
  });

  it('keeps a job_id from a different resource kind out of request_id', () => {
    const { sink, logger } = harness();
    logger.info('job.leased', { request_id: id('job') } as unknown as LogFields);
    const record = JSON.parse(sink.lines()[0] as string) as Record<string, unknown>;
    expect(record['request_id']).toBeUndefined();
  });

  it('truncates an over-long string value on a code-point boundary and counts it', () => {
    const { sink, registry, logger } = harness({ maxValueLength: 12 });
    logger.info('request.completed', { request_id: id('req') });

    const record = JSON.parse(sink.lines()[0] as string) as Record<string, string>;
    expect(record['request_id']).toHaveLength(12 + TRUNCATION_MARKER.length);
    expect(record['request_id']).toContain(TRUNCATION_MARKER);

    const truncated = registry
      .snapshot()
      .filter((sample) => sample.name === 'observability_truncated_fields_total');
    expect(truncated).toHaveLength(1);
    expect(truncated[0]?.labels['key']).toBe('request_id');
    expect(truncated[0]?.value).toBe(1);
  });

  it('replaces an oversized record rather than emitting a truncated JSON fragment', () => {
    const sink = createMemorySink();
    const registry = createDefaultRegistry();
    const logger = createLogger({
      sink,
      process: 'app',
      clock: CLOCK,
      metrics: registry,
      maxRecordBytes: 60,
    });

    logger.info('request.completed', { request_id: id('req'), latency_ms: 12 });

    const record = JSON.parse(sink.lines()[0] as string) as Record<string, unknown>;
    expect(record['event']).toBe('observability.record_oversized');
    expect(record['request_id']).toBeUndefined();
    expect(
      registry.snapshot().find((s) => s.name === 'observability_record_oversized_total')?.value,
    ).toBe(1);
  });

  it('ignores symbol keys and prototype entries entirely', () => {
    const { sink, logger } = harness();
    const hostile = Object.create({ request_id: id('req') }) as Record<string, unknown>;
    hostile[Symbol('latency_ms') as unknown as string] = 5;
    logger.info('request.completed', hostile as unknown as LogFields);

    const record = JSON.parse(sink.lines()[0] as string) as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual(['event', 'level', 'process', 'ts']);
  });

  it('never invokes a hostile toJSON or getter on the caller object', () => {
    const { sink, logger } = harness();
    let invoked = 0;
    const hostile = {
      get latency_ms(): number {
        invoked += 1;
        return 7;
      },
      toJSON(): string {
        invoked += 1000;
        return 'the whole research body';
      },
    };
    logger.info('request.completed', hostile as unknown as LogFields);

    const line = sink.lines()[0] as string;
    expect(line).not.toContain('research body');
    // The getter is read once during the allowlist walk; toJSON is never reached.
    expect(invoked).toBe(1);
  });

  it('keeps LogFields and FIELD_NAMES from drifting apart', () => {
    const sample: Required<LogFields> = {
      request_id: '',
      job_id: '',
      retrieval_id: '',
      model_call_id: '',
      answer_snapshot_id: '',
      organization_id: '',
      actor_kind: 'user',
      release_id: '',
      schema_version: '',
      corpus_release_id: '',
      event: 'request.received',
      operation: 'search',
      status: 'ok',
      error_code: 'INTERNAL_ERROR',
      queue_class: 'exports',
      latency_ms: 0,
      cost_micro_aud: 0,
      attempt: 0,
      count: 0,
      degraded: false,
      artifact_sha256: '',
    };
    expect(Object.keys(sample).sort()).toEqual([...FIELD_NAMES].sort());
    for (const name of Object.keys(sample)) expect(isFieldName(name)).toBe(true);
  });

  it('rejects prototype-pollution key names as unknown', () => {
    for (const key of ['__proto__', 'constructor', 'prototype', 'toString']) {
      expect(isFieldName(key)).toBe(false);
    }
  });

  it('validates numeric kinds strictly', () => {
    expect(isValidFieldValue('latency_ms', 0)).toBe(true);
    expect(isValidFieldValue('latency_ms', -1)).toBe(false);
    expect(isValidFieldValue('latency_ms', 1.5)).toBe(false);
    expect(isValidFieldValue('cost_micro_aud', -250)).toBe(true);
    expect(isValidFieldValue('cost_micro_aud', 2 ** 53)).toBe(false);
    expect(isValidFieldValue('cost_micro_aud', Number.NaN)).toBe(false);
    expect(isValidFieldValue('artifact_sha256', 'a'.repeat(64))).toBe(true);
    expect(isValidFieldValue('artifact_sha256', 'A'.repeat(64))).toBe(false);
    expect(isValidFieldValue('release_id', '2026.08.07+1')).toBe(true);
    expect(isValidFieldValue('release_id', 'a release with spaces')).toBe(false);
    expect(isValidFieldValue('degraded', 'true')).toBe(false);
  });
});
