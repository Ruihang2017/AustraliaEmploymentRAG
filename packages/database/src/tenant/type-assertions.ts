/**
 * Compile-time half of two acceptance items.
 *
 * The ticket asks for "a compile-time assertion", "not merely a throwing one", that an
 * `IMMUTABLE`/`APPEND_ONLY` repository has no `update`/`delete` member, and that no callable can run
 * without a `TenantContext`. A `@ts-expect-error` written in `test/` proves nothing here:
 * `packages/database/tsconfig.json` has `"include": ["src"]`, so test files are never typechecked and
 * the marker would be inert. This module therefore lives under `src/` and is covered by
 * `pnpm typecheck`.
 *
 * It has no runtime side effects: every declaration below is a type, or a `declare`d value that emits
 * nothing. It is not re-exported from `index.ts`.
 */
import type { TableSpec } from '../migrate/manifest.js';
import type { TenantContext } from './context.js';
import { defineTenantRepository } from './repository.js';
import type { AppDatabaseHandle } from './connection.js';

declare const db: AppDatabaseHandle;
declare const ctx: TenantContext;

const MUTABLE_SPEC = {
  name: 't_parent',
  scope: 'TENANT',
  mutability: 'MUTABLE_METADATA',
  requiredColumns: ['id', 'organization_id'],
} satisfies TableSpec;

const APPEND_ONLY_SPEC = {
  name: 't_child',
  scope: 'TENANT',
  mutability: 'APPEND_ONLY',
  requiredColumns: ['id', 'organization_id'],
} satisfies TableSpec;

const IMMUTABLE_SPEC = {
  name: 't_frozen',
  scope: 'TENANT',
  mutability: 'IMMUTABLE',
  requiredColumns: ['id', 'organization_id'],
} satisfies TableSpec;

const mutable = defineTenantRepository({ table: 't_parent', spec: MUTABLE_SPEC }).for(db, ctx);
const appendOnly = defineTenantRepository({ table: 't_child', spec: APPEND_ONLY_SPEC }).for(db, ctx);
const immutable = defineTenantRepository({ table: 't_frozen', spec: IMMUTABLE_SPEC }).for(db, ctx);

// A MUTABLE_METADATA repository has the full surface.
void mutable.update;
void mutable.delete;
void mutable.insert;

// PRD §35.8 invariant 5 / REC-001: append-only and immutable tables expose no mutating member.
// @ts-expect-error `update` is absent from an APPEND_ONLY repository, not present-and-throwing.
void appendOnly.update;
// @ts-expect-error `delete` is absent from an APPEND_ONLY repository.
void appendOnly.delete;
// @ts-expect-error `update` is absent from an IMMUTABLE repository.
void immutable.update;
// @ts-expect-error `delete` is absent from an IMMUTABLE repository.
void immutable.delete;
// Inserting into an append-only table is the whole point of append-only, so it stays.
void appendOnly.insert;

// A GLOBAL table (PRD §35.6 `detected_change`) is append-only and system-scoped, and it is
// *writable*: `insert` is on the type, and `withSystemTransaction` is what makes it reachable at
// runtime — see `transaction.ts` and `test/tenant/repository.test.ts`.
const GLOBAL_SPEC = {
  name: 't_global',
  scope: 'GLOBAL',
  mutability: 'APPEND_ONLY',
  requiredColumns: ['id'],
} satisfies TableSpec;
const global = defineTenantRepository({ table: 't_global', spec: GLOBAL_SPEC }).for(db, ctx);
void global.insert;
void global.get;
// @ts-expect-error a GLOBAL append-only table exposes no `update` either.
void global.update;

// A definition carries no query surface at all: the only way to a callable is `.for(db, ctx)`.
const definition = defineTenantRepository({ table: 't_parent', spec: MUTABLE_SPEC });
// @ts-expect-error a definition has no `get`; there is no context to scope it to yet.
void definition.get;
// @ts-expect-error a definition has no `insert`.
void definition.insert;
// @ts-expect-error `.for()` cannot be called without a context.
void definition.for(db);

export {};
