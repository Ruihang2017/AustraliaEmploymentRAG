import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PACKAGE_ROOT, REPO_MIGRATIONS_DIR } from '../migrate/helpers.js';

/**
 * Sub-PRD D6 and the ticket's file-scope: this ticket writes **no** migration and appends nothing to
 * `package.json`. Asserted as substring/set rules so sibling DATA tickets can keep adding their own
 * migrations without turning this test red.
 */
describe('DATA-08 file-scope', () => {
  it('adds no migration file for the ephemeral database', () => {
    const files = readdirSync(REPO_MIGRATIONS_DIR);
    expect(files.filter((name) => name.toLowerCase().includes('ephemeral'))).toEqual([]);
  });

  it('leaves the package exports map and dependency set untouched', () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      exports: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(Object.keys(manifest.exports).sort()).toEqual(['.', './crypto', './migrate', './tenant']);
    expect(
      [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)].sort(),
    ).toEqual(['@types/better-sqlite3', 'better-sqlite3', 'kysely']);
  });
});
