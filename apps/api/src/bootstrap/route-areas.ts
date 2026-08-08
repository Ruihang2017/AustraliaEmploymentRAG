/**
 * The A1 registration contract: route areas self-register by existing as a directory.
 *
 * `docs/prd/breakdown-plan.md` §2.1 **A1** — *"`apps/api`, `apps/worker`, `apps/web` register
 * routes/handlers/features by directory convention (autoload), never a shared central manifest."*
 * Seven product modules own an `apps/api/src/routes/<area>/**` subtree each, and none of them may
 * edit a file this module owns. Adding, renaming or removing an area therefore produces ZERO diff
 * outside that area's own directory. `docs/adr/0002-api-route-directory-autoload.md` records the
 * decision, the alternatives rejected and the consequences.
 *
 * WHY A HAND-ROLLED LOADER AND NOT `@fastify/autoload`. The plugin owns discovery, so it cannot
 * return `LoadedRouteArea[]`, cannot fail with an error naming BOTH colliding areas, and cannot
 * enforce the `area` config export. Every named failure mode the ticket's acceptance list demands is
 * reachable here in ~200 lines and one fewer dependency.
 *
 * SECURITY. `opts.root` is an `import()` target: whatever it points at is executed. It is a function
 * parameter with a compile-time default and MUST NEVER be plumbed to an environment variable, to a
 * configuration field or to anything reachable from a request. Tests are the only caller that passes
 * it. Do not "helpfully" make it configurable.
 */
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/**
 * Optional per-area configuration, exported from the area's `index.ts` as `export const area`.
 *
 * This interface is normative for every downstream module; it is reproduced verbatim from the
 * ticket's A1 contract §3.
 */
export interface RouteAreaConfig {
  /** URL prefix. Default: `/v1/<area-id>`. Areas under `internal/` default to `/internal/v1/<rest>`. */
  readonly prefix?: string;
  /** Admission profile. Default `'tenant'`. Meaning is bound by RUNT-02; a no-op until then. */
  readonly admission?: 'public' | 'probe' | 'tenant' | 'internal';
  /** Load order tiebreak within the lexicographic order. Default 0. Lower loads first. */
  readonly order?: number;
}

/** The admission profile of an area. A no-op until `RUNT-02` binds it. */
export type RouteAreaAdmission = NonNullable<RouteAreaConfig['admission']>;

/** What actually booted. `RUNT-08` and the conformance test enumerate this. */
export interface LoadedRouteArea {
  /** Path from the routes root, `/`-joined: `answers`, `internal/core`. */
  readonly areaId: string;
  /** The prefix the area was mounted under. */
  readonly prefix: string;
  readonly admission: RouteAreaAdmission;
  /**
   * How many route registrations the area produced. Known only after `app.ready()`.
   *
   * This counts what Fastify actually registered, which includes the automatic `HEAD` route it adds
   * for every `GET` (`exposeHeadRoutes`, on by default). One `app.get()` therefore reports 2. That
   * is deliberate: the number reflects the routing table, which is what a `RUNT-08`-style readiness
   * probe or an operator inventory wants to see.
   */
  readonly routeCount: number;
}

/** A route area directory that cannot be loaded. Never a silent skip. */
export class RouteAreaEntryError extends Error {
  readonly directory: string;
  constructor(directory: string, reason: string) {
    super(`route area "${directory}" cannot be loaded: ${reason}`);
    this.name = 'RouteAreaEntryError';
    this.directory = directory;
  }
}

/** Two areas claiming the same method+path. Last-wins is forbidden (A1 contract §4). */
export class RouteAreaCollisionError extends Error {
  readonly areaIds: readonly [string, string];
  readonly route: string;
  constructor(firstAreaId: string, secondAreaId: string, route: string) {
    super(
      `route collision: areas "${firstAreaId}" and "${secondAreaId}" both register ${route}. ` +
        'Last-wins registration is forbidden; give one of them a distinct path or prefix.',
    );
    this.name = 'RouteAreaCollisionError';
    this.areaIds = [firstAreaId, secondAreaId];
    this.route = route;
  }
}

