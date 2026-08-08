/**
 * Idempotency is RETRY-STABLE (ticket deliverable 4; PRD §34.1, §8.10; `ANS-003`).
 *
 * The assertion that matters compares the THREE CAPTURED HEADER VALUES with each other. "A key was
 * present on every attempt" is satisfied by a client that mints a fresh key each time — which is the
 * defect: `ANS-003` says *"Repeated idempotency key creates one job/charge"*, so two keys are two
 * jobs and two charges.
 */
import { describe, expect, it } from 'vitest';

import { AerTransportError, AerValidationError, errorClasses, isAerApiError } from '../src/sdk.js';
import { assertIdempotencyKey } from '../src/idempotency.js';
import { resolveIdempotencyKey } from '../src/idempotency.js';
import { createHarness } from './support/client.js';
import { answerJobAccepted, errorBody } from './fixtures/typed.js';
import type { ResponseSpec } from './support/transport.js';

const accepted: ResponseSpec = { status: 202, json: answerJobAccepted };

describe('Idempotency-Key (PRD §34.1)', () => {
  it('re-sends the IDENTICAL key on every automatic retry', async () => {
    let call = 0;
    const harness = createHarness(() => {
      call += 1;
      if (call <= 2) return { status: 0, reject: new AerTransportError('socket reset') };
      return accepted;
    });

    await harness.client.answers.create({ mode: 'QUICK', question: 'q' });

    expect(harness.transport.requests).toHaveLength(3);
    const keys = harness.transport.headerValues('idempotency-key');
    expect(keys).toHaveLength(3);
    // Byte-identical across all three, not merely "present".
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
    const key = keys[0] as string;
    expect(key.length).toBeGreaterThanOrEqual(16);
    expect(key.length).toBeLessThanOrEqual(128);
  });

  it('re-sends the identical key across a 429 Retry-After retry too', async () => {
    let call = 0;
    const harness = createHarness(() => {
      call += 1;
      if (call === 1) {
        return {
          status: 429,
          json: errorBody('RATE_LIMITED', 'slow down'),
          headers: { 'Retry-After': '3' },
        };
      }
      return accepted;
    });

    await harness.client.answers.create({ mode: 'QUICK', question: 'q' });
    const keys = harness.transport.headerValues('idempotency-key');
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('passes a caller-supplied key through unchanged', async () => {
    const harness = createHarness(() => accepted);
    const callerKey = 'caller-supplied-key-0001';
    await harness.client.answers.create({ mode: 'QUICK', question: 'q' }, { idempotencyKey: callerKey });
    expect(harness.transport.headerValues('idempotency-key')).toEqual([callerKey]);
  });

  it('sends NO key on an operation the document does not mark a retryable write', async () => {
    const harness = createHarness(() => accepted);
    await harness.client.answerJobs.cancel('job_x');
    expect(harness.transport.headerValues('idempotency-key')).toEqual([undefined]);
  });

  it('maps a 409 to the typed IdempotencyConflictError', async () => {
    const harness = createHarness(() => ({
      status: 409,
      json: errorBody('IDEMPOTENCY_CONFLICT', 'the body changed for this key'),
    }));

    const error = await harness.client.answers
      .create({ mode: 'QUICK', question: 'q' })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(isAerApiError(error)).toBe(true);
    expect(error).toBeInstanceOf(errorClasses.IDEMPOTENCY_CONFLICT);
    expect((error as { name: string }).name).toBe('IdempotencyConflictError');
    expect((error as { code: string }).code).toBe('IDEMPOTENCY_CONFLICT');
    expect((error as { httpStatus: number }).httpStatus).toBe(409);
    // Not retryable — one attempt only, so a conflicting body is never silently re-issued.
    expect(harness.transport.requests).toHaveLength(1);
  });

  it('rejects a key outside PRD §34.1’s 16–128 bound before any request', () => {
    expect(() => assertIdempotencyKey('too-short')).toThrow(AerValidationError);
    expect(() => assertIdempotencyKey('x'.repeat(129))).toThrow(AerValidationError);
    expect(() => assertIdempotencyKey('x'.repeat(16))).not.toThrow();
    expect(() => assertIdempotencyKey('x'.repeat(128))).not.toThrow();
  });

  it('refuses a caller key on a non-retryable-write operation', () => {
    expect(() => resolveIdempotencyKey('cancelAnswerJob', 'a-valid-length-key-here')).toThrow(
      AerValidationError,
    );
  });

  it('generates a key only for a retryable write, and validates what it generated', () => {
    expect(resolveIdempotencyKey('search', undefined)).toBeUndefined();
    const generated = resolveIdempotencyKey('createAnswerJob', undefined);
    expect(typeof generated).toBe('string');
    expect((generated as string).length).toBeGreaterThanOrEqual(16);
  });

  it('rejects a generator that produces an out-of-bound key, instead of sending it', () => {
    expect(() => resolveIdempotencyKey('createAnswerJob', undefined, () => 'short')).toThrow(
      AerValidationError,
    );
  });
});
