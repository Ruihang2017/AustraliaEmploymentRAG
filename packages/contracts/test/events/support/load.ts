/**
 * Shared loading for the FND-05 event suites. Not a test file — vitest collects only `*.test.*`.
 *
 * ## CRLF discipline (read this before comparing any two texts here)
 *
 * `git config core.autocrlf` is `true` on a default Git-for-Windows checkout and `.gitattributes` is
 * unallocated by breakdown plan §4, so a file committed with LF is checked out with CRLF on Windows
 * and with LF in CI. Every read in this module therefore normalises `\r\n` -> `\n`;
 * `tools/tests/line-endings.test.mjs` solves the same problem the same way, by reading the committed
 * blob. `committedBlobs()` and `committedBlob()` below are the authoritative-bytes escape hatches
 * for the tests that need them.
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

/**
 * The committed bytes of repo-relative paths, or `null` for paths not committed yet.
 *
 * FND-14: committed blobs must be read in ONE git process. A reader that spawns one process per file
 * is a defect in this repository, not a style preference. 13 × `git show` cost 610 ms idle and
 * 2102 ms under a 20-way CPU burn, timing the LF check out at 5145 ms against vitest's 5000 ms
 * default during the 8-project parallel `pnpm test`; the package run alone was green in 3.91 s.
 * One `git cat-file --batch` over the same 13 paths costs 70 ms idle / 200 ms loaded.
 *
 * Transferable lesson: a test that spawns a process per item is measured in the parallel workspace
 * run, never in the single-package run. The property being read — LF in every committed blob (PRD
 * §20.1 / sub-PRD D29) — is unchanged, and batching must never become sampling.
 */
export function committedBlobs(relativePaths: readonly string[]): Map<string, Buffer | null> {
  if (relativePaths.length === 0) return new Map();

  for (const relativePath of relativePaths) {
    if (relativePath.includes('\n') || relativePath.includes('\r')) {
      throw new Error(`invalid committed-blob path containing a line break: ${relativePath}`);
    }
  }

  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: REPO_ROOT,
    encoding: 'buffer',
    input: Buffer.from(relativePaths.map((path) => `HEAD:${path}\n`).join(''), 'utf8'),
    maxBuffer: 64 * 1024 * 1024,
  });

  const stderr = Buffer.isBuffer(result.stderr)
    ? result.stderr.toString('utf8')
    : String(result.stderr ?? '');
  const fail = (relativePath: string, reason: string): never => {
    throw new Error(`git cat-file --batch failed for ${relativePath}: ${reason}; stderr: ${stderr}`);
  };
  const firstPath = relativePaths[0] as string;
  if (result.error) fail(firstPath, result.error.message);
  if (result.status !== 0) fail(firstPath, `exit status ${String(result.status)}`);
  if (!result.stdout || !Buffer.isBuffer(result.stdout)) fail(firstPath, 'missing stdout');

  const stdout = result.stdout;
  const blobs = new Map<string, Buffer | null>();
  let offset = 0;
  let responseCount = 0;
  for (const relativePath of relativePaths) {
    const headerEnd = stdout.indexOf(0x0a, offset);
    if (headerEnd === -1) {
      fail(
        relativePath,
        `response count ${responseCount} differs from request count ${relativePaths.length}: header has no terminating LF`,
      );
    }

    const header = stdout.subarray(offset, headerEnd).toString('utf8');
    const fields = header.split(' ');
    const last = fields.at(-1) ?? fail(relativePath, `unparseable header: ${header}`);
    if (last.length === 0) fail(relativePath, `unparseable header: ${header}`);
    if (fields.length < 2) fail(relativePath, `unparseable header: ${header}`);
    offset = headerEnd + 1;

    if (last === 'missing') {
      blobs.set(relativePath, null);
      responseCount += 1;
      continue;
    }

    if (fields.length !== 3 || !fields[0]) fail(relativePath, `unparseable header: ${header}`);
    const type = fields.at(-2);
    if (type !== 'blob') fail(relativePath, `declared type is not blob: ${header}`);
    if (!/^\d+$/.test(last)) fail(relativePath, `invalid declared size: ${header}`);
    const size = Number(last);
    if (!Number.isSafeInteger(size) || size < 0) fail(relativePath, `invalid declared size: ${header}`);
    const contentEnd = offset + size;
    if (contentEnd >= stdout.length) fail(relativePath, `declared size runs past stdout: ${header}`);
    if (stdout[contentEnd] !== 0x0a) fail(relativePath, `response has no trailing LF: ${header}`);
    blobs.set(relativePath, Buffer.from(stdout.subarray(offset, contentEnd)));
    offset = contentEnd + 1;
    responseCount += 1;
  }

  if (responseCount !== relativePaths.length) {
    fail(firstPath, `response count ${responseCount} differs from request count ${relativePaths.length}`);
  }
  if (offset !== stdout.length) fail(firstPath, `${stdout.length - offset} unconsumed stdout bytes`);
  return blobs;
}

/** The committed bytes of a repo-relative path, or `null` when it is not committed yet. */
export function committedBlob(relativePath: string): Buffer | null {
  return committedBlobs([relativePath]).get(relativePath) ?? null;
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
