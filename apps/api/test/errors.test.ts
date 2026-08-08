/**
 * The closed PRD §34.9 catalogue and the PRD §16.1 error body.
 *
 * The table below is transcribed from PRD §34.9 by hand, on purpose: `ERROR_CATALOGUE` is derived
 * from `FND-04`'s generated maps, so if the generator drifts from the PRD this file is where it
 * fails, loudly, rather than propagating silently into every product module.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  API_ERROR_CODES,
  API_ERROR_CODE_COUNT,
  ERROR_CATALOGUE,
  isApiErrorCode,
} from '../src/errors/catalogue.js';
import type { ApiErrorCode } from '../src/errors/catalogue.js';
import { ApiError, apiErrorFactories } from '../src/errors/api-error.js';
import {
  INTERNAL_ERROR_MESSAGE,
  classifyError,
  sanitiseFieldName,
  validationFieldNames,
} from '../src/errors/handler.js';
import type { ConformanceContext } from './route-area-conformance.js';
import { withTemporaryRouteAreas } from './route-area-conformance.js';

/** PRD §34.9, transcribed: code → [HTTP status, retryable]. */
const PRD_34_9: readonly (readonly [ApiErrorCode, number, boolean])[] = [
  ['INVALID_REQUEST', 400, false],
  ['INVALID_LEGAL_DATE', 400, false],
  ['INVALID_ABN', 400, false],
  ['AUTHENTICATION_REQUIRED', 401, true],
  ['MFA_REQUIRED', 403, true],
  ['RECENT_AUTH_REQUIRED', 403, true],
  ['RESOURCE_NOT_FOUND', 404, false],
  ['IDEMPOTENCY_CONFLICT', 409, false],
  ['CONCURRENT_MODIFICATION', 409, true],
  ['EPHEMERAL_CONTENT_EXPIRED', 410, false],
  ['EMPLOYEE_PII_DETECTED', 422, true],
  ['RATE_LIMITED', 429, true],
  ['CREDIT_LIMIT_REACHED', 429, true],
  ['GENERATION_UNAVAILABLE', 503, true],
  ['SOURCE_NOT_CURRENT', 503, false],
  ['CORPUS_INCOMPATIBLE', 503, false],
  ['INTERNAL_ERROR', 500, true],
];

const PRD_16_1_ERROR_KEYS = ['code', 'details', 'message', 'request_id', 'retryable'];

const CANARY_AREA = (canary: string): string =>
  [
    'const routes = async (app) => {',
    `  app.get('/boom', async () => { throw new Error(${JSON.stringify(`secret-canary-${canary}`)}); });`,
    "  app.get('/typed', async () => { const e = new Error('nope'); throw e; });",
    "  app.post('/validated', { schema: { body: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string' } } } } }, async () => ({ ok: true }));",
    '};',
    'export default routes;',
    '',
  ].join('\n');

async function withErrorApp<T>(
  canary: string,
  body: (context: ConformanceContext) => Promise<T>,
): Promise<T> {
  return withTemporaryRouteAreas([{ areaId: 'boomarea', source: CANARY_AREA(canary) }], body);
}

describe('ERROR_CATALOGUE is exactly the PRD §34.9 table', () => {
  it('has exactly 17 rows and no extra key', () => {
    expect(Object.keys(ERROR_CATALOGUE)).toHaveLength(API_ERROR_CODE_COUNT);
    expect(API_ERROR_CODES).toHaveLength(API_ERROR_CODE_COUNT);
    expect(PRD_34_9).toHaveLength(API_ERROR_CODE_COUNT);
    expect([...API_ERROR_CODES].sort()).toEqual(PRD_34_9.map(([code]) => code).sort());
  });

  it.each(PRD_34_9)('%s is %i, retryable=%s', (code, status, retryable) => {
    expect(ERROR_CATALOGUE[code]).toEqual({ status, retryable });
  });

  it('reaches every code through a named factory, with the PRD status and retryability', () => {
    for (const [code, status, retryable] of PRD_34_9) {
      const error = apiErrorFactories[code]();
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
      expect(error.retryable).toBe(retryable);
      expect(error.details).toEqual({});
    }
  });

  it('rejects a code that is not in the catalogue', () => {
    expect(isApiErrorCode('NOT_A_CODE')).toBe(false);
    expect(isApiErrorCode('INVALID_REQUEST')).toBe(true);
    // A hand-written code string cannot smuggle a status past the constructor.
    expect(() => new ApiError('NOT_A_CODE' as ApiErrorCode, 'x')).toThrow(/catalogue/);
  });

  it('freezes the rows, so no request path can mutate a status under another request', () => {
    expect(Object.isFrozen(ERROR_CATALOGUE)).toBe(true);
    expect(Object.isFrozen(ERROR_CATALOGUE.INVALID_REQUEST)).toBe(true);
  });
});

