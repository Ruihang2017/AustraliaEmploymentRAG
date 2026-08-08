/**
 * PRD §16.1 — *"Every response includes `request_id`."* Asserted for 200, 400, 404 and 500, plus the
 * inbound-echo policy that makes echoing a caller-supplied id safe.
 */
import { describe, expect, it } from 'vitest';

import {
  INBOUND_REQUEST_ID_PATTERN,
  injectRequestId,
  isAcceptableInboundRequestId,
  resolveRequestId,
} from '../src/bootstrap/request-id.js';
import type { ConformanceContext } from './route-area-conformance.js';
import { withTemporaryRouteAreas } from './route-area-conformance.js';

/** One area covering all four response classes the acceptance list names. */
const PROBE_AREA = [
  'const routes = async (app) => {',
  "  app.get('/ok', async () => ({ ok: true }));",
  "  app.post('/validated', { schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } }, async () => ({ ok: true }));",
  "  app.get('/boom', async () => { throw new Error('boom'); });",
  '};',
  'export default routes;',
  '',
].join('\n');

const AREA_ID = 'probe';

async function withProbeApp<T>(body: (context: ConformanceContext) => Promise<T>): Promise<T> {
  return withTemporaryRouteAreas([{ areaId: AREA_ID, source: PROBE_AREA }], body);
}

function bodyRequestId(payload: Record<string, unknown>): unknown {
  const error = payload['error'];
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    return (error as Record<string, unknown>)['request_id'];
  }
  return payload['request_id'];
}

describe('request_id on every response', () => {
  it('carries a matching x-request-id header and body request_id on 200, 400, 404 and 500', async () => {
    await withProbeApp(async ({ app }) => {
      const cases = [
        await app.inject({ method: 'GET', url: '/v1/probe/ok' }),
        await app.inject({ method: 'POST', url: '/v1/probe/validated', payload: {} }),
        await app.inject({ method: 'GET', url: '/v1/nothing-here' }),
        await app.inject({ method: 'GET', url: '/v1/probe/boom' }),
      ];
      expect(cases.map((r) => r.statusCode)).toEqual([200, 400, 404, 500]);

      for (const res of cases) {
        const header = res.headers['x-request-id'];
        expect(typeof header, `status ${res.statusCode} has no x-request-id header`).toBe('string');
        expect(header as string).toMatch(INBOUND_REQUEST_ID_PATTERN);
        const payload = res.json() as Record<string, unknown>;
        expect(bodyRequestId(payload), `status ${res.statusCode} body has no request_id`).toBe(header);
        // content-length must describe the rewritten bytes exactly.
        expect(Number(res.headers['content-length'])).toBe(res.rawPayload.length);
      }
    });
  });

  it('puts the id at error.request_id and adds no additional top-level key on an error body', async () => {
    await withProbeApp(async ({ app }) => {
      const res = await app.inject({ method: 'GET', url: '/v1/probe/boom' });
      const payload = res.json() as Record<string, unknown>;
      expect(Object.keys(payload)).toEqual(['error']);
      expect(payload).not.toHaveProperty('request_id');
      expect((payload['error'] as Record<string, unknown>)['request_id']).toMatch(
        INBOUND_REQUEST_ID_PATTERN,
      );
    });
  });

  it('gives two requests two different ids', async () => {
    await withProbeApp(async ({ app }) => {
      const first = await app.inject({ method: 'GET', url: '/v1/probe/ok' });
      const second = await app.inject({ method: 'GET', url: '/v1/probe/ok' });
      expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
    });
  });
});

describe('inbound x-request-id policy', () => {
  it('echoes a well-formed inbound id', async () => {
    await withProbeApp(async ({ app }) => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/probe/ok',
        headers: { 'x-request-id': 'req_abcdefgh12' },
      });
      expect(res.headers['x-request-id']).toBe('req_abcdefgh12');
      expect((res.json() as Record<string, unknown>)['request_id']).toBe('req_abcdefgh12');
    });
  });

  it.each([
    ['<script>alert(1)</script>', 'markup'],
    ['req_short', 'too short'],
    [`req_${'a'.repeat(200)}`, 'too long'],
    ['req_abcdefgh\r\nx-evil: 1', 'CRLF injection'],
    ['req_abcdefgh 12', 'contains a space'],
    ['xreq_abcdefgh12', 'unanchored prefix'],
    ['req_abcdefgh12\n', 'trailing newline'],
    ['req_abcdefg!2', 'disallowed character'],
    ['', 'empty'],
  ])('discards %s (%s) and mints a fresh id', async (inbound) => {
    await withProbeApp(async ({ app }) => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/probe/ok',
        headers: { 'x-request-id': inbound },
      });
      const header = res.headers['x-request-id'] as string;
      expect(header).not.toBe(inbound);
      expect(header).toMatch(INBOUND_REQUEST_ID_PATTERN);
    });
  });

  it('rejects a repeated header (an array) rather than picking one of the values', () => {
    expect(isAcceptableInboundRequestId(['req_abcdefgh12', 'req_zzzzzzzz99'])).toBe(false);
    expect(resolveRequestId(['req_abcdefgh12'], () => 'req_minted00')).toBe('req_minted00');
  });

  it('accepts exactly the boundary lengths of the pattern', () => {
    expect(isAcceptableInboundRequestId(`req_${'a'.repeat(8)}`)).toBe(true);
    expect(isAcceptableInboundRequestId(`req_${'a'.repeat(64)}`)).toBe(true);
    expect(isAcceptableInboundRequestId(`req_${'a'.repeat(7)}`)).toBe(false);
    expect(isAcceptableInboundRequestId(`req_${'a'.repeat(65)}`)).toBe(false);
  });
});

describe('injectRequestId', () => {
  it('adds a top-level request_id to a plain success body', () => {
    expect(injectRequestId('{"ok":true}', 'req_x')).toBe('{"ok":true,"request_id":"req_x"}');
  });

  it('adds error.request_id and nothing at the top level to an error envelope', () => {
    const next = injectRequestId('{"error":{"code":"INVALID_REQUEST"}}', 'req_x');
    expect(next).not.toBeNull();
    const parsed = JSON.parse(next as string) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['error']);
    expect((parsed['error'] as Record<string, unknown>)['request_id']).toBe('req_x');
  });

  it.each([
    ['not json at all', 'unparseable'],
    ['[1,2,3]', 'array'],
    ['"a string"', 'scalar string'],
    ['42', 'scalar number'],
    ['null', 'null'],
  ])('leaves %s (%s) untouched', (payload) => {
    expect(injectRequestId(payload, 'req_x')).toBeNull();
  });

  it('does not overwrite an id a route already set', () => {
    expect(injectRequestId('{"request_id":"req_existing"}', 'req_new')).toBeNull();
    expect(injectRequestId('{"error":{"request_id":"req_existing"}}', 'req_new')).toBeNull();
  });
});
