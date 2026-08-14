/**
 * EVID-07 — the source scanner shared by the architecture, purity and determinism suites.
 *
 * Ported from `packages/domain/test/budget/source-scan.ts`. Not a `*.test.*` file, so Vitest does not
 * collect it. Every helper here carries a positive control in the suites that use it: a scanner that
 * silently matches nothing is indistinguishable from clean code, and this package's whole no-tool
 * claim (PRD §37.5, sub-PRD D13) rests on these scanners actually firing.
 *
 * It strips COMMENTS *and* STRING LITERALS, because this leaf must be able to write the word
 * `'https:'` inside an origin check, and to name `RETR-07` in a refusal message, without those looking
 * like a web capability to a naive grep.
 */
import { readdirSync } from 'node:fs';
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

/** Comments removed, so a capability ban is a ban on CODE rather than on prose. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

/**
 * String and template literals blanked (their delimiters kept), so a specifier or a refusal message is
 * not mistaken for code. Line count and line numbers are preserved.
 */
export function stripStrings(source: string): string {
  return source
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, (match) => '``' + '\n'.repeat((match.match(/\n/g) ?? []).length));
}

/** Comments and strings both removed — the form every static assertion in this package scans. */
export function codeOnly(source: string): string {
  return stripStrings(stripComments(source));
}

/** Every exported binding name declared in a file, for the public-surface and no-external-action scans. */
export function exportedNames(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+type\s*\{([^}]*)\}|\bexport\s*\{([^}]*)\}/g,
  ];
  for (const match of source.matchAll(patterns[0] as RegExp)) {
    const name = match[1];
    if (name) found.push(name);
  }
  for (const match of source.matchAll(patterns[1] as RegExp)) {
    const block = match[1] ?? match[2];
    if (!block) continue;
    for (const clause of block.split(',')) {
      const trimmed = clause.trim().replace(/^type\s+/, '');
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+as\s+/);
      const exposed = (parts[1] ?? parts[0] ?? '').trim();
      if (exposed) found.push(exposed);
    }
  }
  return found;
}
