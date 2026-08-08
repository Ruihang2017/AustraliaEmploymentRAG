/**
 * Package-relative paths for the tests that read source or the committed schema.
 *
 * Resolved from `import.meta.url`, never from the process working directory: the runner's cwd is the
 * repository root under `pnpm test` and the package directory under a filtered run, and a test that
 * silently reads nothing is a test that asserts nothing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `packages/observability/test/support/paths.ts` */
const thisFile = fileURLToPath(import.meta.url);

/** `packages/observability` */
export const PACKAGE_DIR = join(thisFile, '..', '..', '..');

/** `packages/observability/src` */
export const SRC_DIR = join(PACKAGE_DIR, 'src');

/**
 * Every implementation file under `src/`, as `{ name, text }`.
 *
 * `.d.ts` files are excluded on purpose: `src/node-builtins.d.ts` DECLARES Node built-ins (including
 * a test-only `node:crypto`), it does not call them, so including it would make the "no hashing in
 * src" and "no arbitrary object parameter" scans fail on a type declaration rather than on code.
 */
export function sourceFiles(): { name: string; text: string }[] {
  return readdirSync(SRC_DIR)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts'))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(SRC_DIR, name), 'utf8') }));
}

/** Reads a file relative to the package root. */
export function readPackageFile(...segments: string[]): string {
  return readFileSync(join(PACKAGE_DIR, ...segments), 'utf8');
}
