/**
 * DATA-08 deliverable 1 — the `ephemeral.sqlite` connection factory.
 *
 * This is a **separate file** from `app.sqlite` (PRD §10.4, §39.3). In production the path is
 * `/srv/aer/data/ephemeral.sqlite`, supplied by configuration at wiring time (`03-app-runtime`) —
 * this module reads no environment variable and hardcodes no absolute path, because an env read here
 * would make the module untestable and would duplicate `apps/api`'s config layering.
 *
 * The connection applies `APP_SQLITE_PRAGMAS` through DATA-01's `applyAppPragmas` (the pragma list is
 * never restated), bootstraps its own schema (sub-PRD D6), and refuses `ATTACH`.
 *
 * # The raw handle is package-private
 *
 * `better-sqlite3`'s `Database` is kept in a module-private `WeakMap` and reachable only through
 * `internalSqlite`, which `src/ephemeral/index.ts` deliberately does **not** re-export — the same
 * pattern `src/crypto/keys.ts` uses for `internalKeyBytes`. A public `.sqlite` property would make
 * the whole attach guard decorative.
 */
import { resolve } from 'node:path';

import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';

import { applyAppPragmas } from '../migrate/pragmas.js';
import { EphemeralError } from './errors.js';
import { ensureEphemeralSchema } from './schema.js';
import { assertNoAttach } from './sql-guard.js';

/** PRD §39.3: the file lives beside `app.sqlite` in the data directory. */
export const DEFAULT_EPHEMERAL_FILE_NAME = 'ephemeral.sqlite';

/** `/srv/aer/data/ephemeral.sqlite` in production, where `dataDir` is `/srv/aer/data`. */
export function defaultEphemeralPath(dataDir: string): string {
  if (typeof dataDir !== 'string' || dataDir.length === 0) {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', { detail: 'dataDir must be a non-empty string' });
  }
  return resolve(dataDir, DEFAULT_EPHEMERAL_FILE_NAME);
}

export interface EphemeralDatabaseOptions {
  readonly path: string;
}

export interface EphemeralDatabaseHandle {
  readonly path: string;
  /** Guarded execution. Rejects `ATTACH`/`DETACH`. Parameters are bound, never interpolated. */
  run(sql: string, params?: Record<string, unknown>): { changes: number };
  all<T = unknown>(sql: string, params?: Record<string, unknown>): T[];
  get<T = unknown>(sql: string, params?: Record<string, unknown>): T | undefined;
  /** `PRAGMA wal_checkpoint(TRUNCATE)` — used by the sweeper and the canary test. */
  checkpoint(): void;
  /** Idempotent. */
  close(): void;
}

const RAW_HANDLES = new WeakMap<EphemeralDatabaseHandle, Database.Database>();

/**
 * Package-private access to the underlying `better-sqlite3` connection, for sibling files in
 * `src/ephemeral/**` only. Never re-exported from `src/ephemeral/index.ts`.
 */
export function internalSqlite(handle: EphemeralDatabaseHandle): Database.Database {
  const sqlite = RAW_HANDLES.get(handle);
  if (sqlite === undefined || !sqlite.open) {
    throw new EphemeralError('EPHEMERAL_STORE_CLOSED');
  }
  return sqlite;
}

/**
 * The *dynamic* half of the attach guard: `PRAGMA database_list` must show exactly `main`.
 *
 * Unlike the static screen in `sql-guard.ts` this does not depend on string matching, which is why
 * it runs on open, at the start of `runStartupCleanup` and at the start of every `sweepExpired`.
 */
export function assertNoAttachedDatabases(sqlite: Database.Database): void {
  const rows = sqlite.pragma('database_list') as Array<{ name?: unknown }>;
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.name !== 'main') {
    throw new EphemeralError('EPHEMERAL_ATTACHED_DATABASE');
  }
}

export function openEphemeralDatabase(options: EphemeralDatabaseOptions): EphemeralDatabaseHandle {
  if (typeof options?.path !== 'string' || options.path.length === 0) {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', { detail: 'path must be a non-empty string' });
  }
  const path = resolve(options.path);
  const sqlite = new DatabaseConstructor(path);

  try {
    applyAppPragmas(sqlite);
    assertNoAttachedDatabases(sqlite);

    let closed = false;
    const assertOpen = (): Database.Database => {
      if (closed || !sqlite.open) throw new EphemeralError('EPHEMERAL_STORE_CLOSED');
      return sqlite;
    };

    const handle: EphemeralDatabaseHandle = {
      path,
      run(sql, params) {
        const db = assertOpen();
        assertNoAttach(sql);
        const statement = db.prepare(sql);
        const info = params === undefined ? statement.run() : statement.run(params);
        return { changes: info.changes };
      },
      all<T>(sql: string, params?: Record<string, unknown>): T[] {
        const db = assertOpen();
        assertNoAttach(sql);
        const statement = db.prepare(sql);
        return (params === undefined ? statement.all() : statement.all(params)) as T[];
      },
      get<T>(sql: string, params?: Record<string, unknown>): T | undefined {
        const db = assertOpen();
        assertNoAttach(sql);
        const statement = db.prepare(sql);
        const row = params === undefined ? statement.get() : statement.get(params);
        return row === undefined ? undefined : (row as T);
      },
      checkpoint(): void {
        assertOpen().pragma('wal_checkpoint(TRUNCATE)');
      },
      close(): void {
        if (closed) return;
        closed = true;
        sqlite.close();
      },
    };

    RAW_HANDLES.set(handle, sqlite);
    ensureEphemeralSchema(handle);
    return handle;
  } catch (error) {
    // A leaked handle makes Windows temp-directory cleanup fail with EBUSY, and the failure then
    // surfaces in an unrelated test (see test/migrate/helpers.ts). Close before rethrowing.
    sqlite.close();
    throw error;
  }
}