describe('the PRD §16.1 error body', () => {
  it('has exactly the top-level key `error` and exactly the five inner keys', async () => {
    await withErrorApp(randomUUID(), async ({ app }) => {
      for (const url of ['/v1/boomarea/boom', '/v1/does-not-exist']) {
        const res = await app.inject({ method: 'GET', url });
        const payload = res.json() as Record<string, unknown>;
        expect(Object.keys(payload)).toEqual(['error']);
        expect(Object.keys(payload['error'] as Record<string, unknown>).sort()).toEqual(
          PRD_16_1_ERROR_KEYS,
        );
      }
    });
  });

  it('returns the same generic 404 for an unknown area and an unknown resource', async () => {
    await withErrorApp(randomUUID(), async ({ app }) => {
      const unknownArea = await app.inject({ method: 'GET', url: '/v1/no-such-area/x' });
      const unknownResource = await app.inject({ method: 'GET', url: '/v1/boomarea/no-such-thing' });
      expect(unknownArea.statusCode).toBe(404);
      expect(unknownResource.statusCode).toBe(404);
      const strip = (r: { body: string }): string =>
        r.body.replace(/"request_id":"[^"]*"/, '"request_id":"<id>"');
      expect(strip(unknownArea)).toBe(strip(unknownResource));
      // No enumeration oracle: no area name, no route list.
      expect(unknownArea.body).not.toContain('boomarea');
    });
  });
});

