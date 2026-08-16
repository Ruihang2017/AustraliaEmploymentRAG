import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PACKAGE_ROOT } from './helpers.js';

const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');

/**
 * Guard for the ONE place DATA-01 leaves its declared file-scope, and for the pin that made it
 * necessary.
 *
 * This file does not claim the exception is fine. The ticket's "Does not touch" list names "root
 * manifests, lockfiles, `tools/**`, `.github/workflows/**` (`00-foundation`)", and a single
 * `allowBuilds` key in the root `pnpm-workspace.yaml` is outside it. That key is here because it is
 * mechanically unavoidable, not because this ticket decided it was acceptable — measured on pnpm
 * 11.4.0 / Node 24.18.0:
 *
 *  - `pnpm install --frozen-lockfile` against a cold `node_modules` exits 1 with
 *    `ERR_PNPM_IGNORED_BUILDS` when `better-sqlite3` is declared and no root build policy names it.
 *    `strictDepBuilds` defaults to true and `better-sqlite3` ships a `binding.gyp`.
 *  - `dependenciesMeta: { better-sqlite3: { built: false } }` and a `pnpm` block in
 *    `packages/database/package.json` — both inside this ticket's write-owns — were tried and neither
 *    suppresses it. pnpm reads the build policy from the workspace root only.
 *  - Both candidate versions trip it: `12.11.1` needs `allowBuilds: true` (it has an `install` script
 *    that fetches a prebuild over the network), `13.0.3` needs `allowBuilds: false`.
 *
 * So the ticket's own deliverable — a declared `better-sqlite3` dependency — cannot be satisfied
 * inside the ticket's file-scope. That is a ticket/mechanics collision for the Architect and
 * `00-foundation` to settle, and it is filed as **M-Q4** in `docs/prd/01-app-data/README.md` under
 * the ticket's Feedback obligation. Until it is settled, these tests do two things:
 *
 *  1. bound DATA-01's OWN exception — `allowBuilds` is declared exactly once and carries exactly one
 *     entry, and nothing else is added to any root file, so a *second* DATA-01 root edit fails a
 *     test instead of riding along on this one;
 *  2. bind it to its escalation record — remove the M-Q4 entry and this suite fails. An
 *     out-of-file-scope edit that is no longer declared anywhere is the failure mode; an undeclared
 *     one must not be able to survive quietly.
 *
 * **What point 1 does NOT claim, and why (FND-25).** The governing principle: *a module may assert
 * that its own out-of-file-scope exception stays narrow; it may not assert that the file's owning
 * module never changes the file.* `pnpm-workspace.yaml` belongs to `00-foundation`/`FND-01`, and an
 * exhaustive claim over its whole top-level key set — which is what this test used to make — would
 * forbid the owner from editing its own file. `FND-23` added a `00-foundation`-owned
 * `overrides.nanoid` key here (GHSA-2v37-7h3g-55p8), correctly and inside its own single-key
 * carve-out, and it failed this suite for a reason that had nothing to do with it. `FND-25`
 * narrowed the assertion to `DATA-01`'s key alone and bounded the entry list at the next top-level
 * key. Other modules' keys are theirs to declare, not DATA-01's to forbid.
 *
 * The retirement condition in the M-Q4 assertion below is likewise about **`allowBuilds`
 * specifically** — the key DATA-01 borrowed. Another module adding a *different* top-level key to
 * this file is not that condition and does not retire this suite; DATA-01's exception is still live
 * and still undecided while `allowBuilds` sits where DATA-01 put it.
 *
 * `tools/tests/frozen-paths.test.mjs` lists none of these paths, so nothing else in the repository
 * catches any of it.
 */

/** A top-level key line of a flat, two-space-indented document. */
const TOP_LEVEL_KEY = /^[A-Za-z_][A-Za-z0-9_-]*\s*:/;

/** Top-level YAML keys of a flat, two-space-indented document. Enough for `pnpm-workspace.yaml`. */
function topLevelKeys(yaml: string): string[] {
  return yaml
    .split('\n')
    .filter((line) => TOP_LEVEL_KEY.test(line))
    .map((line) => line.slice(0, line.indexOf(':')).trim());
}

