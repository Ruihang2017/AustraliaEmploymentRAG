/**
 * DATA-02 deliverable 1 — the package-private application connection and the single Kysely instance
 * built over it.
 *
 * # This module is not exported
 *
 * `packages/database/package.json`'s `exports` map lists `.`, `./migrate`, `./crypto` and `./tenant`
 * and nothing else, so there is no specifier by which code outside this package can reach this file,
 * the `better-sqlite3` handle, or the `Kysely` instance. `src/tenant/index.ts` re-exports
 * repositories, context factories and helpers — never this module.
 * `test/architecture/no-unscoped-access.test.ts` asserts both halves (SEC-001).
 *
 * # Kysely compiles; better-sqlite3 executes
 *
 * This is the load-bearing usage constraint of the whole ticket, and it is *narrower* than what
 * breakdown plan §8 Q13 / ADR 0002 settle (which library). Every query goes:
 *
 *   builder.compile() -> { sql, parameters } -> assertTenantScoped(...) -> sqlite.prepare(sql).run/all
 *
 * Calling `.execute()` on a Kysely builder would run the statement through Kysely's own driver and
 * skip the tenant chokepoint entirely. Nothing under `src/tenant/**` may do it;
 * `test/tenant/purity.test.ts` enforces that mechanically, because a comment cannot.
 *
 * The cost is real and is recorded here rather than buried: this codebase forgoes Kysely's
 * execution, streaming and plugin surface for the lifetime of the access layer. It is flagged in the
 * plan (§6) as an ADR-consequences addendum for the Architect; `docs/adr/**` is outside this
 * ticket's file-scope and its Non-goals say "No access-layer ADR", so none is written here.
 *
 * This file is the ONLY file outside `src/migrate/**` that may import `better-sqlite3`, and the only
 * file anywhere in the repository that may import `kysely`.
 */
import { resolve } from 'node:path';

import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

import { applyAppPragmas } from '../migrate/pragmas.js';
import { assertSchemaUpToDate } from '../migrate/runner.js';

/**
 * The typed schema Kysely builds against.
 *
 * It is an open index signature rather than a hand-written table union because `DATA-04`…`DATA-07`
 * own the tables and none exist yet; Kysely's role here is statement construction, not schema
 * authority (Q13: it "neither generates nor owns schema migrations"). A ticket that later narrows
 * this type improves developer ergonomics — it does not change the security boundary, which is the
 * factory plus the `exports` map plus the static test.
 */
export interface AppSchema {
  [table: string]: Record<string, unknown>;
}

export interface AppDatabaseOptions {
  readonly databasePath: string;
  /** Defaults to the package's shipped `migrations/` directory. */
  readonly migrationsDir?: string;
}

export interface AppDatabaseHandle {
  /** The raw connection. Package-private; never reachable through the `exports` map. */
  readonly sqlite: Database.Database;
  /** The query **compiler**. See the file header: `.execute()` on a builder is forbidden. */
  readonly qb: Kysely<AppSchema>;
  readonly databasePath: string;
  /** Idempotent. Safe to call from both a harness `finally` and a test that also closes. */
  close(): void;
}

/**
 * Opens `app.sqlite`, applies the shared pragmas, refuses a stale schema, and returns the handle.
 *
 * Deliberately **not cached** by path. A cache keyed on the resolved path would silently skip
 * `assertSchemaUpToDate` for a second call carrying a different `migrationsDir`, and would make
 * `close()` on one holder close the connection out from under every other holder. Both are the kind
 * of surprise that surfaces as an unrelated flake much later. Callers that want one connection per
 * process hold one handle per process; that decision belongs to the bootstrap (`RUNT-02`), not here.
 */
export function openAppDatabase(options: AppDatabaseOptions): AppDatabaseHandle {
  const databasePath = resolve(options.databasePath);
  const sqlite = new DatabaseConstructor(databasePath);

  try {
    applyAppPragmas(sqlite);
    // `exactOptionalPropertyTypes` is on: pass the argument or do not, never `undefined`.
    if (options.migrationsDir === undefined) {
      assertSchemaUpToDate(sqlite);
    } else {
      assertSchemaUpToDate(sqlite, options.migrationsDir);
    }

    const qb = new Kysely<AppSchema>({ dialect: new SqliteDialect({ database: sqlite }) });

    let closed = false;
    return {
      sqlite,
      qb,
      databasePath,
      close(): void {
        if (closed) return;
        closed = true;
        sqlite.close();
      },
    };
  } catch (error) {
    // A handle leaked here makes the harness's temp-directory cleanup fail with EBUSY on Windows,
    // and the failure then surfaces in an unrelated test. Close before rethrowing.
    sqlite.close();
    throw error;
  }
}
