/**
 * Package-relative paths for the tests that read source as text.
 *
 * Resolved from `import.meta.url`, never from the process working directory: the runner's cwd is the
 * repository root under `pnpm test` and the package directory under a filtered run, and a test that
 * silently reads nothing is a test that asserts nothing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `packages/ui/test/support/paths.ts` */
const thisFile = fileURLToPath(import.meta.url);

/** `packages/ui` */
export const PACKAGE_DIR = join(thisFile, '..', '..', '..');

/** `packages/ui/src` */
export const SRC_DIR = join(PACKAGE_DIR, 'src');

/**
 * Every implementation file under `src/`, recursively, as `{ name, text }` where `name` is the
 * POSIX-style path relative to `src/`.
 *
 * `.d.ts` files are excluded on purpose: a declaration file declares, it does not call, so including
 * one would make the "no Node built-ins", "no browser globals" and "no local enum" scans fail on a
 * type declaration rather than on code.
 */
export function sourceFiles(): { name: string; text: string }[] {
  const found: { name: string; text: string }[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const childPrefix = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), childPrefix);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.d.ts')) continue;
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
      found.push({ name: childPrefix, text: readFileSync(join(dir, entry.name), 'utf8') });
    }
  };
  walk(SRC_DIR, '');
  return found.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Reads a file relative to the package root. */
export function readPackageFile(...segments: string[]): string {
  return readFileSync(join(PACKAGE_DIR, ...segments), 'utf8');
}

/**
 * Source text with block comments, line comments and string/template literal bodies removed, so a
 * scan for a forbidden construct cannot be tripped by prose that merely names it. Copied in shape
 * from `packages/observability/test/surface.test.ts`.
 */
export function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}