/**
 * The two-space-indented entries belonging to `key`, from **every** block that declares it, each
 * bounded at the next top-level key.
 *
 * Two failure modes, and this shape is the only one that closes both. Unbounded slicing to
 * end-of-file made a *later, different* key's entries join this list, which is what made a
 * `00-foundation` key fail `DATA-01`'s guard (FND-25). But bounding at the next top-level key and
 * reading only the *first* matching block opens the opposite hole: a second, wholly separate
 * `allowBuilds:` block appended lower down terminates the first block's scan and its own entries are
 * then never compared, so an arbitrary extra native-build policy — including a conflicting
 * `better-sqlite3: true` — rides in under an exact-equality check that still passes. The pre-FND-25
 * unbounded slice would have caught that; collecting every block keeps that strength while dropping
 * the over-reach into other keys.
 */
function entriesUnder(yaml: string, key: string): string[] {
  const lines = yaml.split('\n');
  const entries: string[] = [];
  lines.forEach((line, index) => {
    if (!line.startsWith(`${key}:`)) return;
    for (const candidate of lines.slice(index + 1)) {
      if (TOP_LEVEL_KEY.test(candidate)) break;
      if (/^ {2}\S/.test(candidate)) entries.push(candidate);
    }
  });
  return entries;
}

/**
 * Reads a repository file with CRLF normalised to LF.
 *
 * `core.autocrlf=true` gives a Windows working tree CRLF for the same commit CI checks out as LF, so
 * every byte-exact assertion below would otherwise pass on one platform and fail on the other. Same
 * reason `migrationChecksum` normalises before hashing.
 */
function repoText(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8').split('\r\n').join('\n');
}

