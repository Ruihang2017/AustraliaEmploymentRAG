import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SCHEMA_DIR, discoverTableManifests } from '../../src/migrate/manifest.js';
import { fixture, withTempDir } from './helpers.js';

/*
 * DATA-10 — this suite asserts the framework's properties, not the repository's inventory. The
 * default-directory test below therefore checks that discovery returns one manifest per `*.ts`
 * file actually present in `src/schema/`, rather than that the repository contains none; every
 * other test here builds its own schema directory under a temp dir and is closed by construction.
 */

/**
 * Builds a stand-in for `packages/database/src/schema/`. The `package.json` carries
 * `"type": "module"` because the real directory inherits that from the package manifest, and the
 * loader's behaviour for a `.ts` file depends on it.
 */
function schemaDir(dir: string, files: readonly string[]): string {
  const schema = join(dir, 'schema');
  mkdirSync(schema, { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n', 'utf8');
  for (const file of files) cpSync(join(fixture('schema'), file), join(schema, file));
  return schema;
}

describe('discoverTableManifests (DATA-01 deliverable 9, sub-PRD D4)', () => {
  it('globs *.ts with no index/barrel file present, sorted', async () => {
    await withTempDir((dir) => {
      const schema = schemaDir(dir, ['alpha.ts', 'beta.ts']);
      expect(readdirSync(schema)).not.toContain('index.ts');

      const manifests = discoverTableManifests(schema);
      expect(manifests.map((manifest) => manifest.group)).toEqual(['fixture-alpha', 'fixture-beta']);
      expect(manifests[0]?.tables[0]?.name).toBe('fixture_alpha');
      expect(manifests[1]?.tables[0]?.scope).toBe('TENANT');
    });
  });

  it('picks up a file added later without any registration step', async () => {
    await withTempDir((dir) => {
      const schema = schemaDir(dir, ['alpha.ts']);
      expect(discoverTableManifests(schema)).toHaveLength(1);
      // This is the whole point of D4: DATA-05 adds one file and nothing else changes.
      cpSync(join(fixture('schema'), 'beta.ts'), join(schema, 'beta.ts'));
      expect(discoverTableManifests(schema)).toHaveLength(2);
    });
  });

  it('returns [] for an empty directory', async () => {
    await withTempDir((dir) => {
      expect(discoverTableManifests(schemaDir(dir, []))).toEqual([]);
    });
  });

  it('returns [] when the directory does not exist', async () => {
    await withTempDir((dir) => {
      expect(discoverTableManifests(join(dir, 'no-such-schema'))).toEqual([]);
    });
  });

  it('defaults to packages/database/src/schema and returns one manifest per file present', () => {
    // DATA-10: this used to assert `toEqual([])`, i.e. that the repository contains zero schema
    // modules — which DATA-04…DATA-07 each falsify by adding exactly one file. The permanent
    // property is one manifest per `*.ts` actually on disk (and none when the directory is absent,
    // which is what 'returns [] when the directory does not exist' above proves).
    expect(DEFAULT_SCHEMA_DIR.replace(/\\/g, '/')).toMatch(/packages\/database\/src\/schema$/);

    // Mirrors src/migrate/manifest.ts's own glob, computed here rather than imported from it.
    const files = existsSync(DEFAULT_SCHEMA_DIR)
      ? readdirSync(DEFAULT_SCHEMA_DIR)
          .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
          .sort()
      : [];

    const manifests = discoverTableManifests();
    expect(manifests).toHaveLength(files.length);
    for (const manifest of manifests) {
      expect(manifest.group).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(manifest.tables.length).toBeGreaterThan(0);
    }
  });

  it('loads a manifest that imports a sibling module with a `.js` specifier', async () => {
    // The bridge that makes this work is src/migrate/ts-resolve.ts. `discoverTableManifests` uses
    // `createRequire`, i.e. **Node's** resolver rather than vitest's, and Node's type stripping does
    // not map `./x.js` onto `x.ts`. DATA-04…DATA-07 will write exactly this shape — `tsc` and vitest
    // both require the `.js` extension — so without the hook every one of them fails with
    // ERR_MODULE_NOT_FOUND, and it would be discovered four tickets from now rather than here.
    await withTempDir((dir) => {
      const schema = join(dir, 'schema');
      mkdirSync(schema, { recursive: true });
      writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n', 'utf8');
      cpSync(fixture('schema-sibling'), schema, { recursive: true });
      expect(readdirSync(schema).filter((entry) => entry.endsWith('.ts'))).toEqual(['gamma.ts']);

      const manifests = discoverTableManifests(schema);
      expect(manifests).toHaveLength(1);
      expect(manifests[0]?.group).toBe('fixture-gamma');
      expect(manifests[0]?.tables[0]?.requiredColumns).toEqual([
        'id',
        'organization_id',
        'created_at',
      ]);
    });
  });

  it('names the file when it exports no tableManifest', async () => {
    await withTempDir((dir) => {
      const schema = schemaDir(dir, []);
      writeFileSync(join(schema, 'broken.ts'), 'export const notAManifest = 1;\n', 'utf8');
      expect(() => discoverTableManifests(schema)).toThrowError(
        expect.objectContaining({ code: 'MANIFEST_INVALID' }),
      );
      expect(() => discoverTableManifests(schema)).toThrow(/broken\.ts/);
    });
  });

  it('rejects a manifest with no group', async () => {
    await withTempDir((dir) => {
      const schema = schemaDir(dir, []);
      writeFileSync(
        join(schema, 'nogroup.ts'),
        'export const tableManifest = { tables: [] };\n',
        'utf8',
      );
      expect(() => discoverTableManifests(schema)).toThrow(/tableManifest\.group/);
    });
  });

  it('rejects a table with an unknown scope', async () => {
    await withTempDir((dir) => {
      const schema = schemaDir(dir, []);
      writeFileSync(
        join(schema, 'badscope.ts'),
        'export const tableManifest = { group: "x", tables: [' +
          '{ name: "t", scope: "EVERYONE", mutability: "IMMUTABLE", requiredColumns: [] }] };\n',
        'utf8',
      );
      expect(() => discoverTableManifests(schema)).toThrow(/EVERYONE/);
    });
  });

  it('ignores non-.ts files', async () => {
    await withTempDir((dir) => {
      const schema = schemaDir(dir, ['alpha.ts']);
      writeFileSync(join(schema, 'notes.md'), '# not a manifest\n', 'utf8');
      writeFileSync(join(schema, 'types.d.ts'), 'export {};\n', 'utf8');
      expect(discoverTableManifests(schema)).toHaveLength(1);
    });
  });
});
