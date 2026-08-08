/**
 * The A1 registration contract, asserted (ticket acceptance items 1–4).
 *
 * Every fixture area is one new directory under a `mkdtemp` root; nothing is written inside the
 * repository, so `git status --porcelain` stays clean.
 */
import { describe, expect, it } from 'vitest';

import {
  RouteAreaCollisionError,
  RouteAreaEntryError,
  derivePrefix,
  discoverRouteAreas,
} from '../src/bootstrap/route-areas.js';
import { buildApp } from '../src/app.js';
import {
  bootFailureFor,
  pingAreaSource,
  testConfig,
  withTemporaryRouteAreas,
} from './route-area-conformance.js';

describe('A1: a route area is one new directory', () => {
  it('serves an area at its derived prefix with no diff to any tracked file', async () => {
    await withTemporaryRouteAreas([{ areaId: 'alpha', source: pingAreaSource('alpha') }], async ({ app, areas }) => {
      const res = await app.inject({ method: 'GET', url: '/v1/alpha/ping' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ marker: 'alpha' });
      // routeCount is 2 for one `app.get`: Fastify registers the automatic HEAD route alongside it.
      expect(areas).toEqual([
        { areaId: 'alpha', prefix: '/v1/alpha', admission: 'tenant', routeCount: 2 },
      ]);
    });
  });

  it('derives /v1/<area-id>, /internal/v1/<rest>, and honours an explicit area.prefix', async () => {
    expect(derivePrefix('alpha')).toBe('/v1/alpha');
    expect(derivePrefix('internal/core')).toBe('/internal/v1/core');
    expect(derivePrefix('internal')).toBe('/internal/v1');

    await withTemporaryRouteAreas(
      [
        { areaId: 'alpha', source: pingAreaSource('alpha') },
        { areaId: 'internal/core', source: pingAreaSource('core') },
        {
          areaId: 'health',
          source: `${pingAreaSource('health', '/live')}export const area = { prefix: '/health', admission: 'probe' };\n`,
        },
      ],
      async ({ app, areas }) => {
        expect((await app.inject({ method: 'GET', url: '/v1/alpha/ping' })).statusCode).toBe(200);
        expect((await app.inject({ method: 'GET', url: '/internal/v1/core/ping' })).statusCode).toBe(200);
        expect((await app.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);
        // The explicit prefix wins: the derived one must NOT also be mounted.
        expect((await app.inject({ method: 'GET', url: '/v1/health/live' })).statusCode).toBe(404);
        expect(areas.map((a) => `${a.areaId}=${a.prefix}/${a.admission}`)).toEqual([
          'alpha=/v1/alpha/tenant',
          'health=/health/probe',
          'internal/core=/internal/v1/core/tenant',
        ]);
      },
    );
  });

  it('nests areas under a container directory that has no entry file of its own', async () => {
    const root = await discoverRouteAreasIn([
      { areaId: 'internal/core', source: pingAreaSource('core') },
      { areaId: 'internal/admin', source: pingAreaSource('admin') },
    ]);
    expect(root.map((a) => a.areaId).sort()).toEqual(['internal/admin', 'internal/core']);
  });
});

describe('A1: failures name the offender and are never a silent skip', () => {
  it('fails boot with an error naming BOTH areas and the path on a method+path collision', async () => {
    const error = await bootFailureFor([
      { areaId: 'alpha', source: pingAreaSource('alpha', '/x') },
      { areaId: 'beta', source: `${pingAreaSource('beta', '/x')}export const area = { prefix: '/v1/alpha' };\n` },
    ]);
    expect(error).toBeInstanceOf(RouteAreaCollisionError);
    const message = (error as Error).message;
    expect(message).toContain('alpha');
    expect(message).toContain('beta');
    expect(message).toContain('GET /v1/alpha/x');
  });

  it('fails boot naming the directory when it holds no index.ts', async () => {
    const error = await bootFailureFor([
      { areaId: 'alpha', source: pingAreaSource('alpha') },
      { areaId: 'broken', source: 'export default 1;\n', entryFilename: 'routes.ts' },
    ]);
    expect(error).toBeInstanceOf(RouteAreaEntryError);
    expect((error as RouteAreaEntryError).directory).toMatch(/broken$/);
    expect((error as Error).message).toContain('broken');
  });

  it('fails boot naming the directory when index.ts has no default export', async () => {
    const error = await bootFailureFor([
      { areaId: 'nodefault', source: 'export const area = { order: 0 };\n' },
    ]);
    expect(error).toBeInstanceOf(RouteAreaEntryError);
    expect((error as Error).message).toContain('nodefault');
    expect((error as Error).message).toContain('no default export');
  });

  it('fails boot when the default export is not a function', async () => {
    const error = await bootFailureFor([{ areaId: 'notafn', source: 'export default 42;\n' }]);
    expect(error).toBeInstanceOf(RouteAreaEntryError);
    expect((error as Error).message).toContain('notafn');
  });

  it('fails boot when `area` is exported but is not a valid config', async () => {
    const error = await bootFailureFor([
      { areaId: 'badcfg', source: `${pingAreaSource('badcfg')}export const area = { prefix: 'v1-no-slash' };\n` },
    ]);
    expect(error).toBeInstanceOf(RouteAreaEntryError);
    expect((error as Error).message).toContain('badcfg');
  });
});

describe('A1: deterministic load order', () => {
  it('produces an identical LoadedRouteArea[] across two boots of the same fixture set', async () => {
    const fixtures = [
      { areaId: 'gamma', source: pingAreaSource('gamma') },
      { areaId: 'alpha', source: pingAreaSource('alpha') },
      { areaId: 'beta', source: pingAreaSource('beta') },
    ];
    const first = await withTemporaryRouteAreas(fixtures, async ({ areas }) => [...areas]);
    const second = await withTemporaryRouteAreas(fixtures, async ({ areas }) => [...areas]);
    expect(first).toEqual(second);
    expect(first.map((a) => a.areaId)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('lets area.order move a lexicographically-later area to the front', async () => {
    await withTemporaryRouteAreas(
      [
        { areaId: 'alpha', source: pingAreaSource('alpha') },
        { areaId: 'zulu', source: `${pingAreaSource('zulu')}export const area = { order: -1 };\n` },
      ],
      async ({ areas }) => {
        expect(areas.map((a) => a.areaId)).toEqual(['zulu', 'alpha']);
      },
    );
  });
});

describe('A1: an absent routes root is legal', () => {
  it('boots with zero areas when the routes directory does not exist', async () => {
    const { app, areas } = await buildApp(testConfig(), {
      routesRoot: '/taxrag-definitely-not-a-directory',
    });
    try {
      expect(areas).toEqual([]);
      expect((await app.inject({ method: 'GET', url: '/v1/anything' })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('boots with zero areas against the real (absent) apps/api/src/routes directory', async () => {
    const { app, areas } = await buildApp(testConfig());
    try {
      expect(areas).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

/** Discovery-only helper: no Fastify instance, so the container-directory rule can be asserted alone. */
async function discoverRouteAreasIn(
  fixtures: readonly { areaId: string; source: string }[],
): Promise<{ areaId: string }[]> {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'taxrag-discover-'));
  try {
    for (const fixture of fixtures) {
      const directory = join(root, ...fixture.areaId.split('/'));
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'index.ts'), fixture.source, 'utf8');
    }
    return [...(await discoverRouteAreas(root))];
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