/** Entry file names, in resolution order. `.ts` is the contract; `.js` keeps a future build working. */
const ENTRY_FILENAMES = ['index.ts', 'index.js'] as const;

const DEFAULT_ADMISSION: RouteAreaAdmission = 'tenant';

/** The default routes root: `apps/api/src/routes/`. Absent is legal — this ticket ships no areas. */
export function defaultRouteAreasRoot(): string {
  return fileURLToPath(new URL('../routes/', import.meta.url));
}

/** The prefix an area is mounted under when its `index.ts` exports no explicit `area.prefix`. */
export function derivePrefix(areaId: string): string {
  if (areaId === 'internal') return '/internal/v1';
  if (areaId.startsWith('internal/')) return `/internal/v1/${areaId.slice('internal/'.length)}`;
  return `/v1/${areaId}`;
}

interface DiscoveredArea {
  readonly areaId: string;
  readonly directory: string;
  readonly entryFile: string;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function entryFileOf(directory: string): Promise<string | null> {
  for (const name of ENTRY_FILENAMES) {
    const candidate = join(directory, name);
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

/**
 * Depth-first discovery.
 *
 * A directory holding an entry file IS an area, and its own subdirectories are that area's business
 * — they are not scanned. A directory WITHOUT an entry file is a container only if at least one
 * descendant resolves to an area (this is what makes `routes/internal/` legal); otherwise it is a
 * boot failure naming the directory, never a silent skip.
 */
export async function discoverRouteAreas(root: string): Promise<DiscoveredArea[]> {
  const rootPath = resolve(root);

  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch {
    // A missing (or unreadable) routes root means "no areas". This ticket ships no `routes/`
    // directory at all, so `buildApp` must boot with zero areas.
    return [];
  }

  const found: DiscoveredArea[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    found.push(...(await scanDirectory(join(rootPath, entry.name), entry.name)));
  }
  return found;
}

async function scanDirectory(directory: string, areaId: string): Promise<DiscoveredArea[]> {
  const entryFile = await entryFileOf(directory);
  if (entryFile !== null) {
    return [{ areaId, directory, entryFile }];
  }

  const children = await readdir(directory, { withFileTypes: true });
  const nested: DiscoveredArea[] = [];
  for (const child of children) {
    if (!child.isDirectory()) continue;
    nested.push(...(await scanDirectory(join(directory, child.name), `${areaId}/${child.name}`)));
  }

  if (nested.length === 0) {
    throw new RouteAreaEntryError(
      directory,
      `it contains no ${ENTRY_FILENAMES.join(' or ')} and no descendant directory that does`,
    );
  }
  return nested;
}

interface ResolvedArea extends DiscoveredArea {
  readonly plugin: FastifyPluginAsync;
  readonly prefix: string;
  readonly admission: RouteAreaAdmission;
  readonly order: number;
}

function readAreaConfig(directory: string, entryFile: string, value: unknown): RouteAreaConfig {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RouteAreaEntryError(directory, `${entryFile} exports \`area\` but it is not an object`);
  }
  const config = value as RouteAreaConfig;
  if (config.prefix !== undefined && (typeof config.prefix !== 'string' || !config.prefix.startsWith('/'))) {
    throw new RouteAreaEntryError(
      directory,
      `${entryFile} exports \`area.prefix\` that is not a string beginning with "/"`,
    );
  }
  if (config.order !== undefined && typeof config.order !== 'number') {
    throw new RouteAreaEntryError(directory, `${entryFile} exports \`area.order\` that is not a number`);
  }
  if (
    config.admission !== undefined &&
    !['public', 'probe', 'tenant', 'internal'].includes(config.admission)
  ) {
    throw new RouteAreaEntryError(
      directory,
      `${entryFile} exports an unknown \`area.admission\` value ${JSON.stringify(config.admission)}`,
    );
  }
  return config;
}

async function resolveArea(area: DiscoveredArea): Promise<ResolvedArea> {
  let module: Record<string, unknown>;
  try {
    module = (await import(/* @vite-ignore */ pathToFileURL(area.entryFile).href)) as Record<
      string,
      unknown
    >;
  } catch (cause) {
    throw new RouteAreaEntryError(
      area.directory,
      `importing ${area.entryFile} threw: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const plugin = module['default'];
  if (typeof plugin !== 'function') {
    throw new RouteAreaEntryError(
      area.directory,
      module['default'] === undefined
        ? `${area.entryFile} has no default export (it must default-export a Fastify plugin)`
        : `${area.entryFile} default-exports a ${typeof plugin}, not a Fastify plugin function`,
    );
  }

  const config = readAreaConfig(area.directory, area.entryFile, module['area']);
  return {
    ...area,
    plugin: plugin as FastifyPluginAsync,
    prefix: config.prefix ?? derivePrefix(area.areaId),
    admission: config.admission ?? DEFAULT_ADMISSION,
    order: config.order ?? 0,
  };
}

/**
 * Deterministic load order: `order` first (lower loads first), then the area id lexicographically.
 *
 * The ticket words `order` as a "tiebreak within the lexicographic order"; area ids are unique, so
 * under that reading the field could never fire and would be dead. The meaningful reading is
 * implemented here and raised as plan OQ-3 — it is normative for seven modules.
 */
function compareAreas(a: ResolvedArea, b: ResolvedArea): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.areaId < b.areaId ? -1 : a.areaId > b.areaId ? 1 : 0;
}

export interface RegisterRouteAreasOptions {
  /** Directory to scan. TESTS ONLY — see the security note at the top of this file. */
  readonly root?: string;
}

/**
 * Discovers, orders and registers every route area, then awaits `app.ready()`.
 *
 * `ready()` is awaited here because Fastify defers `register`: the route count and the collision
 * check both need the deferred registration to have run. That is also what makes "a collision fails
 * boot" literally true — the rejection comes out of this call, before the server ever listens.
 *
 * NOTHING may be registered on `app` after this returns; `buildApp` therefore keeps this as its last
 * step (d), leaving the (c)→(d) gap as `RUNT-02`'s single obvious insertion point.
 */
export async function registerRouteAreas(
  app: FastifyInstance,
  opts: RegisterRouteAreasOptions = {},
): Promise<readonly LoadedRouteArea[]> {
  const root = opts.root ?? defaultRouteAreasRoot();
  const discovered = await discoverRouteAreas(root);
  const resolved = (await Promise.all(discovered.map(resolveArea))).sort(compareAreas);

  // PER CALL, never module level. Vitest runs many `buildApp()` calls in one process, and
  // `app.register` is deferred to `ready()`, so any state outside this closure is either shared
  // across unrelated apps or already stale when the `onRoute` hook fires.
  const owners = new Map<string, string>();
  const routeCounts = new Map<string, number>();

  for (const area of resolved) {
    routeCounts.set(area.areaId, 0);
    await app.register(
      async (scope: FastifyInstance) => {
        // Registered INSIDE the area's encapsulated scope, so it only sees that area's routes.
        scope.addHook('onRoute', (route: { method: string | string[]; url: string }) => {
          const methods = Array.isArray(route.method) ? route.method : [route.method];
          for (const method of methods) {
            const key = `${method} ${route.url}`;
            const owner = owners.get(key);
            if (owner !== undefined && owner !== area.areaId) {
              throw new RouteAreaCollisionError(owner, area.areaId, key);
            }
            owners.set(key, area.areaId);
          }
          routeCounts.set(area.areaId, (routeCounts.get(area.areaId) ?? 0) + 1);
        });
        await scope.register(area.plugin);
      },
      { prefix: area.prefix },
    );
  }

  await app.ready();

  return Object.freeze(
    resolved.map((area) =>
      Object.freeze({
        areaId: area.areaId,
        prefix: area.prefix,
        admission: area.admission,
        routeCount: routeCounts.get(area.areaId) ?? 0,
      }),
    ),
  );
}