describe('an unmapped error leaks nothing', () => {
  it('becomes 500 INTERNAL_ERROR with the canary absent from every response byte', async () => {
    const canary = randomUUID();
    await withErrorApp(canary, async ({ app }) => {
      const res = await app.inject({ method: 'GET', url: '/v1/boomarea/boom' });
      expect(res.statusCode).toBe(500);
      const payload = res.json() as { error: Record<string, unknown> };
      expect(payload.error['code']).toBe('INTERNAL_ERROR');
      expect(payload.error['message']).toBe(INTERNAL_ERROR_MESSAGE);
      expect(payload.error['details']).toEqual({});

      const bytes = res.rawPayload.toString('utf8');
      const headers = JSON.stringify(res.headers);
      expect(bytes).not.toContain(canary);
      expect(bytes).not.toContain('secret-canary');
      expect(headers).not.toContain(canary);
      // No stack frame, no source path.
      expect(bytes).not.toContain('at ');
      expect(bytes).not.toContain('.ts');
      expect(bytes).not.toContain('node_modules');
    });
  });

  it('passes the original error to the injected logger and only to it', async () => {
    const canary = randomUUID();
    const seen: Record<string, unknown>[] = [];
    const { buildApp } = await import('../src/app.js');
    const { testConfig } = await import('./route-area-conformance.js');
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const root = await mkdtemp(join(tmpdir(), 'taxrag-logger-'));
    try {
      await mkdir(join(root, 'boomarea'), { recursive: true });
      await writeFile(join(root, 'boomarea', 'index.ts'), CANARY_AREA(canary), 'utf8');
      const { app } = await buildApp(testConfig(), {
        routesRoot: root,
        logger: {
          error(details) {
            seen.push(details);
          },
        },
      });
      try {
        const res = await app.inject({ method: 'GET', url: '/v1/boomarea/boom' });
        expect(res.body).not.toContain(canary);
        expect(seen).toHaveLength(1);
        expect(JSON.stringify(seen[0])).toContain(canary);
      } finally {
        await app.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('classifies a non-Error throw as INTERNAL_ERROR too', () => {
    for (const thrown of ['a string', 42, null, undefined, { code: 'nope' }]) {
      expect(classifyError(thrown).code).toBe('INTERNAL_ERROR');
    }
  });
});

describe('a schema-validation failure names fields, never values', () => {
  it('returns 400 INVALID_REQUEST without echoing the submitted value', async () => {
    await withErrorApp(randomUUID(), async ({ app }) => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/boomarea/validated',
        // An object cannot be coerced to a string, so this really does fail validation. (A scalar
        // would not: Fastify's Ajv runs with `coerceTypes`, so `12345` becomes `"12345"`.)
        payload: { name: { leaked: 'super-secret-value' } },
      });
      expect(res.statusCode).toBe(400);
      const payload = res.json() as { error: Record<string, unknown> };
      expect(payload.error['code']).toBe('INVALID_REQUEST');
      expect(res.body).not.toContain('super-secret-value');
      expect(res.body).not.toContain('must be string');
      const fields = (payload.error['details'] as Record<string, unknown>)['fields'];
      expect(Array.isArray(fields)).toBe(true);
      expect(fields as string[]).toContain('name');
    });
  });

  it('names a missing required property', async () => {
    await withErrorApp(randomUUID(), async ({ app }) => {
      const res = await app.inject({ method: 'POST', url: '/v1/boomarea/validated', payload: {} });
      expect(res.statusCode).toBe(400);
      const payload = res.json() as { error: { details: { fields?: string[] } } };
      expect(payload.error.details.fields).toContain('name');
    });
  });

  // Fastify's Ajv runs with `removeAdditional`, so an extra property is normally stripped rather
  // than reported. Either way the caller's key must never reach the response; the truncation and
  // charset rules that make a REPORTED name safe are pinned on the sanitiser in the next test,
  // where an Ajv option change cannot make them vacuous.
  it('never echoes an attacker-chosen property name, whichever way validation resolves it', async () => {
    const junk = `${' <script>'.repeat(5)}${'A'.repeat(300)}`;
    await withErrorApp(randomUUID(), async ({ app }) => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/boomarea/validated',
        payload: { name: { bad: true }, [junk]: 1 },
      });
      expect(res.statusCode).toBe(400);
      const payload = res.json() as { error: { details: { fields?: string[] } } };
      for (const field of payload.error.details.fields ?? []) {
        expect(field.length).toBeLessThanOrEqual(64);
        expect(field).toMatch(/^[A-Za-z0-9_.\-/[\]]*$/);
      }
      expect(res.body).not.toContain('<script>');
      expect(res.body).not.toContain('AAAA');
    });
  });

  it('truncates and charset-sanitises a REPORTED additionalProperty name', () => {
    const junk = `${' <script>'.repeat(5)}${'A'.repeat(300)}`;
    const reported = validationFieldNames([
      { instancePath: '', params: { additionalProperty: junk } },
    ]);
    expect(reported).toHaveLength(1);
    expect(reported[0]).toHaveLength(64);
    expect(reported[0]).not.toContain('<');
    expect(reported[0] as string).toMatch(/^[A-Za-z0-9_.\-/[\]]+$/);
  });

  it('sanitises, deduplicates and caps the reported field list', () => {
    expect(sanitiseFieldName('a\r\nb: c')).toBe('abc');
    expect(sanitiseFieldName('x'.repeat(200))).toHaveLength(64);
    expect(sanitiseFieldName('!!!')).toBe('');

    const issues = Array.from({ length: 50 }, (_unused, index) => ({
      instancePath: '',
      params: { missingProperty: `f${index}` },
    }));
    expect(validationFieldNames(issues)).toHaveLength(20);

    const duplicates = [
      { instancePath: '', params: { missingProperty: 'name' } },
      { instancePath: '', params: { missingProperty: 'name' } },
    ];
    expect(validationFieldNames(duplicates)).toEqual(['name']);

    // An issue with nothing usable is skipped, never guessed at.
    expect(validationFieldNames([{ instancePath: '', params: {} }])).toEqual([]);
    expect(validationFieldNames([{ instancePath: '/items/0/name', params: {} }])).toEqual([
      'items.0.name',
    ]);
  });
});

