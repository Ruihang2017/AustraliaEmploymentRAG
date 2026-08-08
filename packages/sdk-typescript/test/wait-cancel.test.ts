/**
 * Wait and cancel (ticket deliverable 8; PRD §16.2, §34.3, §34.5).
 *
 * The concurrency question the reviewer is pointed at — *"whether a concurrent `createAndWait` and
 * `cancel` on the same job can double-charge"* — is answered by counting `POST /v1/answers` requests
 * in the transport record: exactly one, on every path through this suite.
 */
import { describe, expect, it } from 'vitest';

import { AerJobFailedError, AerWaitTimeoutError } from '../src/errors.js';
import { isClarificationRequired } from '../src/sdk.js';
import { createHarness } from './support/client.js';
import { routed } from './support/transport.js';
import { fixtureText } from './support/repo.js';
import {
  ANSWER_SNAPSHOT_ID,
  JOB_ID,
  answerJobAccepted,
  answerSnapshot,
  clarificationRequired,
  jobAccepted,
  jobCompletedDescriptor,
  refusalSnapshot,
} from './fixtures/typed.js';

const CREATE = /\/v1\/answers$/;
const EVENTS = /\/answer-jobs\/[^/]+\/events$/;
const SNAPSHOT = /\/v1\/answers\/ans_/;
const JOB = /\/v1\/answer-jobs\/[^/]+$/;
const CANCEL = /\/cancel$/;

const happyPath = (transcript = 'sse/full.txt') =>
  routed([
    [CANCEL, () => ({ status: 202, json: jobAccepted })],
    [EVENTS, () => ({ status: 200, sse: fixtureText(transcript), chunkSize: 29 })],
    [SNAPSHOT, () => ({ status: 200, json: answerSnapshot })],
    [CREATE, () => ({ status: 202, json: answerJobAccepted })],
    [JOB, () => ({ status: 200, json: jobCompletedDescriptor })],
  ]);

