/**
 * DATA-08 — `ephemeral.sqlite`: the local, non-replicated store for transient research content
 * (PRD §10.4, §35.7, §39.3).
 *
 * # What this module is
 *
 * Three tables — `ephemeral_job_content`, `ephemeral_evidence`, `ephemeral_result` — keyed by job id,
 * every payload encrypted through DATA-03's field codec, holding **no identity beyond an opaque
 * job/organisation reference**. The schema bootstraps itself on open (sub-PRD D6): there is no
 * migration, no ledger and no file under `packages/database/migrations/`.
 *
 * # Documented non-capabilities (deliverable 9)
 *
 * - **No export path and no support-tool read path.** PRD §10.4 forbids both verbatim: ephemeral
 *   content "MUST NOT enter Litestream, daily/weekly backups, exports or support tools". A request
 *   for one is refused and recorded in `docs/prd/01-app-data/README.md`'s open questions — never
 *   implemented. There is deliberately no function here that returns bulk content, lists jobs, dumps
 *   a table or scans the store.
 * - **No cross-database transaction, ever.** `app.sqlite` and `ephemeral.sqlite` are separate files;
 *   `ATTACH` is refused by this module. The substitute is the caller ordering rule below.
 * - **No recovery after expiry or after server loss** (PRD §10.4). This file is excluded from
 *   Litestream and every backup glob (PRD §39.3) — see `backup.ts`, which is the contract `RLSE-05`
 *   and `ASSR-08` consume.
 * - **Durable audit, export, review, version comparison and change alerts require `SAVE` mode**
 *   (PRD §10.4). None of them are served from here.
 * - **No PII detection and no key management.** `packages/pii` owns the first (PRD §10.1 puts that
 *   boundary before persistence); DATA-03 owns the cipher and the registry.
 * - **No HTTP status mapping.** `getEphemeral` returns `EXPIRED`/`ABSENT`; `apps/api` maps `EXPIRED`
 *   to `410 EPHEMERAL_CONTENT_EXPIRED` (PRD §34.9).
 * - **No sweeper process.** `startEphemeralSweeper`/`runStartupCleanup` are callables; `RUNT-04`
 *   hosts the loop and `RUNT-01`/`RUNT-08` await the startup cleanup before readiness.
 *
 * # Ordering contract for callers (`ASK-01`)
 *
 * The two SQLite files cannot participate in one transaction and must never be `ATTACH`ed. Callers
 * therefore **write the ephemeral content first and only then commit the `app.sqlite` job row that
 * references it** (PRD §18.5 step 2's "opaque ephemeral-content reference"). An orphaned ephemeral
 * row is harmless — the sweeper removes it; a job row referencing missing content is a user-visible
 * failure.
 *
 * # Retention
 *
 * Content expires **one hour after terminal state** and **at 24 hours from creation** (PRD §35.7).
 * Both are a customer-facing promise (PRD §10.4): changing either is a PRD §45.5 product change, not
 * a config tweak. Expiry is evaluated at read time as well as by the sweep, so the promise never
 * depends on the sweeper being alive.
 *
 * `internalSqlite` is package-private and deliberately not re-exported: handing out the raw
 * `better-sqlite3` connection would make the attach guard decorative.
 */
export * from './errors.js';
export {
  DEFAULT_EPHEMERAL_FILE_NAME,
  defaultEphemeralPath,
  openEphemeralDatabase,
  assertNoAttachedDatabases,
  type EphemeralDatabaseHandle,
  type EphemeralDatabaseOptions,
} from './connection.js';
export { assertNoAttach } from './sql-guard.js';
export * from './schema.js';
export * from './store.js';
export * from './sweeper.js';
export * from './scheduler.js';
export * from './backup.js';