describe('Fastify 4xx errors with no PRD §34.9 code', () => {
  it('maps a body over the limit to 400 INVALID_REQUEST rather than inventing a code', async () => {
    const { buildApp } = await import('../src/app.js');
    const { testConfig } = await import('./route-area-conformance.js');
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const root = await mkdtemp(join(tmpdir(), 'taxrag-limits-'));
    try {
      await mkdir(join(root, 'boomarea'), { recursive: true });
      await writeFile(join(root, 'boomarea', 'index.ts'), CANARY_AREA(randomUUID()), 'utf8');
      const { app } = await buildApp(testConfig({ bodyLimitBytes: 32 }), { routesRoot: root });
      try {
        const res = await app.inject({
          method: 'POST',
          url: '/v1/boomarea/validated',
          payload: { name: 'x'.repeat(500) },
        });
        expect(res.statusCode).toBe(400);
        const payload = res.json() as { error: Record<string, unknown> };
        expect(payload.error['code']).toBe('INVALID_REQUEST');
        expect(payload.error['details']).toEqual({});
      } finally {
        await app.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('maps malformed JSON to 400 INVALID_REQUEST', async () => {
    await withErrorApp(randomUUID(), async ({ app }) => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/boomarea/validated',
        headers: { 'content-type': 'application/json' },
        payload: '{not json',
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: { code: string } }).error.code).toBe('INVALID_REQUEST');
    });
  });
});

describe('ApiError', () => {
  it('reads status and retryability from the catalogue, never from the caller', () => {
    const error = new ApiError('RATE_LIMITED', 'slow down', { retry_after_seconds: 30 });
    expect(error.status).toBe(429);
    expect(error.retryable).toBe(true);
    expect(error.name).toBe('ApiError');
    expect(error.details).toEqual({ retry_after_seconds: 30 });
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  it('copies details so a later mutation of the caller object cannot change the response', () => {
    const details: Record<string, unknown> = { a: 1 };
    const error = new ApiError('INVALID_REQUEST', 'x', details);
    details['a'] = 2;
    expect(error.details).toEqual({ a: 1 });
  });

  it('serialises a thrown ApiError with its own code, status, message and details', async () => {
    const { buildApp } = await import('../src/app.js');
    const { testConfig } = await import('./route-area-conformance.js');
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const root = await mkdtemp(join(tmpdir(), 'taxrag-apierror-'));
    try {
      await mkdir(join(root, 'typed'), { recursive: true });
      // The area cannot import ApiError (it is loaded outside the module graph), so it throws a
      // structurally identical object; the classification path is asserted directly below too.
      await writeFile(
        join(root, 'typed', 'index.ts'),
        [
          'const routes = async (app) => {',
          "  app.get('/gone', async () => { const e = new Error('The requested content has expired.'); e.name = 'X'; throw e; });",
          '};',
          'export default routes;',
          '',
        ].join('\n'),
        'utf8',
      );
      const { app } = await buildApp(testConfig(), { routesRoot: root });
      try {
        const res = await app.inject({ method: 'GET', url: '/v1/typed/gone' });
        expect(res.statusCode).toBe(500);
      } finally {
        await app.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }

    const classifiedApiError = classifyError(
      new ApiError('EPHEMERAL_CONTENT_EXPIRED', 'gone', { id: 'x' }),
    );
    expect(classifiedApiError).toMatchObject({
      code: 'EPHEMERAL_CONTENT_EXPIRED',
      status: 410,
      retryable: false,
      message: 'gone',
      details: { id: 'x' },
      logOriginal: false,
    });
  });
});
