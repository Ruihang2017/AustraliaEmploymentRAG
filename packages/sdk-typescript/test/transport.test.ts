/**
 * URL and header construction (ticket deliverables 2 and 3; PRD §16.1, §34.1).
 */
import { describe, expect, it } from 'vitest';

import { AerTransportError, AerValidationError } from '../src/errors.js';
import { apiBasePath, createAerClient, operations } from '../src/sdk.js';
import { assertBaseUrl, buildQueryString, buildUrl, fillPathTemplate, methodFor } from '../src/transport.js';
import { toCamelCase, resourceSegment } from '../src/resources.js';
import { BASE_URL, CANARY_CREDENTIAL, createHarness } from './support/client.js';
import { answerJobAccepted, searchResponse } from './fixtures/typed.js';

const noopFetch = () =>
  Promise.resolve({ status: 200, headers: { get: () => null }, text: () => Promise.resolve('{}') });

describe('URL construction', () => {
  it('percent-encodes every path parameter', () => {
    expect(fillPathTemplate('/answer-jobs/{job_id}/cancel', { job_id: 'job_1/../admin' })).toBe(
      '/answer-jobs/job_1%2F..%2Fadmin/cancel',
    );
  });

  it('fails loudly when a path parameter is missing, rather than sending a literal brace', () => {
    expect(() => fillPathTemplate('/answer-jobs/{job_id}', {})).toThrow(AerTransportError);
  });

  it('omits undefined query values instead of sending the string "undefined"', () => {
    expect(buildQueryString({ page_size: 25, cursor: undefined })).toBe('?page_size=25');
    expect(buildQueryString(undefined)).toBe('');
    expect(buildQueryString({})).toBe('');
    expect(buildQueryString({ cursor: 'a b&c' })).toBe('?cursor=a%20b%26c');
  });

  it('composes baseUrl with the GENERATED path and method', () => {
    expect(buildUrl({ baseUrl: BASE_URL }, { operationId: 'search' })).toBe(`${BASE_URL}/search`);
    expect(methodFor('search')).toBe(operations['search'].method);
    expect(buildUrl({ baseUrl: `${BASE_URL}/` }, { operationId: 'search' })).toBe(`${BASE_URL}/search`);
  });

  it('requires baseUrl to end at the generated api base path', () => {
    expect(apiBasePath).toBe('/v1');
    expect(() => assertBaseUrl('https://api.example.test')).toThrow(AerTransportError);
    expect(() => assertBaseUrl('https://api.example.test/v1')).not.toThrow();
    expect(() => assertBaseUrl('https://api.example.test/v1/')).not.toThrow();
    expect(() =>
      createAerClient({ baseUrl: 'https://api.example.test', auth: { apiKey: CANARY_CREDENTIAL }, fetch: noopFetch }),
    ).toThrow(AerTransportError);
  });

  it('groups resources from the generated first path segment', () => {
    expect(resourceSegment('/answer-jobs/{job_id}/cancel')).toBe('answer-jobs');
    expect(toCamelCase('answer-jobs')).toBe('answerJobs');
    expect(toCamelCase('sso-connections')).toBe('ssoConnections');
  });
});

describe('request headers', () => {
  it('sends Accept, Content-Type on a body, and a User-Agent naming the SDK', async () => {
    const harness = createHarness(() => ({ status: 200, json: searchResponse }));
    await harness.client.search({ query: 'q' });
    const headers = harness.transport.requests[0]?.headers ?? {};
    expect(headers['Accept']).toBe('application/json');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['User-Agent']).toContain('@taxrag/sdk-typescript/');
  });

  it('sends no Content-Type when there is no body', async () => {
    const harness = createHarness(() => ({ status: 202, json: answerJobAccepted }));
    await harness.client.answerJobs.get('job_x');
    expect(harness.transport.requests[0]?.headers['Content-Type']).toBeUndefined();
    expect(harness.transport.requests[0]?.body).toBeUndefined();
  });

  it('requests text/event-stream when opening a stream', async () => {
    const harness = createHarness(() => ({ status: 200, sse: '', chunkSize: 8 }));
    const iterator = harness.client.answerJobs.stream('job_x')[Symbol.asyncIterator]();
    await iterator.next();
    expect(harness.transport.requests[0]?.headers['Accept']).toBe('text/event-stream');
  });

  it('appends a caller User-Agent suffix', async () => {
    const harness = createHarness(() => ({ status: 200, json: searchResponse }), {
      overrides: { userAgentSuffix: 'my-app/2.0' },
    });
    await harness.client.search({ query: 'q' });
    expect(harness.transport.requests[0]?.headers['User-Agent']).toContain('my-app/2.0');
  });

  it('rejects an empty credential before anything else happens', () => {
    expect(() => createAerClient({ baseUrl: BASE_URL, auth: { apiKey: '' }, fetch: noopFetch })).toThrow(
      AerValidationError,
    );
    expect(() =>
      createAerClient({ baseUrl: BASE_URL, auth: { widgetSession: '' }, fetch: noopFetch }),
    ).toThrow(AerValidationError);
  });

  it('sends a widget session under its own header, never as a bearer token', async () => {
    const harness = createHarness(() => ({ status: 200, json: searchResponse }), {
      overrides: { auth: { widgetSession: 'widget-session-value' } },
    });
    await harness.client.search({ query: 'q' });
    const headers = harness.transport.requests[0]?.headers ?? {};
    expect(headers['X-AER-Widget-Session']).toBe('widget-session-value');
    expect(headers['Authorization']).toBeUndefined();
  });
});

describe('the operation surface is derived, not enumerated', () => {
  it('exposes an invoker for every generated public operation', async () => {
    const harness = createHarness(() => ({ status: 200, json: searchResponse }));
    expect(Object.keys(harness.client.operations).length).toBeGreaterThan(80);
    const result = await harness.client.operations['getSystemStatus']?.();
    expect(result).toEqual(searchResponse);
    expect(harness.transport.requests[0]?.url).toBe(`${BASE_URL}${operations['getSystemStatus'].path}`);
  });
});
