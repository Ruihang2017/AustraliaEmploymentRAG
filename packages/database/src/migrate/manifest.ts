/**
 * DATA-01 deliverable 9 — the `TableManifest` contract and its directory-glob discovery.
 *
 * Discovery is by glob over `packages/database/src/schema/*.ts`, each file exporting `tableManifest`.
 * There is deliberately **no** barrel/index file (sub-PRD D4, same principle as breakdown plan A1):
 * a shared registration file is a merge-conflict point that would re-serialise DATA-04…DATA-07,
 * which each add exactly one file to this glob.
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { MigrationError } from './errors.js';
import { enableTypeScriptResolution } from './ts-resolve.js';

export type TableScope = 'TENANT' | 'GLOBAL';
export type TableMutability = 'MUTABLE_METADATA' | 'APPEND_ONLY' | 'IMMUTABLE';

export interface TableSpec {
  name: string;
  scope: TableScope;
  mutability: TableMutability;
  encryptedColumns?: string[];
  requiredColumns: string[];
  /** `{ column: contractsEnumFamily }` — the linter checks each CHECK against the FND-03 registry. */
  enumColumns?: Record<string, string>;
  /** Columns declared `INTEGER CHECK (x IN (0,1))` (PRD §35.1 booleans). */
  booleanColumns?: string[];
  /** Columns declared `TEXT CHECK (x GLOB 'YYYY-MM-DD')` (PRD §35.1 legal dates). */
  legalDateColumns?: string[];
}

export interface TableManifest {
  group: string;
  tables: TableSpec[];
}

/** `packages/database/src/schema` — the directory DATA-04…DATA-07 each add one file to. */
export const DEFAULT_SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema');

const SCOPES: readonly string[] = ['TENANT', 'GLOBAL'];
const MUTABILITIES: readonly string[] = ['MUTABLE_METADATA', 'APPEND_ONLY', 'IMMUTABLE'];

/**
 * Node's `require()` reaches an ESM `.ts` module synchronously on the pinned Node 24.18.0 (type
 * stripping plus require(esm)). That is what keeps this function's ticket-declared signature
 * synchronous instead of `Promise<TableManifest[]>`.
 */
const requireModule = createRequire(import.meta.url);

function assertManifest(value: unknown, file: string): TableManifest {
  if (typeof value !== 'object' || value === null) {
    throw new MigrationError(
      'MANIFEST_INVALID',
      `${file} does not export a \`tableManifest\` object`,
      { name: file },
    );
  }
  const manifest = value as Partial<TableManifest>;
  if (typeof manifest.group !== 'string' || manifest.group.length === 0) {
    throw new MigrationError('MANIFEST_INVALID', `${file}: tableManifest.group must be a non-empty string`, {
      name: file,
    });
  }
  if (!Array.isArray(manifest.tables)) {
    throw new MigrationError('MANIFEST_INVALID', `${file}: tableManifest.tables must be an array`, {
      name: file,
    });
  }
  for (const table of manifest.tables) {
    if (typeof table?.name !== 'string' || table.name.length === 0) {
      throw new MigrationError('MANIFEST_INVALID', `${file}: every table needs a \`name\``, { name: file });
    }
    if (!SCOPES.includes(table.scope)) {
      throw new MigrationError(
        'MANIFEST_INVALID',
        `${file}: table ${table.name} has scope ${JSON.stringify(table.scope)}; expected one of ` +
          SCOPES.join(', '),
        { name: file },
      );
    }
    if (!MUTABILITIES.includes(table.mutability)) {
      throw new MigrationError(
        'MANIFEST_INVALID',
        `${file}: table ${table.name} has mutability ${JSON.stringify(table.mutability)}; expected ` +
          `one of ${MUTABILITIES.join(', ')}`,
        { name: file },
      );
    }
    if (!Array.isArray(table.requiredColumns)) {
      throw new MigrationError(
        'MANIFEST_INVALID',
        `${file}: table ${table.name} must declare \`requiredColumns\` (may be empty)`,
        { name: file },
      );
    }
  }
  return manifest as TableManifest;
}

/**
 * Every `*.ts` in `dir` exporting `tableManifest`, sorted by filename for determinism.
 *
 * Returns `[]` when the directory is empty or does not exist — `src/schema/` genuinely does not
 * exist until DATA-04 lands, and a missing directory at that point is the normal state, not a fault.
 */
export function discoverTableManifests(dir: string = DEFAULT_SCHEMA_DIR): TableManifest[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];

  // `require()` uses Node's resolver, not vitest's, so a schema file importing a sibling with a
  // `.js` specifier — which is what DATA-04…DATA-07 will write — needs the bridge installed first.
  enableTypeScriptResolution();

  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .sort();

  const manifests: TableManifest[] = [];
  for (const file of files) {
    const loaded = requireModule(join(dir, file)) as { tableManifest?: unknown };
    if (!('tableManifest' in loaded)) {
      throw new MigrationError(
        'MANIFEST_INVALID',
        `${file}: every file in ${dir} must export \`tableManifest\` (sub-PRD D4 — glob discovery, ` +
          'no barrel file)',
        { name: file },
      );
    }
    manifests.push(assertManifest(loaded.tableManifest, file));
  }
  return manifests;
}