describe('DATA-01 out-of-file-scope exception (root pnpm-workspace.yaml)', () => {
  it('is declared as an open escalation in the sub-PRD, not only in code', () => {
    const subPrd = repoText(join('docs', 'prd', '01-app-data', 'README.md'));
    const row = subPrd.split('\n').find((line) => line.startsWith('| M-Q4 |'));
    expect(
      row,
      'the pnpm-workspace.yaml exception must stay declared as M-Q4 in the sub-PRD Open questions ' +
        'table; if 00-foundation has taken over the `allowBuilds` key itself, remove the exception ' +
        'and this suite together. Another module adding a DIFFERENT top-level key to this file is ' +
        'not that condition and does not retire this suite (FND-25)',
    ).toBeTruthy();
    expect(row).toContain('pnpm-workspace.yaml');
    expect(row).toContain('00-foundation');
  });

  it('adds exactly one key to the root pnpm-workspace.yaml, carrying exactly one entry', () => {
    const workspace = repoText('pnpm-workspace.yaml');
    const keys = topLevelKeys(workspace);
    expect(keys).toContain('allowBuilds');
    // DATA-01 asserts only ITS key stays narrow; other
    // modules' keys are theirs to declare, not ours to forbid.
    // `toContain` alone is satisfied by a DUPLICATED `allowBuilds:` block, which is DATA-01's own
    // key twice over and squarely inside what DATA-01 has standing to forbid — so count it.
    expect(
      keys.filter((key) => key === 'allowBuilds'),
      'root pnpm-workspace.yaml declares allowBuilds more than once; DATA-01 borrowed exactly one ' +
        'key and a second block of it is a second, undeclared exception',
    ).toEqual(['allowBuilds']);

    const entries = entriesUnder(workspace, 'allowBuilds');
    expect(entries).toEqual(['  better-sqlite3: false']);

    // pnpm writes the key as a `set this to true or false` stub on the failing install; a stub left
    // behind is a broken install, not a decision.
    expect(workspace).not.toContain('set this to true or false');
  });

  it('leaves the FND-01 workspace globs byte-identical', () => {
    // The exception is an APPEND. Reordering or editing the `packages:` list would be a second,
    // undeclared change to a 00-foundation file hiding inside the declared one.
    // Bounded at the next top-level key rather than at the first `#` anywhere in the file, so a
    // comment placed above `packages:` cannot silently empty this comparison (FND-25). The expected
    // value is unchanged: the four glob lines, byte-for-byte, in order.
    const lines = repoText('pnpm-workspace.yaml').split('\n');
    const end = lines.findIndex((line, index) => index > 0 && TOP_LEVEL_KEY.test(line));
    const globs = lines
      .slice(0, end === -1 ? lines.length : end)
      .filter((line) => !line.trimStart().startsWith('#') && line.trim() !== '')
      .join('\n');
    expect(globs).toBe(["packages:", "  - 'apps/*'", "  - 'packages/*'", "  - 'tests/*'"].join('\n'));
  });

  it('adds no dependency-build policy to any other root manifest', () => {
    for (const key of [
      'allowBuilds',
      'onlyBuiltDependencies',
      'ignoredBuiltDependencies',
      'neverBuiltDependencies',
      'strict-dep-builds',
      'strictDepBuilds',
      'dangerouslyAllowAllBuilds',
    ]) {
      for (const path of ['package.json', '.npmrc']) {
        expect(repoText(path), `${path} carries ${key}, which DATA-01 does not own`).not.toContain(
          key,
        );
      }
      if (key === 'allowBuilds') continue;
      // Comments stripped: the file explains *why* `strictDepBuilds` forces the one key it does
      // carry, and a prose mention is not a setting.
      const settings = repoText('pnpm-workspace.yaml')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('\n');
      expect(
        settings,
        `pnpm-workspace.yaml carries ${key}, which DATA-01 does not own`,
      ).not.toContain(key);
    }
  });

  it('leaves the root package.json scripts and toolchain pins alone (ticket Non-goals)', () => {
    const root = JSON.parse(repoText('package.json')) as {
      scripts?: Record<string, string>;
      engines?: Record<string, string>;
      packageManager?: string;
      dependencies?: Record<string, string>;
    };
    // "No root package.json scripts. Root manifests are 00-foundation's."
    expect(Object.keys(root.scripts ?? {})).not.toContain('db:migrate');
    expect(root.dependencies).toBeUndefined();
    expect(root.engines?.['node']).toBe('24.18.0');
    expect(root.packageManager).toBe('pnpm@11.4.0');
  });

  it('leaves the tools/ workspace assertions to 00-foundation', () => {
    // DATA-01 must satisfy the repository-wide skeleton assertions, never relax them. The exact-pin
    // rule is the one this package's new dependencies are measured against; a rewrite that keeps the
    // title and drops the assertion is the violation this looks for.
    const skeleton = repoText('tools/tests/skeleton.test.mjs');
    expect(skeleton).toContain(
      "it('pins every member dependency to an exact version, with no range'",
    );
    expect(skeleton).toContain('EXACT_VERSION');
    expect(repoText('tools/workspace-assertions.mjs')).toContain('assertEntryFilesEmpty');
  });

  it('is not vacuous — the YAML key reader sees an appended block', () => {
    const tampered = "packages:\n  - 'packages/*'\nallowBuilds:\n  better-sqlite3: false\n";
    expect(topLevelKeys(tampered)).toEqual(['packages', 'allowBuilds']);
    expect(topLevelKeys("packages:\n  - 'packages/*'\n")).toEqual(['packages']);

    // `toContain` is weaker than the exhaustive `toEqual` it replaced (FND-25), so these prove the
    // narrowed assertions are properties and not just claims: the reader still sees a third key, the
    // containment check still has a failing case, and the entry list is bounded in either key order.
    const threeKeysAfter =
      "packages:\n  - 'packages/*'\nallowBuilds:\n  better-sqlite3: false\noverrides:\n  nanoid: 3.3.18\n";
    const threeKeysBefore =
      "packages:\n  - 'packages/*'\noverrides:\n  nanoid: 3.3.18\nallowBuilds:\n  better-sqlite3: false\n";
    const withoutAllowBuilds = "packages:\n  - 'packages/*'\noverrides:\n  nanoid: 3.3.18\n";

    // a third key is seen, in order — the containment check is not blind to it
    expect(topLevelKeys(threeKeysAfter)).toEqual(['packages', 'allowBuilds', 'overrides']);
    // the narrowed assertion can still FAIL: no allowBuilds means no containment
    expect(topLevelKeys(withoutAllowBuilds)).not.toContain('allowBuilds');
    // the entry list is bounded by the next top-level key, in either key order
    expect(entriesUnder(threeKeysAfter, 'allowBuilds')).toEqual(['  better-sqlite3: false']);
    expect(entriesUnder(threeKeysBefore, 'allowBuilds')).toEqual(['  better-sqlite3: false']);
    // and the bound is a bound, not a hard-coded stop at `overrides`
    expect(entriesUnder(threeKeysAfter, 'overrides')).toEqual(['  nanoid: 3.3.18']);

    // Regression (FND-25 review): a DUPLICATED `allowBuilds:` block must not be able to hide its
    // entries behind the bound. `toContain` passes trivially on a repeated key, and reading only the
    // first block would stop at the second `allowBuilds:` line and drop everything under it — so a
    // conflicting `better-sqlite3: true` would sail through an exact-equality check.
    const duplicatedKey =
      "packages:\n  - 'packages/*'\nallowBuilds:\n  better-sqlite3: false\nallowBuilds:\n  esbuild: false\n";
    const duplicatedConflict =
      "packages:\n  - 'packages/*'\nallowBuilds:\n  better-sqlite3: false\noverrides:\n  nanoid: 3.3.18\nallowBuilds:\n  better-sqlite3: true\n";
    expect(topLevelKeys(duplicatedKey)).toEqual(['packages', 'allowBuilds', 'allowBuilds']);
    // the occurrence count is what makes the duplicate visible — containment alone cannot see it
    expect(topLevelKeys(duplicatedKey)).toContain('allowBuilds');
    expect(topLevelKeys(duplicatedKey).filter((key) => key === 'allowBuilds')).toHaveLength(2);
    // every block's entries are compared, so the exact-equality check above still fails on both
    expect(entriesUnder(duplicatedKey, 'allowBuilds')).toEqual([
      '  better-sqlite3: false',
      '  esbuild: false',
    ]);
    expect(entriesUnder(duplicatedConflict, 'allowBuilds')).toEqual([
      '  better-sqlite3: false',
      '  better-sqlite3: true',
    ]);
    // and collecting every block did not re-open the original defect: a later DIFFERENT key's
    // entries still stay out of the list
    expect(entriesUnder(duplicatedConflict, 'overrides')).toEqual(['  nanoid: 3.3.18']);
  });
});

