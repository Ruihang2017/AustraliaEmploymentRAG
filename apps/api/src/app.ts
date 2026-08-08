/**
 * `buildApp` — the composition root of the API process (ticket deliverable 8).
 *
 * The order below is FIXED by the ticket and is the contract `RUNT-02` builds against. Do not
 * reorder the steps; add to the marked gap instead.
 *
 * Note that `src/index.ts` deliberately stays `export {};`: `tools/workspace-assertions.mjs`
 * asserts every workspace member's entry file is byte-for-byte empty, so the app's surface lives
 * here and is imported by path.
 */
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import type { ApiConfig } from './bootstrap/config.js';
import type { LoadedRouteArea } from './bootstrap/route-areas.js';
import { registerRouteAreas } from './bootstrap/route-areas.js';
import { installRequestId, mintRequestId } from './bootstrap/request-id.js';
import type { ErrorLogger } from './errors/handler.js';
import { installErrorHandling } from './errors/handler.js';

export interface BuildAppOptions {
  /**
   * Where route areas are discovered. TESTS ONLY — `registerRouteAreas` `import()`s whatever this
   * points at, so it must never be reachable from configuration or from a request.
   */
  readonly routesRoot?: string;
  /**
   * The logger unmapped errors are reported to. Logging is `packages/observability` (`RUNT-07`),
   * wired by `RUNT-08`; until then this seam defaults to a silent logger and nothing is emitted.
   */
  readonly logger?: ErrorLogger;
  /** Overrides the id generator. TESTS ONLY. */
  readonly mintRequestId?: () => string;
}

export interface BuiltApp {
  readonly app: FastifyInstance;
  /** What actually booted, in load order. `RUNT-08` and the conformance test enumerate this. */
  readonly areas: readonly LoadedRouteArea[];
}

/**
 * Builds a ready-to-serve Fastify instance.
 *
 * Rejects — rather than booting half-configured — when a route area is malformed or two areas claim
 * the same method+path; `registerRouteAreas` awaits `app.ready()`, so those failures surface here.
 */
export async function buildApp(config: ApiConfig, opts: BuildAppOptions = {}): Promise<BuiltApp> {
  const mint = opts.mintRequestId ?? mintRequestId;

  // (a) the instance. `logger: false` because request logging belongs to RUNT-07's package; this
  //     ticket accepts an injected logger for errors and emits nothing by default.
  //     `disableRequestLogging` is named by the ticket. Fastify 5.11 marks it FSTDEP023 in favour of
  //     a `LogController` instance; the ticket wins, and the upgrade is an ADR consequence.
  const app = Fastify({
    logger: false,
    disableRequestLogging: true,
    bodyLimit: config.bodyLimitBytes,
  });

  // (b) request_id: assign on the way in, header + body injection on the way out.
  installRequestId(app, mint);

  // (c) the uniform PRD §16.1 error and not-found handlers.
  installErrorHandling(app, {
    ...(opts.logger ? { logger: opts.logger } : {}),
    mintRequestId: mint,
  });

  // ---------------------------------------------------------------------------------------------
  // RUNT-02 INSERTION POINT. The admission chain (authentication, tenant resolution, permissions,
  // rate/quota, PII, idempotency) installs itself HERE — after the error handlers, so an admission
  // rejection is serialised as a catalogue error, and before route areas, so it sees every request.
  // Nothing else may be added between (c) and (d).
  // ---------------------------------------------------------------------------------------------

  // (d) route areas. LAST: this awaits `app.ready()`, after which nothing may be registered.
  const areas = await registerRouteAreas(app, opts.routesRoot === undefined ? {} : { root: opts.routesRoot });

  return { app, areas };
}
