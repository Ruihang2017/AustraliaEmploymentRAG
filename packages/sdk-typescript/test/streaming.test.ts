/**
 * Streaming, resume and provisional content (ticket deliverable 7; PRD §34.4, `ANS-003`,
 * `UAT-ANS-06` client half, sub-PRD **D6**).
 *
 * Every frame is replayed from a committed transcript through the offline transport, and every
 * payload is validated against its own `schemas/events/sse/v1/*.json` file — so a schema change
 * breaks this suite rather than leaving a replay that proves nothing.
 */
import { describe, expect, it } from 'vitest';

import { SSE_EVENT_TYPES, assertNotProvisional, createStreamAccumulator } from '../src/sdk.js';
import { AerStreamError, AerValidationError } from '../src/errors.js';
import { SseParser, parseBlock } from '../src/sse/parser.js';
import { toStreamEvent } from '../src/sse/events.js';
import { fixtureText, sseSchema } from './support/repo.js';
import type { JsonObject, JsonValue } from './support/repo.js';
import { SUPPORTED_KEYWORDS, unsupportedKeywords, validate } from './support/validator.js';
import { collect, createHarness } from './support/client.js';
import { routed } from './support/transport.js';
import type { Responder } from './support/transport.js';
import { JOB_ID } from './fixtures/typed.js';

const EVENTS = /\/answer-jobs\/[^/]+\/events$/;

const sse = (name: string, chunkSize = 17): Responder =>
  routed([[EVENTS, () => ({ status: 200, sse: fixtureText(`sse/${name}`), chunkSize })]]);

const validateAgainstSchema = (type: string, payload: JsonValue): string[] =>
  validate(sseSchema(type) as JsonObject, payload);

describe('SSE replay (PRD §34.4)', () => {
  it('uses only JSON Schema keywords this suite’s validator implements', () => {
    for (const type of SSE_EVENT_TYPES) {
      expect(unsupportedKeywords(sseSchema(type) as JsonObject), `${type} uses an unimplemented keyword`).toEqual(
        [],
      );
    }
    expect(SUPPORTED_KEYWORDS.length).toBeGreaterThan(10);
  });

  it('detects a violation, so schema validation here is not vacuous', () => {
    expect(validateAgainstSchema('job.completed', { schema_version: '2.0' } as JsonValue).length).toBeGreaterThan(
      0,
    );
    expect(
      validateAgainstSchema('stage.changed', {
        schema_version: '1.0',
        job_id: JOB_ID,
        stage: 'VALIDATING_CITATIONS',
        message: 'Validating citations',
        occurred_at: '2026-08-03T03:00:02Z',
      } as JsonValue),
    ).toEqual([]);
  });

  it('yields the recorded frames in order, each valid against its schema', async () => {
    const harness = createHarness(sse('full.txt'));
    const events = await collect(harness.client.answerJobs.stream(JOB_ID));
    expect(events.map((e) => e.type)).toEqual([
      'job.started',
      'stage.changed',
      'clarification.required',
      'answer.section',
      'citation.added',
      'heartbeat',
      'job.completed',
    ]);
    for (const event of events) {
      expect(validateAgainstSchema(event.type, event.data as unknown as JsonValue), event.type).toEqual([]);
    }
  });

  it('covers all nine PRD §34.4 public types across the committed transcripts', async () => {
    const seen = new Set<string>();
    for (const name of ['full.txt', 'failed.txt', 'cancelled.txt']) {
      const harness = createHarness(sse(name));
      for (const event of await collect(harness.client.answerJobs.stream(JOB_ID))) seen.add(event.type);
    }
    expect([...seen].sort()).toEqual([...SSE_EVENT_TYPES].sort());
  });

  it('rejects an unknown tenth event type', async () => {
    const harness = createHarness(sse('unknown-type.txt'));
    await expect(collect(harness.client.answerJobs.stream(JOB_ID))).rejects.toBeInstanceOf(AerStreamError);
  });

  it('resumes with Last-Event-ID and delivers nothing twice', async () => {
    let connection = 0;
    const harness = createHarness(
      routed([
        [
          EVENTS,
          () => {
            connection += 1;
            // The first connection is cut after event 5; the second replays from 4, overlapping by two.
            return {
              status: 200,
              sse: fixtureText(connection === 1 ? 'sse/cut.txt' : 'sse/resume.txt'),
              chunkSize: 23,
            };
          },
        ],
      ]),
    );

    const events = await collect(harness.client.answerJobs.stream(JOB_ID));
    expect(events.map((e) => e.id)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(harness.transport.requests).toHaveLength(2);
    // The resume carried the highest id actually YIELDED, not the highest parsed.
    expect(harness.transport.headerValues('last-event-id')).toEqual([undefined, '5']);
    // No section and no completion twice.
    expect(events.filter((e) => e.type === 'answer.section')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'job.completed')).toHaveLength(1);
  });

  it('starts from a caller-supplied lastEventId and drops everything at or below it', async () => {
    const harness = createHarness(sse('resume.txt'));
    const events = await collect(harness.client.answerJobs.stream(JOB_ID, { lastEventId: '5' }));
    expect(events.map((e) => e.id)).toEqual(['6', '7']);
    expect(harness.transport.headerValues('last-event-id')).toEqual(['5']);
  });

  // Sub-PRD D6.
  it('discards provisional sections after job.failed and refuses to call them validated', async () => {
    const harness = createHarness(sse('failed.txt'));
    const accumulator = createStreamAccumulator();
    const events = await collect(harness.client.answerJobs.stream(JOB_ID));
    for (const event of events) accumulator.accept(event);

    const sections = events.filter((e) => e.type === 'answer.section');
    expect(sections).toHaveLength(2);
    expect(sections.every((e) => e.provisional)).toBe(true);
    expect(accumulator.failed).toBe(true);
    expect(accumulator.sections).toEqual([]);
    expect(accumulator.citations).toEqual([]);
    expect(() => assertNotProvisional(accumulator)).toThrow(AerValidationError);
  });

  it('allows assertNotProvisional only after job.completed', async () => {
    const harness = createHarness(sse('full.txt'));
    const accumulator = createStreamAccumulator();
    for (const event of await collect(harness.client.answerJobs.stream(JOB_ID))) accumulator.accept(event);
    expect(accumulator.completed).toBe(true);
    expect(accumulator.sections).toHaveLength(1);
    expect(accumulator.sections[0]?.provisional).toBe(true);
    expect(() => assertNotProvisional(accumulator)).not.toThrow();
  });

  it('caps accumulation so an endless stream cannot grow without bound', async () => {
    const harness = createHarness(sse('full.txt'));
    const accumulator = createStreamAccumulator(0);
    for (const event of await collect(harness.client.answerJobs.stream(JOB_ID))) accumulator.accept(event);
    expect(accumulator.truncated).toBe(true);
    expect(accumulator.sections).toHaveLength(0);
  });

  describe('the reader is closed in a finally, on every exit path', () => {
    it('on a normal terminal end', async () => {
      const harness = createHarness(sse('full.txt'));
      await collect(harness.client.answerJobs.stream(JOB_ID));
      expect(harness.transport.readerCancels).toHaveLength(1);
    });

    it('on a consumer break', async () => {
      const harness = createHarness(sse('full.txt'));
      for await (const event of harness.client.answerJobs.stream(JOB_ID)) {
        expect(event.type).toBe('job.started');
        break;
      }
      expect(harness.transport.readerCancels).toHaveLength(1);
    });

    it('on a thrown contract violation', async () => {
      const harness = createHarness(sse('unknown-type.txt'));
      await collect(harness.client.answerJobs.stream(JOB_ID)).catch(() => undefined);
      expect(harness.transport.readerCancels).toHaveLength(1);
    });

    it('on an exception thrown by the consumer', async () => {
      const harness = createHarness(sse('full.txt'));
      const boom = new Error('the consumer threw');
      await expect(
        (async () => {
          for await (const event of harness.client.answerJobs.stream(JOB_ID)) {
            void event;
            throw boom;
          }
        })(),
      ).rejects.toBe(boom);
      expect(harness.transport.readerCancels).toHaveLength(1);
    });

    it('on an abort', async () => {
      const controller = new AbortController();
      const harness = createHarness(sse('full.txt'));
      await expect(
        (async () => {
          for await (const event of harness.client.answerJobs.stream(JOB_ID, {
            signal: controller.signal,
          })) {
            void event;
            controller.abort();
          }
        })(),
      ).rejects.toBeTruthy();
      expect(harness.transport.readerCancels).toHaveLength(1);
    });
  });
});

