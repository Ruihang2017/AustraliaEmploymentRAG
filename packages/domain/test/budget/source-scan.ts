/**
 * FND-09 — shared static-analysis helper for the money-purity and module-purity suites.
 *
 * Not a test file. `specifiersOf` is lifted verbatim from
 * `packages/contracts/test/enums/package-purity.test.ts` (already reviewed under `FND-03`);
 * `stripCommentsAndStrings` exists so a slash inside a docstring, an import specifier or a display
 * string is not a false positive for the "no division on money" scan.
 *
 * Every consumer asserts non-vacuity (the file list is non-empty and each scan finds a planted
 * synthetic positive) — a scanner that cannot detect anything discharges nothing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT } from './fixture.js';

export const BUDGET_SRC = join(PACKAGE_ROOT, 'src', 'budget');

export function sourceFiles(dir: string = BUDGET_SRC, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith('.ts')) found.push(path);
  }
  return found.sort();
}

export const readSource = (path: string): string => readFileSync(path, 'utf8');

export const relativeName = (path: string): string => path.slice(PACKAGE_ROOT.length + 1);

/**
 * Removes `//` line comments, block comments and single-quoted, double-quoted and backtick string
 * literals, replacing each string with an empty pair of quotes so token boundaries survive.
 *
 * Deliberately simple: `src/budget/**` contains no regular-expression literal (the money-purity
 * suite asserts it), so there is no `slash-delimited literal` ambiguity to resolve.
 */
export function stripCommentsAndStrings(text: string): string {
  const parts: string[] = [];
  let index = 0;
  const length = text.length;
  while (index < length) {
    const current = text.charAt(index);
    const next = text.charAt(index + 1);
    if (current === '/' && next === '/') {
      while (index < length && text.charAt(index) !== '\n') index += 1;
      continue;
    }
    if (current === '/' && next === '*') {
      index += 2;
      while (index < length && !(text.charAt(index) === '*' && text.charAt(index + 1) === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }
    if (current === "'" || current === '"' || current === '`') {
      index += 1;
      while (index < length) {
        const inner = text.charAt(index);
        if (inner === '\\') {
          index += 2;
          continue;
        }
        index += 1;
        if (inner === current) break;
      }
      parts.push('""');
      continue;
    }
    parts.push(current);
    index += 1;
  }
  return parts.join('');
}

/** Every module specifier in a file: static import/export, `import(...)` and `require(...)`. */
export function specifiersOf(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) found.push(specifier);
    }
  }
  return found;
}

/** Count of a literal substring in `text`. */
export function countOf(text: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
}
