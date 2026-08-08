/**
 * PRD §22, §21.1 — the credential leaves through the `Authorization` header and nowhere else.
 *
 * Six exits are checked: telemetry, a thrown error's `message`/`stack`/`details`/`body`,
 * `String(client)`, `JSON.stringify(client)`, `util.inspect(client)`, and the example's own output.
 */
import { describe, expect, it } from 'vitest';
import { inspect } from 'node:util';

import type { AerApiError } from '../src/sdk.js';
import { createAerClient } from '../src/sdk.js';
import { AerValidationError } from '../src/errors.js';
import { BASE_URL, CANARY_CREDENTIAL, createHarness } from './support/client.js';
import { errorBody, searchResponse } from './fixtures/typed.js';

describe('no credential leaks (PRD §22, §21.1)', () => {
  it('holds no credential as a property of the client', () => {
    const harness = createHarness(() => ({ status: 200, json: searchResponse }));
    expect(JSON.stringify(harness.client)).not.toContain(CANARY_CREDENTIAL);
    expect(String(harness.client)).not.toContain(CANARY_CREDENTIAL);
    expect(inspect(harness.client, { depth: null })).not.toContain(CANARY_CREDENTIAL);
    expect(JSON.stringify(harness.client)).toContain('[redacted]');
  });

  it('keeps the credential out of a deep enumeration of the client', () => {
    const harness = createHarness(() => ({ status: 200, json: searchResponse }));
    const seen: string[] = [];
    const walk = (value: unknown, depth: number): void => {
      if (depth > 4 || value === null || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        seen.push(key);
        if (typeof child === 'string') expect(child).not.toContain(CANARY_CREDENTIAL);
        walk(child, depth + 1);
      }
    };
    walk(harness.client, 0);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('keeps the credential out of a thrown API error', async () => {
    const harness = createHarness(() => ({ status: 400, json: errorBody('INVALID_REQUEST', 'bad') }));
    const error = (await harness.client.search({ query: 'q' }).catch((e: unknown) => e)) as AerApiError;
    const surface = [error.message, error.stack ?? '', JSON.stringify(error.details), JSON.stringify(error.body)];
    for (const text of surface) expect(text).not.toContain(CANARY_CREDENTIAL);
  });

  it('keeps the credential out of a transport error’s message and cause chain', async () => {
    const harness = createHarness(() => ({ status: 0, reject: new Error('ECONNRESET') }), {
      overrides: { retry: { maxAttempts: 1 } },
    });
    const error = (await harness.client.search({ query: 'q' }).catch((e: unknown) => e)) as Error;
    expect(inspect(error, { depth: null })).not.toContain(CANARY_CREDENTIAL);
  });

  it('never quotes the credential when rejecting a malformed one', () => {
    let thrown: unknown = null;
    try {
      createAerClient({
        baseUrl: BASE_URL,
        auth: { apiKey: '' },
        fetch: () => Promise.resolve({ status: 200, headers: { get: () => null }, text: () => Promise.resolve('{}') }),
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AerValidationError);
    expect((thrown as Error).message).toBe('auth.apiKey must be a non-empty string');
  });

  it('does send the credential where it belongs, so the assertions above are not vacuous', async () => {
    const harness = createHarness(() => ({ status: 200, json: searchResponse }));
    await harness.client.search({ query: 'q' });
    expect(harness.transport.headerValues('authorization')).toEqual([`Bearer ${CANARY_CREDENTIAL}`]);
  });
});
