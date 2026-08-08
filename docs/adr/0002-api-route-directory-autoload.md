# 0002 — API route areas register by directory convention

- **Status:** Accepted
- **Date:** 2026-08-08
- **Ticket:** `RUNT-01` (`docs/prd/03-app-runtime/tickets/RUNT-01-fastify-skeleton-autoloaded-routes-uniform-errors-request-id.md`)
- **Decides:** open question **QR1** in [`docs/prd/03-app-runtime/README.md` §6](../prd/03-app-runtime/README.md)
- **Records:** decision **A1** of [`docs/prd/breakdown-plan.md` §2.1](../prd/breakdown-plan.md) for the API boundary
- **Basis:** PRD §16.1, §20.3, §39.1, §45.5

## Context

`docs/prd/breakdown-plan.md` §2.1 row **A1** is a decomposition-critical decision:

> `apps/api`, `apps/worker`, `apps/web` register routes/handlers/features by **directory convention**
> (autoload), never a shared central manifest. … Without it every product module edits one
> `routes/index.ts` and the vertical cut collapses.

Seven product modules (`13`, `14`, `15`, `16`, `17`, `19`, `20`, `22`) plus `RUNT-08` each own an
`apps/api/src/routes/<area>/**` subtree, and none of them may write a file `03-app-runtime` owns. The
question left open (**QR1**) was the *mechanism*, and whether it survives the single immutable
release archive PRD §20.3 requires.

## Decision

**A hand-rolled loader** — `apps/api/src/bootstrap/route-areas.ts` — scans a routes root, `import()`s
each area's entry file and registers it inside its own Fastify encapsulation context.

The contract, normative for every downstream module, is the ticket's A1 contract section, reproduced
here in the form the code enforces:

1. **Discovery.** Every directory under `apps/api/src/routes/` that contains `index.ts` is a route
   area; its directory path from the root, `/`-joined, is the area id (`answers`, `internal/core`). A
   directory *without* an entry file is a container only if a descendant is an area; otherwise boot
   fails naming that directory. A missing routes root means zero areas, not an error.
2. **Required entry file.** `index.ts` MUST default-export a Fastify plugin. No default export, or a
   default export that is not a function, fails boot naming the directory and the file. Never a
   silent skip.
3. **Optional configuration.** The same file MAY export `const area` typed by `RouteAreaConfig`
   (`prefix`, `admission`, `order`), exported from `apps/api/src/bootstrap`.
4. **Prefix derivation.** Default `/v1/<area-id>`; `internal/<rest>` derives `/internal/v1/<rest>`;
   an explicit `area.prefix` overrides both (this is how `RUNT-08` mounts `/health/live` outside
   `/v1`, PRD §42.1). Two areas registering the same method+path fail boot with an error naming
   **both** areas and the path. Last-wins is forbidden.
5. **Isolation.** Each area is registered inside its own plugin scope, so its decorators, hooks and
   error handlers cannot leak into a sibling.
6. **Stability.** Adding, renaming or removing an area produces **zero** diff outside that area's own
   directory. `apps/api/test/route-area-conformance.ts` is the executable form of this guarantee and
   is exported for downstream modules to reuse.

**Load order** is `(order, areaId)` — `order` first (lower loads first), then the area id
lexicographically. The ticket words `order` as a "tiebreak within the lexicographic order"; area ids
are unique, so that reading would make the field permanently dead. The meaningful reading is
implemented and raised back to the Architect as a ticket-wording question; it is normative for seven
modules and should be confirmed or amended in the ticket, not settled in code.

## Alternatives rejected

**A central manifest** (`routes/index.ts` listing every area). This is exactly what A1 forbids and
what breakdown-plan §9 risk **R1** is about: every product module would edit one shared file, the
vertical cut would collapse into a merge queue, and seven tickets would contend on one path.

**`@fastify/autoload`.** It owns discovery, so it cannot return the `LoadedRouteArea[]` the ticket
requires, cannot fail with an error naming *both* colliding areas, cannot enforce the `area` config
export, and cannot distinguish "container directory" from "malformed area". It would add a
dependency to do strictly less. The hand-rolled loader is ~200 lines and gives every named failure
mode the acceptance list demands.

**A build-time generated route index** (emitted by `pnpm generate`). This would work, and would also
solve the bundling caveat below — but it touches `tools/**` and the generated-artifact rule in
breakdown-plan §1.1, which is `00-foundation`'s write-scope. It is recorded here as the escape hatch,
to be raised as a `00-foundation` ticket if the caveat below ever bites, and must never be added
locally from this module.

## Consequences

- **Seven product modules depend on this contract being stable.** Changing the discovery rules, the
  prefix derivation or the `RouteAreaConfig` shape is a coordinated docs change across `RUNT-01` and
  every dependent ticket, never a local edit.
- **QR1's bundling caveat is real and is recorded, not solved.** Directory scanning plus dynamic
  `import()` does not survive a single-file bundle. PRD §20.3's immutable release archive must
  therefore ship the source tree (Node 24 runs `.ts` directly) or gain a build-time route index. That
  choice belongs to `RLSE-01` together with `00-foundation`; this module must not pre-empt it.
- **`root` is an `import()` target.** `registerRouteAreas(app, { root })` executes whatever the path
  contains. `root` is a function parameter with a compile-time default, used only by tests, and must
  never be plumbed to an environment variable, a config field or anything reachable from a request.
- **`disableRequestLogging` is deprecated (Fastify FSTDEP023).** The ticket names it, so it ships. It
  is removed in Fastify 6 in favour of a `logController` instance; the upgrade is an
  `03-app-runtime` item, and the deprecation warning is visible once per Fastify instance today.
- **Running TypeScript sources directly needed a resolve hook.** The repository compiles with
  `moduleResolution: nodenext`, so every relative import is written `./x.js` while the file on disk
  is `./x.ts`. Vitest maps that itself; Node 24's type stripping does not, so `node src/server.ts`
  failed with `ERR_MODULE_NOT_FOUND` — the first time this repository has tried to *run* a member
  rather than typecheck and test it. `apps/api/src/bootstrap/ts-resolve-hooks.mjs` closes the gap for
  this app's process entry only. The durable fixes (`allowImportingTsExtensions` +
  `rewriteRelativeImportExtensions` in `tsconfig.base.json`, or an emitted build) are
  `00-foundation`'s write-scope and should replace the hook when they land.
- **The error catalogue is not re-declared.** `apps/api/src/errors/catalogue.ts` derives from
  `FND-04`'s generated `errorHttpStatusByCode` / `errorRetryableByCode`, so there is one source of
  truth; `apps/api/test/errors.test.ts` re-transcribes PRD §34.9 by hand so generator drift fails
  loudly at this boundary.
