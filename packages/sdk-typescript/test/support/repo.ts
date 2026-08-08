/**
 * Shared loading for this package's suites. Not a test file — vitest collects only `*.test.*`.
 *
 * ## CRLF discipline
 *
 * `core.autocrlf=true` is the Git-for-Windows default and `.gitattributes` is unallocated by
 * breakdown plan §4, so a file committed with LF is checked out with CRLF on Windows and with LF in
 * CI. Every read here normalises `\r\n` -> `\n`, exactly as
 * `packages/contracts/test/events/support/load.ts` and `tools/tests/line-endings.test.mjs` do.
 *
 * `rawBody()` additionally strips the single trailing newline `.editorconfig` requires of a committed
 * file: a real HTTP body does not have one, and signing the file's bytes as-is would verify a body no
 * sender ever transmits.
 *
 * Reads are unrestricted across the repository (breakdown plan §4); WRITES are confined to
 * `packages/sdk-typescript/**`, and nothing here writes anything.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPPORT_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/sdk-typescript/test */
export const TEST_DIR = resolve(SUPPORT_DIR, '..');
/** packages/sdk-typescript */
export const PACKAGE_ROOT = resolve(TEST_DIR, '..');
export const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');
export const FIXTURES_DIR = join(TEST_DIR, 'fixtures');

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Working-tree text, normalised to LF. */
export function readText(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf8').replace(/\r\n/g, '\n');
}

export function readJson<T = JsonObject>(absolutePath: string): T {
  return JSON.parse(readText(absolutePath)) as T;
}

/** A fixture's normalised text. `name` is relative to `test/fixtures`. */
export function fixtureText(name: string): string {
  return readText(join(FIXTURES_DIR, name));
}

export function fixtureJson<T = JsonObject>(name: string): T {
  return JSON.parse(fixtureText(name)) as T;
}

/** A committed file's canonical raw body: normalised, with the single trailing newline removed. */
export function rawBody(text: string): string {
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

/** `schemas/openapi/examples/<name>` as text. */
export function openApiExampleText(name: string): string {
  return readText(join(REPO_ROOT, 'schemas', 'openapi', 'examples', name));
}

/** `schemas/events/sse/v1/<type>.json`. */
export function sseSchema(type: string): JsonObject {
  return readJson<JsonObject>(join(REPO_ROOT, 'schemas', 'events', 'sse', 'v1', `${type}.json`));
}

/** `packages/contracts/test/events/fixtures/<name>` — FND-05's committed webhook fixtures. */
export function contractsEventFixture(name: string): string {
  return readText(join(REPO_ROOT, 'packages', 'contracts', 'test', 'events', 'fixtures', name));
}

/** Every `.ts` file under `src/`, as `{ path, text }`, for the structural source scans. */
export function sourceFiles(root: string = join(PACKAGE_ROOT, 'src')): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name.endsWith('.ts')) {
        found.push({ path: `${prefix}${entry.name}`, text: readText(join(dir, entry.name)) });
      }
    }
  };
  walk(root, '');
  return found;
}

/**
 * `text` with block comments, line comments and string/template literals blanked out.
 *
 * Every "this package contains no X" scan runs over THIS, not over the raw text. A scan over raw text
 * is unusable the moment a doc comment has to *name* the thing it forbids — which every honest
 * comment about a forbidden API does — and a reviewer cannot tell a real call from a mention.
 */
export function stripCommentsAndStrings(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const two = text.slice(i, i + 2);
    if (two === '//') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? n : end;
      continue;
    }
    if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    const ch = text[i] as string;
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < n) {
        const c = text[i] as string;
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      out += '""';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * `text` with comments removed but string literals KEPT.
 *
 * The right input for a scan whose subject IS a string literal — a header name, an import specifier,
 * a URL segment. `stripCommentsAndStrings` would blank exactly the evidence such a scan looks for.
 */
export function stripComments(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const two = text.slice(i, i + 2);
    if (two === '//') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? n : end;
      continue;
    }
    if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    const ch = text[i] as string;
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < n) {
        const c = text[i] as string;
        out += c;
        if (c === '\\') {
          out += text[i + 1] ?? '';
          i += 2;
          continue;
        }
        i += 1;
        if (c === quote) break;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** `src/**` with comments and string literals blanked out — for scans whose subject is an identifier. */
export function sourceCodeOnly(): { path: string; text: string }[] {
  return sourceFiles().map(({ path, text }) => ({ path, text: stripCommentsAndStrings(text) }));
}

/** `src/**` with comments removed and string literals kept — for scans whose subject is a literal. */
export function sourceWithoutComments(): { path: string; text: string }[] {
  return sourceFiles().map(({ path, text }) => ({ path, text: stripComments(text) }));
}
