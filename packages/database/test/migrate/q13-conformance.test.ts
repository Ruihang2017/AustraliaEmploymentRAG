import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MIGRATION_FILENAME } from '../../src/migrate/naming.js';
import { PACKAGE_ROOT, REPO_MIGRATIONS_DIR } from './helpers.js';

const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');

/**
 * The ADR file this ticket claims under breakdown plan §2.1 **A9** (`docs/adr/**` is shared-additive,
 * ownership is per file). `NNNN` is the lowest unused number *at implementation time*: the ticket
 * text guessed `0001`, but `EVID-02` landed `0001-local-pii-entity-runtime.md` first, so this is
 * `0002`. The number appears here, in the file name, in the ADR's own title and in the sub-PRD's D11
 * row, and the last two are asserted below — a half-renamed ADR is worse than a missing one.
 */
const ADR_PATH = '0002-sqlite-access-layer.md';

function manifestText(relativePath: string): string {
  // Read the raw text, not the parsed manifest: a Drizzle entry hidden in a comment, an override or
  // a script string still counts as a declaration for the purpose of this check.
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

describe('breakdown plan §8 Q13 conformance (sub-PRD D11)', () => {
  it('ships only checked-in .sql migrations', () => {
    const entries = readdirSync(REPO_MIGRATIONS_DIR, { withFileTypes: true });
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.isFile(), `${entry.name} is not a file`).toBe(true);
      expect(entry.name.endsWith('.sql'), `${entry.name} is not a .sql file`).toBe(true);
      expect(MIGRATION_FILENAME.test(entry.name), `${entry.name} breaks the filename policy`).toBe(
        true,
      );
    }
  });

  it('ships exactly one 0001_* migration, and it is the baseline', () => {
    const baselines = readdirSync(REPO_MIGRATIONS_DIR).filter((name) => name.startsWith('0001_'));
    expect(baselines).toEqual(['0001_baseline.sql']);
  });

  it('declares no Drizzle dependency in packages/database or packages/jobs', () => {
    for (const path of ['packages/database/package.json', 'packages/jobs/package.json']) {
      expect(manifestText(path).toLowerCase(), `${path} mentions drizzle`).not.toContain('drizzle');
    }
  });

  it('declares better-sqlite3 at the exact pinned version, with no range marker', () => {
    const manifest = JSON.parse(manifestText('packages/database/package.json')) as {
      dependencies?: Record<string, string>;
    };
    const version = manifest.dependencies?.['better-sqlite3'];
    expect(version).toBe('13.0.3');
    for (const marker of ['^', '~', '>', '<', '*', 'x']) {
      expect(version).not.toContain(marker);
    }
  });

  it('generates no migration from a query builder — src/migrate writes SQL text only', () => {
    // The runner executes raw `.sql` through better-sqlite3 (§8 Q13 clauses (c)-(e)). Kysely is not
    // a dependency of this package: DATA-02, not DATA-01, introduces it, and an unused declared
    // dependency in the PRD §21.1 SBOM is worse than a late one.
    //
    // The whole declared set is asserted, not just the absence of a query builder. `better-sqlite3`
    // is irreducible (nothing installs a native module that is not declared) and
    // `@types/better-sqlite3` is what lets `src/migrate/**` typecheck without a hand-written ambient
    // shim — see ADR 0002 consequence (viii). Anything beyond those two is a decision this ticket
    // did not make; `packages/contracts` is reached through `src/migrate/contracts.ts`'s single
    // relative import boundary rather than a workspace link (the FND-06 / RUNT-07 precedent).
    const manifest = JSON.parse(manifestText('packages/database/package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = { ...manifest.dependencies, ...manifest.devDependencies };
    expect(Object.keys(declared).sort()).toEqual(['@types/better-sqlite3', 'better-sqlite3']);
  });

  it('reaches packages/contracts through exactly one import boundary file', () => {
    // PRD §35.1 enum CHECKs are "generated from packages/contracts" (FND-03). Every other module
    // imports them from `./contracts.js`, so when FND-03's open question about workspace links is
    // settled, one file changes.
    const boundary = readFileSync(
      join(PACKAGE_ROOT, 'src', 'migrate', 'contracts.ts'),
      'utf8',
    );
    expect(boundary).toContain('../../../contracts/src/enums/index.js');

    for (const entry of readdirSync(join(PACKAGE_ROOT, 'src', 'migrate'))) {
      if (entry === 'contracts.ts') continue;
      const text = readFileSync(join(PACKAGE_ROOT, 'src', 'migrate', entry), 'utf8');
      expect(text, `${entry} imports packages/contracts directly`).not.toContain(
        'contracts/src/enums',
      );
    }
  });

  it('exposes the migration surface from src/migrate, leaving the package entry file empty', () => {
    // FND-01 asserts `packages/database/src/index.ts` byte-for-byte; DATA-02/DATA-08/RUNT-08 import
    // `@taxrag/database/src/migrate/index.js` instead.
    expect(readFileSync(join(PACKAGE_ROOT, 'src', 'index.ts'), 'utf8').replace(/\r\n/g, '\n')).toBe(
      'export {};\n',
    );
    const surface = readFileSync(join(PACKAGE_ROOT, 'src', 'migrate', 'index.ts'), 'utf8');
    for (const module of [
      './errors.js',
      './pragmas.js',
      './naming.js',
      './policy.js',
      './conventions.js',
      './conventions-lint.js',
      './manifest.js',
      './runner.js',
    ]) {
      expect(surface).toContain(module);
    }
  });

  it('declares the migration scripts PRD §20.3 needs a runnable target for', () => {
    const manifest = JSON.parse(manifestText('packages/database/package.json')) as {
      scripts?: Record<string, string>;
    };
    expect(manifest.scripts?.['db:migrate']).toBe('node src/migrate/cli.mjs migrate');
    expect(manifest.scripts?.['db:status']).toBe('node src/migrate/cli.mjs status');
    expect(manifest.scripts?.['db:new']).toBe('node src/migrate/cli.mjs new');
    // `test:migrations` is the script CI's `migration-schema` job runs recursively; without it that
    // PRD §20.3 gate passes over an empty set.
    expect(manifest.scripts?.['test:migrations']).toBe('vitest run test/migrate');
    expect(manifest.scripts?.['test']).toBe('vitest run');
    expect(manifest.scripts?.['typecheck']).toBe('tsc -p tsconfig.json --noEmit');
  });

  it('records the Q13 decision in an ADR with the five required sections', () => {
    const adr = readFileSync(join(REPO_ROOT, 'docs', 'adr', ADR_PATH), 'utf8');
    expect(adr).toContain('## Status');
    expect(adr).toContain('## Context');
    expect(adr).toContain('## Decision');
    expect(adr).toContain('## Alternatives considered — Drizzle (rejected)');
    expect(adr).toContain('## Consequences');
    expect(adr).toMatch(/^Accepted/m);
    expect(adr).toContain('better-sqlite3');
    expect(adr).toContain('Kysely');
    // The number is part of the record. A file renamed without its title is a dangling citation.
    expect(adr.split('\n')[0]).toContain('ADR 0002');
    // Deliverable 1 (vi): the verified toolchain pair, not a floating range.
    expect(adr).toContain('Node.js `24.18.0`');
  });

  it("points the sub-PRD's D11 row at the ADR", () => {
    const subPrd = readFileSync(
      join(REPO_ROOT, 'docs', 'prd', '01-app-data', 'README.md'),
      'utf8',
    );
    // Both places the ticket names: the D11 decision row and acceptance item 8.
    const mentions = subPrd.split(`docs/adr/${ADR_PATH}`).length - 1;
    expect(mentions).toBeGreaterThanOrEqual(2);
  });
});
