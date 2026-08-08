/**
 * Shared helpers for the FND-04 OpenAPI suite.
 *
 * Two rules every test here obeys:
 *
 *   1. **Never mutate a repository file.** Acceptance item 6 asserts `git status --porcelain` is
 *      empty, and a test process that dies mid-edit leaves a dirty tree behind. Every negative case
 *      works on a deep copy in memory (`copyOf`), never with the `withTemporaryEdit` pattern
 *      `tools/tests/skeleton.test.mjs` uses.
 *   2. **Load the document once.** `loadOpenApiDocument()` compiles the meta-schema, which is the
 *      slow part; every test file shares the one parsed result through `document()`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020Module from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

import { loadOpenApiDocument } from '../../src/openapi/document.mjs';

/** packages/contracts/test/openapi -> repository root. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'contracts');

export type Json = Record<string, unknown>;

let cached: Json | null = null;

/** The parsed, meta-schema-validated `schemas/openapi/openapi.yaml`. */
export function document(): Json {
  cached ??= loadOpenApiDocument() as Json;
  return cached;
}

/** A JSON fixture from this directory. */
export function fixture<T = Json>(name: string): T {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'test', 'openapi', name), 'utf8')) as T;
}

/** A repository file's text. Read-only: nothing in this suite writes to the repository. */
export function repoText(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/** A structural deep copy, so a negative test can mutate freely without touching the original. */
export function copyOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * An Ajv 2020 instance WITH format assertion, for validating PRD §34 examples against their
 * declared schemas.
 *
 * The meta-schema pass in `document.mjs` deliberately runs with formats OFF (2020-12 makes `format`
 * an annotation unless the format-assertion vocabulary is declared, and the OAS meta-schema does not
 * declare it). Here formats are ON, because `official_url` really is meant to be a URI and
 * `legal_as_at` really is meant to be a date — this is the strict pass.
 */
export function exampleValidator(doc: Json): {
  compile: (ref: string) => (value: unknown) => boolean;
  errorsOf: (validate: unknown) => string;
} {
  const Ajv2020 = (Ajv2020Module as { default?: unknown }).default ?? Ajv2020Module;
  const addFormats = (addFormatsModule as { default?: unknown }).default ?? addFormatsModule;
  const AjvCtor = Ajv2020 as new (options: Json) => {
    addSchema: (schema: unknown, key: string) => void;
    getSchema: (key: string) => ((value: unknown) => boolean) | undefined;
  };
  const ajv = new AjvCtor({ strict: false, allErrors: true });
  (addFormats as (instance: unknown) => void)(ajv);

  // The whole document is registered under a stable id so `#/components/schemas/X` resolves exactly
  // as it does inside the document itself — no copying of subschemas, no chance of losing a $ref.
  const root = { $id: 'urn:aer:openapi', ...doc } as Json;
  ajv.addSchema(root, 'urn:aer:openapi');

  return {
    compile(ref: string) {
      const validate = ajv.getSchema(`urn:aer:openapi${ref}`);
      if (!validate) throw new Error(`no schema at ${ref}`);
      return validate;
    },
    errorsOf(validate: unknown) {
      const errors = (validate as { errors?: { instancePath: string; message?: string }[] }).errors ?? [];
      return errors.map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`).join('; ');
    },
  };
}

/**
 * The fenced ```json blocks under a `### …` heading in `docs/PRD.md`.
 *
 * Fails loudly when the heading does not resolve. A skipped example is a drift check that discharges
 * nothing, which is the exact vacuous-green failure mode FND-04's risk list calls out. Handles
 * `\r\n` because the working-tree copy is CRLF on a `core.autocrlf=true` checkout, while
 * `docs/PRD.md` itself is frozen and never written here.
 */
export function prdJsonBlocks(heading: string, prdPath = 'docs/PRD.md'): unknown[] {
  const lines = repoText(prdPath).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) throw new Error(`${prdPath}: heading not found: ${heading}`);

  const blocks: unknown[] = [];
  let fence: string[] | null = null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (fence === null && /^#{1,3} /.test(line)) break;
    if (fence === null) {
      if (line.trim() === '```json') fence = [];
      continue;
    }
    if (line.trim() === '```') {
      blocks.push(JSON.parse(fence.join('\n')));
      fence = null;
      continue;
    }
    fence.push(line);
  }
  if (fence !== null) throw new Error(`${prdPath}: unterminated json fence under ${heading}`);
  return blocks;
}

/**
 * The rows of a pipe-delimited markdown table under a `### …` heading, as arrays of trimmed cells.
 * Used to re-extract PRD §34.9 rather than trusting the transcription in the fixture.
 */
export function prdTableRows(heading: string, prdPath = 'docs/PRD.md'): string[][] {
  const lines = repoText(prdPath).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) throw new Error(`${prdPath}: heading not found: ${heading}`);

  const rows: string[][] = [];
  let seenTable = false;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = (lines[index] as string).trim();
    if (/^#{1,3} /.test(line)) break;
    if (!line.startsWith('|')) {
      if (seenTable) break;
      continue;
    }
    seenTable = true;
    const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue; // the separator row
    rows.push(cells);
  }
  if (rows.length === 0) throw new Error(`${prdPath}: no table under ${heading}`);
  return rows;
}
