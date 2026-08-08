/**
 * FND-04 deliverable 4 — loading and validating `schemas/openapi/openapi.yaml`.
 *
 * WHY `.mjs` AND NOT `.ts` (sub-PRD D28b). Everything reachable from a `node …` CLI is `.mjs`:
 * `packages/contracts` has no TypeScript runner and adding one buys nothing here. `tsc` ignores
 * `.mjs` (`allowJs` is false), the same trade-off `tools/**` and `.github/workflows/checks/**`
 * already make. The single exception is `enum-drift.ts`, which must import FND-03's `ENUM_REGISTRY`
 * and is only ever executed by Vitest.
 *
 * NO NETWORK, EVER. The OpenAPI 3.1 meta-schema is vendored under `schemas/openapi/meta/` (see its
 * README for source, revision and licence), because FND-04's Harness requires validation to run
 * offline.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';
import Ajv2020Module from 'ajv/dist/2020.js';

const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;

/** packages/contracts/src/openapi -> repository root. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export const DOCUMENT_PATH = 'schemas/openapi/openapi.yaml';
export const META_SCHEMA_PATH = 'schemas/openapi/meta/oas-3.1-schema-2022-10-07.json';
export const EXAMPLES_DIR = 'schemas/openapi/examples';
export const BASELINE_PATH = 'schemas/openapi/baseline/v1.yaml';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** The HTTP methods an OpenAPI Path Item Object may declare, lowercase. */
export function httpMethods() {
  return [...HTTP_METHODS];
}

function repoPath(relative) {
  return isAbsolute(relative) ? relative : join(REPO_ROOT, relative);
}

/**
 * The vendored meta-schema, with its ONE `$dynamicRef` statically resolved.
 *
 * The OAS 3.1 schema declares Schema Objects as `{"$dynamicRef": "#meta"}` and puts the matching
 * `"$dynamicAnchor": "meta"` at `#/$defs/schema`, which is `{"type": ["object", "boolean"]}` — this
 * is the "without schema validation" variant, so a Schema Object is deliberately opaque to it.
 * Ajv 8's `$dynamicRef` resolution does not find an anchor that sits in `$defs` rather than at a
 * schema-resource root, and silently falls back to the document root, whose
 * `unevaluatedProperties: false` then rejects every `$ref`-shaped Schema Object. Resolving the
 * reference here reproduces exactly what the spec says it means when no other dialect is in scope,
 * and is therefore a fidelity fix, not a loosening: the vendored bytes on disk are untouched, and
 * the Schema Objects themselves are validated far more strictly elsewhere — every PRD §34 example
 * is compiled against its declared schema by test/openapi/prd-34-examples.test.ts.
 */
export function loadMetaSchema(path = META_SCHEMA_PATH) {
  const raw = JSON.parse(readFileSync(repoPath(path), 'utf8'));
  let resolvedDynamicRefs = 0;

  const rewrite = (node) => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (node === null || typeof node !== 'object') return node;
    if (node.$dynamicRef === '#meta') {
      resolvedDynamicRefs += 1;
      const rest = Object.fromEntries(
        Object.entries(node).filter(([key]) => key !== '$dynamicRef' && key !== '$dynamicAnchor'),
      );
      return { ...rewrite(rest), $ref: '#/$defs/schema' };
    }
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === '$dynamicAnchor') continue;
      out[key] = rewrite(value);
    }
    return out;
  };

  const schema = rewrite(raw);
  if (resolvedDynamicRefs === 0) {
    // Loud, never silent: if the vendored revision stops using `$dynamicRef: "#meta"` this function
    // has become a no-op that quietly validates nothing it used to.
    throw new Error(
      `${path}: expected at least one {"$dynamicRef": "#meta"}; the vendored meta-schema changed shape`,
    );
  }
  return { schema, resolvedDynamicRefs };
}

/**
 * An Ajv 2020 instance for the meta-schema pass.
 *
 * `validateFormats` is OFF here and ON for example validation, and the asymmetry is deliberate.
 * JSON Schema 2020-12 makes `format` an ANNOTATION unless the format-assertion vocabulary is
 * declared, and the OAS 3.1 meta-schema does not declare it — so asserting formats against the
 * meta-schema is stricter than the specification, and it wrongly rejects `externalValue` values
 * like `examples/prd-34-2-search-request.json`, which OAS explicitly allows ("relative references
 * are resolved against the location of the OAS document"). Nothing is lost: every `externalValue`
 * is checked far more strongly than a URI regex by `unresolvedExternalValues()`, which asserts the
 * file actually exists.
 */
let compiledMetaSchema = null;

function metaSchemaValidator() {
  if (compiledMetaSchema === null) {
    const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
    const { schema } = loadMetaSchema();
    compiledMetaSchema = ajv.compile(schema);
  }
  return compiledMetaSchema;
}

