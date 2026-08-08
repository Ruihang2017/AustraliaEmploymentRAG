/**
 * PRD §38.2 — *"API keys do not use cookies."*
 *
 * Two independent checks, because either alone is weak: a source scan (no code path can set the
 * header) and an observation over every request the sample integration actually made.
 */
import { describe, expect, it } from 'vitest';

import { createAerClient } from '../src/sdk.js';
import { sourceWithoutComments } from './support/repo.js';
import { BASE_URL, CANARY_CREDENTIAL } from './support/client.js';
import { runQuickstart } from '../examples/quickstart.js';
import { canaryResponder, quickstartWebhook } from './support/quickstart.js';
import { createFakeClock, createFakeTransport } from './support/transport.js';
import { CANARY } from './support/client.js';

describe('no cookie path (PRD §38.2)', () => {
  it('names no cookie header anywhere in src/**', () => {
    for (const { path, text } of sourceWithoutComments()) {
      expect(/cookie/i.test(text), `${path} names a cookie`).toBe(false);
    }
  });

  it('sets no Cookie header on any request the example makes', async () => {
    const transport = createFakeTransport(canaryResponder());
    const clock = createFakeClock();
    await runQuickstart({
      fetch: transport.fetch,
      apiKey: CANARY_CREDENTIAL,
      baseUrl: BASE_URL,
      log: () => undefined,
      research: { query: CANARY.question, question: CANARY.question, facts: { free_text: CANARY.facts } },
      webhook: quickstartWebhook(),
      retryDeps: clock,
      timers: clock.timers,
    });

    expect(transport.requests.length).toBeGreaterThan(4);
    for (const request of transport.requests) {
      for (const name of Object.keys(request.headers)) {
        expect(name.toLowerCase()).not.toBe('cookie');
        expect(name.toLowerCase()).not.toBe('set-cookie');
      }
    }
  });

  it('offers no cookie or session auth variant on the client options', () => {
    // @ts-expect-error — a cookie variant does not exist in AerAuth (PRD §38.2).
    expect(() => createAerClient({ baseUrl: BASE_URL, auth: { cookie: 'x' }, fetch: async () => ({ status: 200, headers: { get: () => null }, text: async () => '{}' }) })).toThrow();
  });
});
