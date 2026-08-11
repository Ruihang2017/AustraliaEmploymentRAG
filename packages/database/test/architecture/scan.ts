/**
 * The SEC-001 scanner: walk the repository, collect every import specifier, and report the ones that
 * reach past `packages/database`'s public entry.
 *
 * # Why this is AST-based and not a grep
 *
 * The repository already contains ~17 files that carry the strings `better-sqlite3` and
 * `from 'kysely'` **inside string literals**, because they are themselves purity tests holding those
 * names as test data (`apps/api/test/dependency-direction.test.ts`,
 * `packages/contracts/test/enums/package-purity.test.ts`, several `packages/domain/test/**`,
 * `packages/pii/test/**`). A text scanner reports all of them on a clean tree, which does not read as
 * "the repository is broken" — it reads as "this test is broken", and the usual response to that is
 * an allowlist. An allowlist would then grow with every future purity test and quietly hide the real
 * violation this control exists to catch.
 *
 * So the scanner parses. `typescript` is a root devDependency and resolves from here through Node's
 * ordinary upward lookup; it is a test-only dependency of a test-only module, and no production code
 * imports it.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type * as TS from 'typescript';

const require = createRequire(import.meta.url);

function loadTypeScript(): typeof TS {
  try {
    return require('typescript') as typeof TS;
  } catch (error) {
    throw new Error(
      'the SEC-001 architecture scanner needs the `typescript` package (a root devDependency) to ' +
        'parse source files. A text-based fallback is not acceptable here: it reports false ' +
        "positives on this repository's own purity tests.",
      { cause: error },
    );
  }
}

const ts = loadTypeScript();

/** `packages/database` */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The repository root. */
export const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'target',
  '.venv',
  '__pycache__',
  'coverage',
]);

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];

/**
 * The one directory the scan skips by design.
 *
 * `packages/database/src/**` is *supposed* to import the driver and the query builder — it is the
 * package that owns them. The rule is about everything else. (The in-package rules are asserted
 * separately by `test/tenant/purity.test.ts`.)
 */
const OWNING_PACKAGE = `${resolve(REPO_ROOT, 'packages', 'database')}${sep}`;

export type ViolationTag =
  /** A bare `better-sqlite3` (or subpath) import outside the owning package. */
  | 'better-sqlite3'
  /** A bare `kysely` (or subpath) import — breakdown plan §8 Q13's last clause. */
  | 'kysely'
  /** A relative path reaching `packages/database/src/tenant/connection*`. */
  | 'connection-module'
  /** A relative path reaching anywhere else under `packages/database/src/**`. */
  | 'database-src-deep-path'
  /** A `@taxrag/database/src/...` package subpath. */
  | 'database-package-deep-path';

export interface Violation {
  /** Repository-relative, forward-slashed, so assertions read the same on every platform. */
  readonly file: string;
  readonly specifier: string;
  readonly tag: ViolationTag;
}

function relativePosix(absolute: string): string {
  return relative(REPO_ROOT, absolute).split(sep).join('/');
}

/** Every source file under `root`, minus the skipped directories and the owning package. */
export function walk(root: string = REPO_ROOT): string[] {
  const found: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        if (`${full}${sep}` === OWNING_PACKAGE) continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue;
      found.push(full);
    }
  }
  return found.sort();
}

/**
 * Every module specifier in `source`, from all five forms that can pull a module in.
 *
 * Static `import`/`export … from`, `import x = require(...)`, dynamic `import(...)` and `require(...)`
 * are all collected. A specifier that is not a plain string literal (a computed `require(name)`) is
 * not collected, and cannot be: that is a documented limit, not an oversight — a module reached that
 * way is invisible to any static analysis, and the compensating control is that the `exports` map
 * gives it nothing to reach.
 */
export function importSpecifiers(source: string, fileName = 'input.ts'): string[] {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];

  const literal = (node: TS.Node | undefined): void => {
    if (node !== undefined && ts.isStringLiteralLike(node)) found.push(node.text);
  };

  const visit = (node: TS.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      literal(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) literal(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isDynamicImport || isRequire) literal(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return found;
}

function classify(file: string, specifier: string): ViolationTag | undefined {
  if (specifier === 'better-sqlite3' || specifier.startsWith('better-sqlite3/')) {
    return 'better-sqlite3';
  }
  if (specifier === 'kysely' || specifier.startsWith('kysely/')) return 'kysely';
  if (specifier.startsWith('@taxrag/database/')) {
    const subpath = specifier.slice('@taxrag/database/'.length);
    if (!subpath.startsWith('src/')) return undefined;
    return subpath.startsWith('src/tenant/connection')
      ? 'connection-module'
      : 'database-package-deep-path';
  }
  if (specifier.startsWith('.')) {
    const target = resolve(dirname(file), specifier);
    const databaseSrc = resolve(REPO_ROOT, 'packages', 'database', 'src');
    if (target === databaseSrc || target.startsWith(`${databaseSrc}${sep}`)) {
      const asPosix = relativePosix(target);
      return asPosix.includes('/src/tenant/connection')
        ? 'connection-module'
        : 'database-src-deep-path';
    }
  }
  return undefined;
}

/** Scans `files` (default: the whole repository) and returns every violation found. */
export function scanForUnscopedAccess(files: string[] = walk()): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const specifier of importSpecifiers(source, file)) {
      const tag = classify(file, specifier);
      if (tag !== undefined) violations.push({ file: relativePosix(file), specifier, tag });
    }
  }
  return violations;
}

/** `true` when `path` is a directory that exists. */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
