/**
 * Typed errors (ticket deliverable 6) and sub-PRD **D4** (a refusal is not an error).
 *
 * The class set is BUILT from `errorCodes`, so this suite asserts the two agree rather than
 * transcribing seventeen names: adding a code to the OpenAPI document adds a class with no edit to
 * `src/errors.ts`, and this test proves it by comparing against the generated catalogue directly.
 */
import { describe, expect, it } from 'vitest';

import {
  AerApiError,
  errorClassFor,
  errorClassName,
  errorClasses,
  errorCodes,
  errorHttpStatusByCode,
  errorRetryableByCode,
  isAerApiError,
} from '../src/sdk.js';
import { readErrorEnvelope, toApiError } from '../src/errors.js';
import { createHarness } from './support/client.js';
import { answerSnapshot, errorBody, refusalSnapshot } from './fixtures/typed.js';

describe('typed errors (PRD §34.9)', () => {
  it('has exactly one class per generated code, and no more', () => {
    expect(Object.keys(errorClasses).sort()).toEqual([...errorCodes].sort());
  });

  it.each(errorCodes.map((code) => [code] as const))(
    '%s carries the catalogue’s exact status and retryable value',
    (code) => {
      const error = new (errorClassFor(code))({
        code,
        httpStatus: errorHttpStatusByCode[code],
        retryable: errorRetryableByCode[code],
        requestId: null,
        details: null,
        body: null,
        message: 'x',
      });
      expect(error).toBeInstanceOf(AerApiError);
      expect(isAerApiError(error)).toBe(true);
      expect(error.code).toBe(code);
      expect(error.httpStatus).toBe(errorHttpStatusByCode[code]);
      expect(error.retryable).toBe(errorRetryableByCode[code]);
      expect(error.name).toBe(errorClassName(code));
    },
  );

  it('names classes the way a caller would write them', () => {
    expect(errorClassName('IDEMPOTENCY_CONFLICT')).toBe('IdempotencyConflictError');
    expect(errorClassName('INVALID_LEGAL_DATE')).toBe('InvalidLegalDateError');
    expect(errorClassName('INTERNAL_ERROR')).toBe('InternalErrorError');
  });

  it('reads the PRD §16.1 envelope and ignores anything that is not one', () => {
    expect(readErrorEnvelope(errorBody('INVALID_REQUEST', 'bad'))?.code).toBe('INVALID_REQUEST');
    expect(readErrorEnvelope({ error: { code: 'NOT_A_REAL_CODE', message: 'x' } })).toBeNull();
    expect(readErrorEnvelope('plain text')).toBeNull();
    expect(readErrorEnvelope(null)).toBeNull();
  });

  it('takes status and retryable from the CATALOGUE, not from the wire', async () => {
    // The body claims retryable:false and the status line claims 500; the catalogue says
    // RATE_LIMITED is 429 and retryable.
    const harness = createHarness(() => ({ status: 500, json: errorBody('RATE_LIMITED', 'slow down') }), {
      overrides: { retry: { maxAttempts: 1 } },
    });
    const error = (await harness.client.search({ query: 'q' }).catch((e: unknown) => e)) as AerApiError;
    expect(error.httpStatus).toBe(429);
    expect(error.retryable).toBe(true);
  });

  it('turns an unparseable error body into INTERNAL_ERROR with a truncated excerpt', () => {
    const error = toApiError({
      httpStatus: 502,
      body: undefined,
      rawText: 'x'.repeat(500),
      headerRequestId: null,
    });
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.httpStatus).toBe(502);
    expect(error.message.length).toBeLessThan(300);
  });

  it('carries request_id, details and the raw body — and nothing else', async () => {
    const body = errorBody('INVALID_REQUEST', 'page_size out of range');
    const harness = createHarness(() => ({ status: 400, json: body }));
    const error = (await harness.client.search({ query: 'q' }).catch((e: unknown) => e)) as AerApiError;
    expect(error.requestId).toBe(body.error.request_id);
    expect(error.details).toEqual({});
    expect(error.body).toEqual(body);
  });

  // Sub-PRD D4 — PRD §34.9's closing sentence.
  it('does NOT throw for a completed job whose answer status is INSUFFICIENT_EVIDENCE', async () => {
    const harness = createHarness(() => ({ status: 200, json: refusalSnapshot }));
    const snapshot = await harness.client.answers.getSnapshot(refusalSnapshot.id);
    expect(snapshot.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(snapshot.id).toBe(answerSnapshot.id);
  });
});