describe('createAndWait (PRD §34.3-34.5)', () => {
  it('returns the Answer Snapshot on completion, creating the job exactly once', async () => {
    const harness = createHarness(happyPath());
    const seen: string[] = [];
    const result = await harness.client.answers.createAndWait(
      { mode: 'QUICK', question: 'q' },
      { onEvent: (event) => seen.push(event.type) },
    );

    expect(isClarificationRequired(result)).toBe(false);
    expect((result as typeof answerSnapshot).id).toBe(ANSWER_SNAPSHOT_ID);
    expect(seen).toContain('job.completed');
    expect(harness.transport.requests.filter((r) => CREATE.test(r.url))).toHaveLength(1);
  });

  // Sub-PRD D4 — a refusal is a successful result.
  it('resolves for a completed job whose answer status is a refusal', async () => {
    const harness = createHarness(
      routed([
        [EVENTS, () => ({ status: 200, sse: fixtureText('sse/full.txt'), chunkSize: 29 })],
        [SNAPSHOT, () => ({ status: 200, json: refusalSnapshot })],
        [CREATE, () => ({ status: 202, json: answerJobAccepted })],
      ]),
    );
    const result = await harness.client.answers.createAndWait({ mode: 'QUICK', question: 'q' });
    expect((result as typeof answerSnapshot).status).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('returns PRD §34.3’s clarification variant instead of throwing', async () => {
    const harness = createHarness(routed([[CREATE, () => ({ status: 202, json: clarificationRequired })]]));
    const result = await harness.client.answers.createAndWait({ mode: 'QUICK', question: 'q' });
    expect(isClarificationRequired(result)).toBe(true);
    // No stream was opened, and no second create was attempted.
    expect(harness.transport.requests).toHaveLength(1);
  });

  it('throws AerWaitTimeoutError carrying the job id, and creates no second job', async () => {
    const harness = createHarness(
      routed([
        [EVENTS, () => ({ status: 200, hang: true })],
        [CREATE, () => ({ status: 202, json: answerJobAccepted })],
      ]),
    );

    const pending = harness.client.answers
      .createAndWait({ mode: 'QUICK', question: 'q' }, { waitTimeoutMs: 5_000 })
      .then(() => null)
      .catch((error: unknown) => error);

    await harness.flush();
    harness.clock.advance(5_000);
    const error = await pending;

    expect(error).toBeInstanceOf(AerWaitTimeoutError);
    expect((error as AerWaitTimeoutError).jobId).toBe(JOB_ID);
    expect(harness.transport.requests.filter((r) => CREATE.test(r.url))).toHaveLength(1);
  });

  it('surfaces a failed job as a job outcome, not as an HTTP error', async () => {
    const harness = createHarness(
      routed([
        [EVENTS, () => ({ status: 200, sse: fixtureText('sse/failed.txt'), chunkSize: 29 })],
        [CREATE, () => ({ status: 202, json: answerJobAccepted })],
      ]),
    );
    const error = (await harness.client.answers
      .createAndWait({ mode: 'QUICK', question: 'q' })
      .catch((caught: unknown) => caught)) as AerJobFailedError;
    expect(error).toBeInstanceOf(AerJobFailedError);
    expect(error.terminalEvent).toBe('job.failed');
    expect(error.jobId).toBe(JOB_ID);
  });

  it('falls back to polling when the event stream cannot be opened at all', async () => {
    let eventsCalls = 0;
    const harness = createHarness(
      routed([
        [
          EVENTS,
          () => {
            eventsCalls += 1;
            // Every open of the stream fails until the polling fallback re-attempts it.
            return eventsCalls <= 4
              ? { status: 503, json: { error: { code: 'GENERATION_UNAVAILABLE', message: 'no sse', request_id: 'req_x', retryable: true } } }
              : { status: 200, sse: fixtureText('sse/full.txt'), chunkSize: 29 };
          },
        ],
        [SNAPSHOT, () => ({ status: 200, json: answerSnapshot })],
        [CREATE, () => ({ status: 202, json: answerJobAccepted })],
        [JOB, () => ({ status: 200, json: jobCompletedDescriptor })],
      ]),
    );

    const result = await harness.client.answers.createAndWait({ mode: 'QUICK', question: 'q' });
    expect((result as typeof answerSnapshot).id).toBe(ANSWER_SNAPSHOT_ID);
    expect(harness.transport.requests.filter((r) => JOB.test(r.url))).not.toHaveLength(0);
    expect(harness.transport.requests.filter((r) => CREATE.test(r.url))).toHaveLength(1);
  });
});

describe('cancel (PRD §16.2)', () => {
  it('is safe to call twice and sends no Idempotency-Key', async () => {
    const harness = createHarness(routed([[CANCEL, () => ({ status: 202, json: jobAccepted })]]));
    const first = await harness.client.answerJobs.cancel(JOB_ID);
    const second = await harness.client.answerJobs.cancel(JOB_ID);
    expect(first.job.id).toBe(JOB_ID);
    expect(second.job.id).toBe(JOB_ID);
    expect(harness.transport.headerValues('idempotency-key')).toEqual([undefined, undefined]);
    expect(harness.transport.requests[0]?.method).toBe('POST');
    expect(harness.transport.requests[0]?.url).toBe(
      `https://api.example.test/v1/answer-jobs/${JOB_ID}/cancel`,
    );
  });

  it('cancelling while a wait is streaming does not re-create the job', async () => {
    const harness = createHarness(happyPath('sse/cancelled.txt'));

    const waiting = harness.client.answers
      .createAndWait({ mode: 'QUICK', question: 'q' })
      .catch((error: unknown) => error);
    await harness.flush();
    await harness.client.answerJobs.cancel(JOB_ID);
    const outcome = await waiting;

    expect(outcome).toBeInstanceOf(AerJobFailedError);
    expect((outcome as AerJobFailedError).terminalEvent).toBe('job.cancelled');
    expect(harness.transport.requests.filter((r) => CREATE.test(r.url))).toHaveLength(1);
  });
});