/**
 * Meta-schema errors for an arbitrary document, as readable strings; `[]` when it is valid.
 *
 * Exported so a test can validate an in-memory MUTATED COPY and prove the meta-schema pass really
 * rejects something — a validator nobody has ever seen fail is indistinguishable from one that
 * always returns true.
 */
export function metaSchemaErrors(document) {
  const validate = metaSchemaValidator();
  if (validate(document)) return [];
  return (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`);
}

/** Every `{ $ref: … }` in the document, as `{ pointer, ref }`, in document order. */
export function collectRefs(document) {
  const refs = [];
  const walk = (node, pointer) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${pointer}/${index}`));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const child = `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      if (key === '$ref' && typeof value === 'string') refs.push({ pointer: child, ref: value });
      else walk(value, child);
    }
  };
  walk(document, '');
  return refs;
}

/** Resolve a local JSON pointer (`#/a/b`) against `document`, or `undefined`. */
export function resolvePointer(document, ref) {
  if (!ref.startsWith('#/')) return undefined;
  let node = document;
  for (const rawSegment of ref.slice(2).split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || typeof node !== 'object' || !(segment in node)) return undefined;
    node = node[segment];
  }
  return node;
}

/** Refs that do not resolve. Anything not local to this document is reported, never ignored. */
export function unresolvedRefs(document) {
  return collectRefs(document)
    .filter(({ ref }) => !ref.startsWith('#/') || resolvePointer(document, ref) === undefined)
    .map(({ pointer, ref }) => `${pointer}: ${ref}`);
}

/** Every `externalValue` in the document, as `{ pointer, value }`. */
export function collectExternalValues(document) {
  const found = [];
  const walk = (node, pointer) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${pointer}/${index}`));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const child = `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      if (key === 'externalValue' && typeof value === 'string') found.push({ pointer: child, value });
      else walk(value, child);
    }
  };
  walk(document, '');
  return found;
}

/**
 * `externalValue` entries whose file does not exist, resolved relative to `baseDir`.
 *
 * `baseDir` defaults to the document's own directory, which is what OAS specifies ("relative
 * references are resolved against the location of the OAS document"). The compatibility BASELINE is
 * a verbatim capture that lives one directory deeper, so it passes the published document's
 * directory explicitly — its `externalValue`s were written relative to `schemas/openapi/` and
 * re-pointing them would make it something other than a byte-for-byte capture.
 */
export function unresolvedExternalValues(document, documentPath = DOCUMENT_PATH, baseDir = null) {
  const base = baseDir === null ? dirname(repoPath(documentPath)) : repoPath(baseDir);
  return collectExternalValues(document)
    .filter(({ value }) => !existsSync(join(base, value)))
    .map(({ pointer, value }) => `${pointer}: ${value}`);
}

/** Every declared operation, as `{ path, method, operation, pathItem }`. */
export function operations(document) {
  const found = [];
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) found.push({ path, method, operation: pathItem[method], pathItem });
    }
  }
  return found;
}

/** `servers[0].url + pathKey` — the composition PRD §16.2's absolute paths are replayed against. */
export function absolutePath(document, pathKey) {
  const base = document.servers?.[0]?.url ?? '';
  return `${base}${pathKey}`;
}

/**
 * Parse `schemas/openapi/openapi.yaml`, validate it against the vendored OAS 3.1 meta-schema, and
 * fail loudly on any `$ref` or `externalValue` that does not resolve.
 *
 * Loud, never silent — the precedent FND-03's `getEnumValues` set. A loader that returned a
 * partially-valid document would make every check downstream of it meaningless.
 */
export function loadOpenApiDocument(documentPath = DOCUMENT_PATH, externalValueBase = null) {
  const absolute = repoPath(documentPath);
  const text = readFileSync(absolute, 'utf8');
  const document = YAML.parse(text);
  if (document === null || typeof document !== 'object') {
    throw new Error(`${documentPath}: parsed to ${typeof document}, expected an object`);
  }

  const validate = metaSchemaValidator();
  if (!validate(document)) {
    const detail = (validate.errors ?? [])
      .slice(0, 10)
      .map((error) => `  ${error.instancePath || '/'} ${error.message}`)
      .join('\n');
    throw new Error(
      `${documentPath} is not a valid OpenAPI 3.1 document (${validate.errors?.length ?? 0} errors):\n${detail}`,
    );
  }

  const badRefs = unresolvedRefs(document);
  if (badRefs.length > 0) {
    throw new Error(`${documentPath}: unresolved $ref:\n  ${badRefs.join('\n  ')}`);
  }

  const badExamples = unresolvedExternalValues(document, documentPath, externalValueBase);
  if (badExamples.length > 0) {
    throw new Error(`${documentPath}: externalValue points at no file:\n  ${badExamples.join('\n  ')}`);
  }

  return document;
}
