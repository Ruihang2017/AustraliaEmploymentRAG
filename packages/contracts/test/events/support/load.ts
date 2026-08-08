/**
 * Shared loading for the FND-05 event suites. Not a test file — vitest collects only `*.test.*`.
 *
 * ## CRLF discipline (read this before comparing any two texts here)
 *
 * `git config core.autocrlf` is `true` on a default Git-for-Windows checkout and `.gitattributes` is
 * unallocated by breakdown plan §4, so a file committed with LF is checked out with CRLF on Windows
 * and with LF in CI. Every read in this module therefore normalises `\r\n` -> `\n`;
 * `tools/tests/line-endings.test.mjs` solves the same problem the same way, by reading the committed
 * blob. `committedBlob()` below is the authoritative-bytes escape hatch for the tests that need it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPPORT_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/contracts/test/events */
export const EVENTS_TEST_DIR = resolve(SUPPORT_DIR, '..');
/** packages/contracts */
export const PACKAGE_ROOT = resolve(EVENTS_TEST_DIR, '..', '..');
export const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');
export const SCHEMA_ROOT = join(REPO_ROOT, 'schemas', 'events');
export const FIXTURES_DIR = join(EVENTS_TEST_DIR, 'fixtures');

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Working-tree text, normalised to LF. */
export function readText(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf8').replace(/\r\n/g, '\n');
}

export function readJson(absolutePath: string): JsonObject {
  return JSON.parse(readText(absolutePath)) as JsonObject;
}

/** A fixture's normalised text. */
export function fixtureText(name: string): string {
  return readText(join(FIXTURES_DIR, name));
}

/**
 * The canonical raw body of a fixture: its normalised text with the single trailing newline removed.
 *
 * `.editorconfig` requires every committed file to end with a newline; a real HTTP body does not have
 * one. Signing the file's bytes as-is would sign a body no sender ever transmits.
 */
export function rawBody(name: string): string {
  const text = fixtureText(name);
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

/** The committed bytes of a repo-relative path, or `null` when it is not committed yet. */
export function committedBlob(relativePath: string): Buffer | null {
  const result = spawnSync('git', ['show', `HEAD:${relativePath}`], {
    cwd: REPO_ROOT,
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : null;
}

export interface RegistryEntry {
  readonly schema: string;
  readonly version: string;
  readonly schema_version: string;
}

export interface EventRegistry {
  readonly webhook: {
    readonly envelope: RegistryEntry;
    readonly types: Readonly<Record<string, RegistryEntry>>;
  };
  readonly sse: { readonly types: Readonly<Record<string, RegistryEntry>> };
}

export function loadRegistry(): EventRegistry {
  return readJson(join(SCHEMA_ROOT, 'registry.json')) as unknown as EventRegistry;
}

/** Every `*.json` under `schemas/events/**` except the registry, as `/`-separated relative paths. */
export function schemaFilePaths(root: string = SCHEMA_ROOT): string[] {
  const found: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name.endsWith('.json')) found.push(`${prefix}${entry.name}`);
    }
  };
  walk(root, '');
  return found.filter((path) => path !== 'registry.json');
}

/** One schema, by its registry-relative path. */
export function loadSchema(relativePath: string): JsonObject {
  return readJson(join(SCHEMA_ROOT, relativePath));
}

/** Every schema, keyed by registry-relative path, in sorted path order. */
export function loadAllSchemas(): Map<string, JsonObject> {
  return new Map(schemaFilePaths().map((path) => [path, loadSchema(path)]));
}

export interface SigningFixture {
  readonly secret: string;
  readonly rotatedSecret: string;
  readonly timestampSeconds: number;
  readonly expectedSignature: string;
  readonly placeholders: Readonly<Record<string, string>>;
}

export function loadSigning(): SigningFixture {
  return readJson(join(FIXTURES_DIR, 'signing.json')) as unknown as SigningFixture;
}

/** Applies the committed substitution map to a verbatim PRD text. Longest key first, so no key is a
 * prefix-shadow of another. */
export function substitute(text: string, placeholders: Readonly<Record<string, string>>): string {
  const keys = Object.keys(placeholders).sort((a, b) => b.length - a.length);
  let out = text;
  for (const key of keys) out = out.split(key).join(placeholders[key] as string);
  return out;
}

/** The `data:` JSON of an SSE frame, plus its `event:` type. */
export function parseSseFrame(text: string): { type: string; data: JsonObject } {
  const lines = text.replace(/\n$/, '').split('\n');
  const eventLine = lines.find((line) => line.startsWith('event: '));
  const dataLine = lines.find((line) => line.startsWith('data: '));
  if (!eventLine || !dataLine) throw new Error(`not an SSE frame:\n${text}`);
  return {
    type: eventLine.slice('event: '.length),
    data: JSON.parse(dataLine.slice('data: '.length)) as JsonObject,
  };
}