describe('DATA-01 tsconfig stays on the repo convention', () => {
  it('includes only src, like every other member', () => {
    // contracts/ and pii/ add individual `*.test-d.ts` entries, never the whole `test/` tree, and
    // vitest transpiles tests without typechecking them. Widening `include` to `test` silently
    // changes what `pnpm typecheck` means for this package only.
    const tsconfig = JSON.parse(repoText(join('packages', 'database', 'tsconfig.json'))) as {
      extends: string;
      include: string[];
    };
    expect(tsconfig.include).toEqual(['src']);
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
  });
});

describe('better-sqlite3 pin (breakdown plan §8 Q12)', () => {
  const manifest = JSON.parse(
    repoText(join('packages', 'database', 'package.json')),
  ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

  it('is exact, and is the version whose install runs no scripts', () => {
    expect(manifest.dependencies['better-sqlite3']).toBe('13.0.3');
    expect(manifest.devDependencies['@types/better-sqlite3']).toBe('9.6.0');
  });

  it('resolves to a package that declares no install/postinstall script', () => {
    // This is the whole reason the pin moved off the plan's `12.11.1` (recorded in the deviations
    // note and in ADR 0002 (vi)): 12.x runs `prebuild-install` from an `install` script, which
    // reaches GitHub releases over the network at install time and falls back to `node-gyp` when
    // that fetch fails. 13.x ships N-API prebuilds inside its own tarball and runs nothing.
    //
    // A future bump that reintroduces an install script would make `pnpm install` network-dependent
    // and would flip `allowBuilds` from `false` to `true` — a toolchain change, not a version bump.
    // It has to fail here rather than be discovered on an offline CI runner.
    const require = createRequire(join(PACKAGE_ROOT, 'package.json'));
    const resolved = require('better-sqlite3/package.json') as {
      version: string;
      scripts?: Record<string, string>;
    };
    expect(resolved.version).toBe('13.0.3');
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
      expect(
        resolved.scripts?.[hook],
        `better-sqlite3 ${resolved.version} declares a ${hook} script`,
      ).toBeUndefined();
    }
  });
});
