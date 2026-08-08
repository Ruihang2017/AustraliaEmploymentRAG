/**
 * RUNT-07 acceptance item 5 — "One `request_id` joins an app record → a job record → a
 * model-metadata record without any of them carrying question or evidence text" (PRD §42.2).
 */
import { describe, expect, it } from 'vitest';

import { CorrelationConflictError, CorrelationIdError } from '../src/errors.js';
import { currentCorrelation, withCorrelation } from '../src/correlation.js';
import { FIELD_NAMES } from '../src/fields.js';
import { createLogger } from '../src/logger.js';
import { createMemorySink } from '../src/sinks.js';
import { id } from './support/ids.js';

const ENVELOPE = ['ts', 'level', 'event', 'process'];

function records(sink: ReturnType<typeof createMemorySink>): Record<string, unknown>[] {
  return sink.lines().map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('correlation', () => {
  it('joins app → job → model-metadata records on one request_id', () => {
    const sink = createMemorySink();
    const logger = createLogger({ sink, process: 'app', clock: () => 0 });
    const requestId = id('req');
    const jobId = id('job');
    const modelCallId = id('mc');

    withCorrelation({ request_id: requestId }, () => {
      logger.info('request.received', { operation: 'answer' });
      withCorrelation({ job_id: jobId }, () => {
        logger.info('job.leased', { queue_class: 'interactive_research' });
        withCorrelation({ model_call_id: modelCallId }, () => {
          logger.info('model.called', { latency_ms: 42, cost_micro_aud: 1250 });
        });
      });
    });

    const emitted = records(sink);
    expect(emitted).toHaveLength(3);
    for (const record of emitted) expect(record['request_id']).toBe(requestId);
    expect(emitted[0]?.['job_id']).toBeUndefined();
    expect(emitted[1]?.['job_id']).toBe(jobId);
    expect(emitted[2]?.['job_id']).toBe(jobId);
    expect(emitted[2]?.['model_call_id']).toBe(modelCallId);

    // No record carries anything outside the envelope plus the allowlist — so no question, no evidence.
    const permitted = new Set([...ENVELOPE, ...FIELD_NAMES]);
    for (const record of emitted) {
      for (const key of Object.keys(record)) expect(permitted.has(key)).toBe(true);
    }
  });

  it('does not bleed between interleaved async flows', async () => {
    const sink = createMemorySink();
    const logger = createLogger({ sink, process: 'worker', clock: () => 0 });
    const first = id('req');
    const second = id('req');

    // Interleaving is driven by microtask boundaries rather than timers: no dependency on a Node
    // global, and it is the `await` boundary that the store has to survive.
    const flow = (requestId: string, hops: number) =>
      withCorrelation({ request_id: requestId }, async () => {
        for (let hop = 0; hop < hops; hop += 1) {
          await Promise.resolve();
          logger.info('request.received', {});
          expect(currentCorrelation().request_id).toBe(requestId);
        }
      });

    await Promise.all([flow(first, 4), flow(second, 4)]);

    const emitted = records(sink);
    expect(emitted).toHaveLength(8);
    expect(emitted.filter((r) => r['request_id'] === first)).toHaveLength(4);
    expect(emitted.filter((r) => r['request_id'] === second)).toHaveLength(4);
  });

  it('leaves no binding behind after the callback returns', () => {
    expect(currentCorrelation().request_id).toBeUndefined();
    withCorrelation({ request_id: id('req') }, () => undefined);
    expect(currentCorrelation().request_id).toBeUndefined();
  });

  it('returns the callback value unchanged, including a promise', async () => {
    expect(withCorrelation({}, () => 7)).toBe(7);
    await expect(withCorrelation({}, async () => 'x')).resolves.toBe('x');
  });

  it('throws when a bound key is rebound to a different value', () => {
    const outer = id('req');
    withCorrelation({ request_id: outer }, () => {
      expect(() => withCorrelation({ request_id: id('req') }, () => undefined)).toThrow(
        CorrelationConflictError,
      );
      // Rebinding to the SAME value is a no-op, not a conflict.
      expect(withCorrelation({ request_id: outer }, () => currentCorrelation().request_id)).toBe(
        outer,
      );
    });
  });

  it('throws on a malformed correlation id, without echoing it', () => {
    const bad = 'secret-canary-not-an-id';
    try {
      withCorrelation({ request_id: bad }, () => undefined);
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CorrelationIdError);
      expect((error as Error).message).not.toContain(bad);
      expect((error as Error).message).toContain('request_id');
    }
  });

  it('rejects an id of the wrong registered kind for request_id', () => {
    expect(() => withCorrelation({ request_id: id('job') }, () => undefined)).toThrow(
      CorrelationIdError,
    );
  });
});