describe('the SSE parser', () => {
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

  it('reassembles a frame split across chunk boundaries', () => {
    const parser = new SseParser();
    const transcript = fixtureText('sse/full.txt');
    const bytes = encode(transcript);
    const frames = [];
    for (let i = 0; i < bytes.length; i += 3) frames.push(...parser.push(bytes.slice(i, i + 3)));
    frames.push(...parser.end());
    expect(frames.map((f) => f.event)).toEqual([
      'job.started',
      'stage.changed',
      'clarification.required',
      'answer.section',
      'citation.added',
      'heartbeat',
      'job.completed',
    ]);
  });

  it('accepts CRLF exactly as LF', () => {
    const parser = new SseParser();
    const frames = parser.push(encode(fixtureText('sse/full.txt').replace(/\n/g, '\r\n')));
    expect(frames).toHaveLength(7);
    expect(frames[0]?.id).toBe('1');
  });

  it('ignores comments, reads retry:, and joins multi-line data', () => {
    const frames = new SseParser().push(encode(fixtureText('sse/comments-and-multiline.txt')));
    expect(frames.map((f) => f.event)).toEqual([null, 'stage.changed', 'job.completed']);
    expect(frames[0]?.retryMs).toBe(2500);
    expect(parseBlock('data: a\ndata: b')?.data).toBe('a\nb');
    expect(parseBlock(': only a comment')).toBeNull();
    expect(parseBlock('unknown-field: x')?.data).toBe('');
  });

  it('refuses to buffer an unterminated frame without bound', () => {
    const parser = new SseParser({ maxFrameBytes: 32 });
    expect(() => parser.push(encode(`data: ${'x'.repeat(200)}`))).toThrow(AerStreamError);
  });

  it('rejects a frame whose payload is not JSON or lacks a declared field', () => {
    expect(() => toStreamEvent({ id: '1', event: 'job.started', data: 'not json' })).toThrow(AerStreamError);
    expect(() =>
      toStreamEvent({ id: '1', event: 'job.completed', data: JSON.stringify({ schema_version: '1.0', job_id: 'j', occurred_at: 't' }) }),
    ).toThrow(/answer_snapshot_id/);
    expect(() =>
      toStreamEvent({ id: '1', event: 'job.started', data: JSON.stringify({ schema_version: '9.9', job_id: 'j', occurred_at: 't' }) }),
    ).toThrow(/schema_version/);
  });
});
