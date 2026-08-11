/**
 * The in-package half of the boundary.
 *
 * `test/architecture/no-unscoped-access.test.ts` proves nothing *outside* `packages/database` can
 * reach a raw handle. This file proves the rules that hold *inside* `src/tenant/**`, which that
 * scanner deliberately skips: the connection module is the only importer of the driver and of Kysely,
 * `domain.ts` is the only door to FND-06, no query is executed through Kysely, and no permission rule
 * is re-declared here (PRD §45.2 forbids duplicated business rules).
 *
 * Scanning is done over the source with comments and string literals blanked. Every rule below is
 * about what the code *does*, and this file's subject matter guarantees the forbidden text appears in
 * prose in these very modules — a naive `includes()` would flag the file headers that explain the
 * rules.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TENANT_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'tenant');

/** Blanks `//`, `/* *\/` comments and string/template literal contents, preserving nothing else. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

const files = readdirSync(TENANT_SRC)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => ({ name, source: readFileSync(join(TENANT_SRC, name), 'utf8') }))
  .map((file) => ({ ...file, code: code(file.source) }));

/** Import specifiers, from the blanked source's import/export statements in the original text. */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) found.push(match[1] as string);
  const dynamic = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamic.exec(source)) !== null) found.push(match[1] as string);
  return found;
}

describe('src/tenant/** purity', () => {
  it('finds the modules it is meant to be checking', () => {
    // Non-vacuity: a rename that emptied this list would make every assertion below trivially true.
    expect(files.length).toBeGreaterThanOrEqual(12);
    expect(files.map((file) => file.name)).toContain('connection.ts');
    expect(files.map((file) => file.name)).toContain('domain.ts');
  });

  it('imports better-sqlite3 and kysely only from connection.ts', () => {
    for (const file of files) {
      const imported = specifiers(file.source);
      const driver = imported.filter(
        (specifier) =>
          specifier === 'better-sqlite3' ||
          specifier.startsWith('better-sqlite3/') ||
          specifier === 'kysely' ||
          specifier.startsWith('kysely/'),
      );
      if (file.name === 'connection.ts') {
        expect(driver.sort(), 'connection.ts must import both').toEqual(['better-sqlite3', 'better-sqlite3', 'kysely']);
      } else {
        expect(driver, `${file.name} imports the driver or the query builder directly`).toEqual([]);
      }
    }
  });

  it('reaches packages/domain through exactly one boundary file', () => {
    for (const file of files) {
      const domain = specifiers(file.source).filter((specifier) => specifier.includes('/domain/'));
      if (file.name === 'domain.ts') {
        expect(domain.every((specifier) => specifier.endsWith('/domain/src/access/index.js'))).toBe(
          true,
        );
        expect(domain.length).toBeGreaterThan(0);
      } else {
        expect(domain, `${file.name} imports packages/domain directly`).toEqual([]);
      }
    }
  });

  it('never executes a query through Kysely — every statement is compiled and checked first', () => {
    for (const file of files) {
      expect(file.code, `${file.name} calls .execute() on a builder`).not.toMatch(/\.execute\s*\(/);
      expect(file.code, `${file.name} calls .executeTakeFirst()`).not.toMatch(/\.executeTakeFirst/);
    }
    // And the chokepoint is genuinely on the path: the repository compiles and asserts.
    const repository = files.find((file) => file.name === 'repository.ts');
    expect(repository?.code).toMatch(/assertTenantScoped/);
  });

  it('re-declares no role, permission or matrix table (PRD §45.2)', () => {
    for (const file of files) {
      for (const forbidden of ['ROLE_MATRIX', 'ROLE_VALUES', 'PERMISSION_VALUES', 'MATRIX_ACTIONS']) {
        expect(file.code, `${file.name} re-declares ${forbidden}`).not.toContain(forbidden);
      }
      // No inline permission literal either — the vocabulary is FND-03's and FND-06's.
      expect(file.code, `${file.name} hardcodes a permission literal`).not.toMatch(
        /RESEARCH_RECORD_READ_WRITE_OWN|MEMBERSHIP_ROLE_CHANGE/,
      );
    }
  });

  it('uses no TypeScript parameter property, so a plain Node process can load these modules', () => {
    // Node runs `.ts` in strip-only mode and rejects `constructor(readonly x: T)`;
    // `test/tenant/tx-worker.mjs` loads these modules that way. Caught once, in errors.ts.
    for (const file of files) {
      expect(file.code, `${file.name} uses a parameter property`).not.toMatch(
        /constructor\s*\([^)]*\b(?:readonly|public|private|protected)\b/,
      );
    }
  });

  it('does not re-export the connection module from the public surface', () => {
    const index = files.find((file) => file.name === 'index.ts');
    expect(index).toBeDefined();
    for (const specifier of specifiers(index?.source ?? '')) {
      expect(specifier, 'index.ts must not re-export the connection').not.toContain('connection');
    }
    expect(index?.code).not.toMatch(/AppDatabaseHandle|Kysely/);
  });
});
