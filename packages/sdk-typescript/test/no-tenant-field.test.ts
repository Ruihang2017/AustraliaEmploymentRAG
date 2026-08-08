/**
 * PRD §34.1 Tenant row — *"Never accepted in a request body; derived from authenticated
 * session/key/widget token"* (also PRD §16.1: *"Organisation is derived from authenticated context,
 * not trusted request fields"*).
 */
import { describe, expect, it } from 'vitest';

import { createAerClient } from '../src/sdk.js';
import { BASE_URL, CANARY_CREDENTIAL, createHarness } from './support/client.js';
import { sourceWithoutComments } from './support/repo.js';
import { searchResponse } from './fixtures/typed.js';

describe('no tenant field (PRD §34.1, §16.1)', () => {
  it('offers no organizationId option', () => {
    createAerClient({
      baseUrl: BASE_URL,
      auth: { apiKey: CANARY_CREDENTIAL },
      fetch: () => Promise.resolve({ status: 200, headers: { get: () => null }, text: () => Promise.resolve('{}') }),
      // @ts-expect-error — AerClientOptions declares no organizationId (PRD §34.1).
      organizationId: 'org_x',
    });
  });

  it('names no organisation or tenant identifier anywhere in src/**', () => {
    for (const { path, text } of sourceWithoutComments()) {
      expect(/organizationId|organisationId|tenantId|x-tenant/i.test(text), `${path}`).toBe(false);
    }
  });

  it('sends no tenant header or body field on a real call', async () => {
    const harness = createHarness(() => ({ status: 200, json: searchResponse }));
    await harness.client.search({ query: 'q' });
    const request = harness.transport.requests[0];
    expect(request).toBeDefined();
    for (const name of Object.keys(request?.headers ?? {})) {
      expect(/tenant|organisation|organization/i.test(name), name).toBe(false);
    }
    expect(/tenant|organisation|organization/i.test(request?.body ?? '')).toBe(false);
  });
});
