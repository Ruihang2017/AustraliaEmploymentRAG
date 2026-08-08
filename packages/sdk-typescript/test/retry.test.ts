/**
 * The retry policy (ticket deliverable 5; PRD §34.9, §38.5).
 *
 * The code table is DRIVEN by `errorRetryableByCode`, so it cannot silently shrink: the row count is
 * asserted against the generated catalogue, and each row is executed against the real client.
 *
 * On `retryable: true` for `AUTHENTICATION_REQUIRED`, `MFA_REQUIRED`, `RECENT_AUTH_REQUIRED` and
 * `EMPLOYEE_PII_DETECTED` — that is what PRD §34.9's Retry column generates today, the ticket says to
 * read retryability from the generated metadata, and the question of whether that column means
 * "auto-retry" or "the user may retry after acting" is raised as plan **OQ-3** rather than answered
 * by a local exception list.
 */
import { describe, expect, it } from 'vitest';

import { AerTransportError, errorCodes, errorRetryableByCode, isRetryableError, parseRetryAfter } from '../src/sdk.js';
import { backoffDelayMs, DEFAULT_RETRY_OPTIONS, resolveRetryOptions } from '../src/retry.js';
import { AerAbortedError, AerApiError } from '../src/errors.js';
import { createHarness } from './support/client.js';
import { errorBody, searchResponse } from './fixtures/typed.js';

const ok = { status: 200, json: searchResponse } as const;

describe('retry policy (PRD §34.9, §38.5)', () => {
  it('has exactly the 17 PRD §34.9 rows', () => {
    expect(errorCodes).toHaveLength(17);
    expect(Object.keys(errorRetryableByCode)).toHaveLength(17);
  });

  it.each(errorCodes.map((code) => [code, errorRetryableByCode[code]] as const))(
    'retries %s exactly when the generated catalogue says retryable=%s',
    async (code, retryable) => {
      let call = 0;
      const harness = createHarness(() => {
        call += 1;
        // The wire says retryable:false for every code; the CATALOGUE must win.
        if (call === 1) return { status: 500, json: errorBody(code, 'first attempt fails') };
        return ok;
      });

      const outcome = await harness.client.search({ query: 'q' }).then(
        () => 'resolved',
        () => 'rejected',
      );

      expect(harness.transport.requests).toHaveLength(retryable ? 2 : 1);
      expect(outcome).toBe(retryable ? 'resolved' : 'rejected');
    },
  );

  it('retries a transport error', async () => {
    let call = 0;
    const harness = createHarness(() => {
      call += 1;
      return call === 1 ? { status: 0, reject: new AerTransportError('socket reset') } : ok;
    });
    await harness.client.search({ query: 'q' });
    expect(harness.transport.requests).toHaveLength(2);
  });

  it('honours Retry-After over the computed backoff on a 429', async () => {
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
      return ok;
    });

    await harness.client.search({ query: 'q' });
    // The computed backoff for attempt 1 with random()=1 would be 200 ms; the server said 3 s.
    expect(harness.clock.slept).toEqual([3000]);
    expect(backoffDelayMs(1, DEFAULT_RETRY_OPTIONS, () => 1)).toBe(200);
  });

  it('clamps a hostile Retry-After to maxRetryAfterMs', async () => {
    let call = 0;
    const harness = createHarness(
      () => {
        call += 1;
        if (call === 1) {
          return {
            status: 429,
            json: errorBody('RATE_LIMITED', 'slow down'),
            headers: { 'Retry-After': '999999' },
          };
        }
        return ok;
      },
      { overrides: { retry: { maxRetryAfterMs: 5_000 } } },
    );

    await harness.client.search({ query: 'q' });
    expect(harness.clock.slept).toEqual([5000]);
  });

  it('parses both Retry-After forms and never yields NaN', () => {
    expect(parseRetryAfter('3', 0)).toBe(3000);
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter('   ', 0)).toBeNull();
    expect(parseRetryAfter('not-a-date', 0)).toBeNull();
    const now = Date.parse('2026-08-03T03:00:00Z');
    expect(parseRetryAfter('Mon, 03 Aug 2026 03:00:30 GMT', now)).toBe(30_000);
    // A date already in the past is zero, never negative.
    expect(parseRetryAfter('Mon, 03 Aug 2026 02:59:00 GMT', now)).toBe(0);
  });

  it('stops at maxAttempts', async () => {
    const harness = createHarness(() => ({ status: 500, json: errorBody('INTERNAL_ERROR', 'boom') }), {
      overrides: { retry: { maxAttempts: 2 } },
    });
    await expect(harness.client.search({ query: 'q' })).rejects.toBeInstanceOf(AerApiError);
    expect(harness.transport.requests).toHaveLength(2);
  });

  it('stops when the next delay would exceed the elapsed budget', async () => {
    const harness = createHarness(() => ({ status: 500, json: errorBody('INTERNAL_ERROR', 'boom') }), {
      overrides: { retry: { maxAttempts: 10, maxElapsedMs: 100, initialDelayMs: 200 } },
    });
    await expect(harness.client.search({ query: 'q' })).rejects.toBeInstanceOf(AerApiError);
    expect(harness.transport.requests).toHaveLength(1);
    expect(harness.clock.slept).toEqual([]);
  });

  it('aborts mid-retry promptly and performs no further request', async () => {
    const controller = new AbortController();
    let call = 0;
    const harness = createHarness(() => {
      call += 1;
      controller.abort();
      return { status: 500, json: errorBody('INTERNAL_ERROR', 'boom') };
    });

    await expect(harness.client.search({ query: 'q' }, { signal: controller.signal })).rejects.toBeTruthy();
    expect(harness.transport.requests).toHaveLength(1);
    expect(call).toBe(1);
  });

  it('classifies errors without guessing', () => {
    expect(isRetryableError(new AerTransportError('x'))).toBe(true);
    expect(isRetryableError(new AerAbortedError())).toBe(false);
    expect(isRetryableError(new Error('unrelated'))).toBe(false);
  });

  it('resolves options from the documented defaults', () => {
    expect(resolveRetryOptions(undefined)).toEqual(DEFAULT_RETRY_OPTIONS);
    expect(resolveRetryOptions({ maxAttempts: 7 }).maxAttempts).toBe(7);
    expect(resolveRetryOptions({ maxAttempts: 7 }).maxDelayMs).toBe(DEFAULT_RETRY_OPTIONS.maxDelayMs);
  });

  it('applies full jitter, bounded by maxDelayMs', () => {
    expect(backoffDelayMs(1, DEFAULT_RETRY_OPTIONS, () => 0)).toBe(0);
    expect(backoffDelayMs(3, DEFAULT_RETRY_OPTIONS, () => 1)).toBe(800);
    expect(backoffDelayMs(20, DEFAULT_RETRY_OPTIONS, () => 1)).toBe(DEFAULT_RETRY_OPTIONS.maxDelayMs);
  });
});
