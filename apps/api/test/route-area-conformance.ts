/**
 * The executable form of the A1 registration contract (ticket deliverable 11).
 *
 * Exported so a downstream module (`RUNT-08` and the seven product modules) can assert its own area
 * boots under this loader without copying the setup. The whole point of A1 is that a route area is
 * ONE new directory: this harness creates exactly that, at test time, under `os.tmpdir()` — never
 * inside the repository, so `git status --porcelain` stays clean after a full run.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';

import type { ApiConfig } from '../src/bootstrap/config.js';
import { CONFIG_DEFAULTS } from '../src/bootstrap/config.js';
import type { LoadedRouteArea } from '../src/bootstrap/route-areas.js';
import { buildApp } from '../src/app.js';

/** One fixture route area: a directory id and the source of its `index.ts`. */
export interface RouteAreaFixture {
  /** Path under the fixture root, `/`-separated: `alpha`, `internal/core`. */
  readonly areaId: string;
  /**
   * The contents of the area's entry file. It is imported by the loader at boot, so it must be
   * self-contained: no bare-specifier imports (the fixture root is outside any `node_modules`).
   */
  readonly source: string;
  /** Written instead of `index.ts` — used to prove a directory with no entry file fails boot. */
  readonly entryFilename?: string;
}

/** A minimal `ApiConfig` for tests. Real config loading is `config.test.ts`'s business. */
export function testConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    profile: 'test',
    host: CONFIG_DEFAULTS.host,
    port: 0,
    bodyLimitBytes: CONFIG_DEFAULTS.bodyLimitBytes,
    shutdownTimeoutMs: CONFIG_DEFAULTS.shutdownTimeoutMs,
    environmentLabel: CONFIG_DEFAULTS.environmentLabel,
    ignoredKeys: [],
    ...overrides,
  };
}

/** The source of a route area that answers `GET <prefix>/ping` with a JSON body. */
export function pingAreaSource(marker: string, path = '/ping'): string {
  return [
    'const routes = async (app) => {',
    `  app.get(${JSON.stringify(path)}, async () => ({ marker: ${JSON.stringify(marker)} }));`,
    '};',
    'export default routes;',
    '',
  ].join('\n');
}

/** Writes the fixture areas under a fresh temporary root and returns that root. */
async function writeFixtures(areas: readonly RouteAreaFixture[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'taxrag-route-areas-'));
  for (const area of areas) {
    const directory = join(root, ...area.areaId.split('/'));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, area.entryFilename ?? 'index.ts'), area.source, 'utf8');
  }
  return root;
}

export interface ConformanceContext {
  readonly app: FastifyInstance;
  readonly areas: readonly LoadedRouteArea[];
  /** The temporary fixture root, for assertions that need the path. */
  readonly root: string;
}

/**
 * Boots an app over throw-away fixture areas, runs `body`, and always tears both down.
 *
 * The temporary tree is removed in a `finally`, as is the Fastify instance, so a failing assertion
 * cannot leave a directory or an open handle behind.
 */
export async function withTemporaryRouteAreas<T>(
  areas: readonly RouteAreaFixture[],
  body: (context: ConformanceContext) => Promise<T>,
): Promise<T> {
  const root = await writeFixtures(areas);
  let built: { app: FastifyInstance; areas: readonly LoadedRouteArea[] } | undefined;
  try {
    built = await buildApp(testConfig(), { routesRoot: root });
    return await body({ app: built.app, areas: built.areas, root });
  } finally {
    if (built) await built.app.close();
    await rm(root, { recursive: true, force: true });
  }
}

/**
 * Boots the fixture areas expecting FAILURE, and returns the thrown error.
 *
 * A boot that unexpectedly succeeds is itself the failure: an area problem must never be a silent
 * skip, so this throws rather than returning `undefined`.
 */
export async function bootFailureFor(areas: readonly RouteAreaFixture[]): Promise<unknown> {
  const root = await writeFixtures(areas);
  const NO_FAILURE = Symbol('no failure');
  let outcome: unknown = NO_FAILURE;
  try {
    const built = await buildApp(testConfig(), { routesRoot: root });
    await built.app.close();
  } catch (error) {
    outcome = error;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  if (outcome === NO_FAILURE) {
    throw new Error('expected boot to fail, but the app booted successfully');
  }
  return outcome;
}
