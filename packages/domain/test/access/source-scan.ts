/**
 * FND-06 — the source scanner `purity.test.ts` uses. A COPY of FND-09s `test/budget/source-scan.ts`
 * because sub-PRD D10 forbids importing a sibling leafs helper.
 *
 * Not a `*.test.*` file. Every helper here has a positive control in the suites that use it: a scanner
 * that silently matches nothing is indistinguishable from clean code.
 *
 * It strips COMMENTS *and* STRING LITERALS, so a ban on a token is a ban on CODE: this leaf must be
 * able to name its own modules and to carry the PRD cell text without either being mistaken for one.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith('.ts')) found.push(path);
  }
  return found;
}

/** Repository-style relative name with forward slashes, whatever the platform. */
export function named(root: string, file: string): string {
  return relative(root, file).split(sep).join('/');
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

/** Comments removed, so a determinism or money ban is a ban on CODE rather than on prose. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

/**
 * String and template literals blanked (their delimiters kept), so `'./micro-aud.js'` is not a
 * division and `'A$14–15'` is not a float. Line count and line numbers are preserved.
 */
export function stripStrings(source: string): string {
  return source
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, (match) => '``' + '\n'.repeat((match.match(/\n/g) ?? []).length));
}

/** Comments and strings both removed — the form every static assertion in this leaf scans. */
export function codeOnly(source: string): string {
  return stripStrings(stripComments(source));
}

export interface SourceLine {
  readonly file: string;
  readonly lineNumber: number;
  readonly text: string;
}

/** Every code-only line of every file, tagged with where it came from. */
export function codeLines(root: string, files: readonly string[]): SourceLine[] {
  const lines: SourceLine[] = [];
  for (const file of files) {
    const source = codeOnly(readFileSync(file, 'utf8'));
    for (const [index, text] of source.split('\n').entries()) {
      lines.push({ file: named(root, file), lineNumber: index + 1, text });
    }
  }
  return lines;
}
