/**
 * FND-04 deliverable 6 — the generated-TypeScript emitter.
 *
 * PURE BY CONSTRUCTION. `emit(document)` takes a parsed document and returns
 * `Map<relativePath, contents>`. It touches no `fs`, no `Date`, no `process.cwd()`, no absolute
 * path, no `package.json` version. That purity is the whole reason `generated:check` is honest:
 * a generator that could observe the clock or the working directory would produce a diff that
 * depends on when and where it ran, which falsifies DEV-001's "generated-client diff is clean in
 * CI" (FND-04 Feedback obligation 4 makes that an escalation, never a loosened comparison).
 *
 * WHY AN OWN EMITTER AND NOT A THIRD-PARTY GENERATOR (sub-PRD D28a): the schemas are ours and a
 * bounded subset; a third-party generator adds version-driven output churn, a formatter and a
 * banner-injection problem for no benefit, and the Python core (`PLTF-03`) generates from the same
 * YAML with its own toolchain, so nothing downstream depends on this choice. Deviating to one, or
 * failing to achieve determinism, raises `docs/adr/NNNN-openapi-codegen.md`.
 *
 * DETERMINISM RULES, applied everywhere without exception:
 *   * every map is emitted in LEXICOGRAPHIC key order — never document order, never insertion order;
 *   * every file ends with exactly one `\n` and uses LF throughout (see `generated-check.mjs` for
 *     why that matters on a `core.autocrlf=true` Windows checkout);
 *   * nothing is interpolated that is not derived from the document.
 *
 * NO RUNTIME PATH. Types, `const` maps and unions only — no `fetch`, no client instance, no I/O.
 * FND-04's PR statement asserts "no runtime path"; this file is what keeps that true.
 */
import { httpMethods, operations } from './document.mjs';

export const BANNER = '// GENERATED FROM schemas/openapi/openapi.yaml — DO NOT EDIT (PRD §20.1)';
/**
 * Line 2 of every emitted file.
 *
 * Deliberately NOT `/* eslint-disable *\/`. Root `pnpm lint` covers `packages/**`, the emitted output
 * is already lint-clean, and ESLint reports an unused disable directive as a warning — so the
 * belt-and-braces version would add five warnings to every lint run and, worse, would hide a real
 * problem if the emitter ever started producing one. If generated output stops passing lint, that is
 * a bug in the emitter and `pnpm lint` should say so.
 */
export const REGENERATE_HINT =
  '// Regenerate with `pnpm generate`; `pnpm generated:check` fails on a hand edit.';
export const GENERATED_DIR = 'src/generated';

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const METHODS = httpMethods();

function sorted(record) {
  return Object.keys(record ?? {}).sort();
}

function quoteKey(name) {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

function pascalCase(value) {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function refName(ref) {
  const prefix = '#/components/schemas/';
  if (!ref.startsWith(prefix)) {
    throw new Error(`emit: only #/components/schemas/* refs are emittable, got ${ref}`);
  }
  return ref.slice(prefix.length);
}

function typeList(schema) {
  if (schema.type === undefined) return null;
  return Array.isArray(schema.type) ? [...schema.type].sort() : [schema.type];
}

function objectType(schema, indent) {
  const properties = schema.properties;
  if (!properties || Object.keys(properties).length === 0) {
    const extra = schema.additionalProperties;
    if (extra && typeof extra === 'object') {
      return `Readonly<Record<string, ${tsType(extra, indent)}>>`;
    }
    return 'Readonly<Record<string, unknown>>';
  }
  const required = new Set(schema.required ?? []);
  const pad = '  '.repeat(indent + 1);
  const close = '  '.repeat(indent);
  const lines = sorted(properties).map((name) => {
    const optional = required.has(name) ? '' : '?';
    return `${pad}readonly ${quoteKey(name)}${optional}: ${tsType(properties[name], indent + 1)};`;
  });
  return `{\n${lines.join('\n')}\n${close}}`;
}

/** The TypeScript type for one schema node. The subset is exactly what this document uses. */
export function tsType(schema, indent = 0) {
  if (schema === true) return 'unknown';
  if (schema === false) return 'never';
  if (!schema || typeof schema !== 'object') return 'unknown';

  if (typeof schema.$ref === 'string') return refName(schema.$ref);
  if ('const' in schema) return JSON.stringify(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');

  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.map((entry) => tsType(entry, indent)).join(' | ');
  }
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.map((entry) => tsType(entry, indent)).join(' | ');
  }
  if (Array.isArray(schema.allOf)) {
    return schema.allOf.map((entry) => tsType(entry, indent)).join(' & ');
  }

  const types = typeList(schema);
  if (types === null) {
    return schema.properties ? objectType(schema, indent) : 'unknown';
  }

  const parts = types.map((type) => {
    switch (type) {
      case 'string':
        return 'string';
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'null':
        return 'null';
      case 'array':
        return `readonly ${schema.items ? wrapUnion(tsType(schema.items, indent)) : 'unknown'}[]`;
      case 'object':
        return objectType(schema, indent);
      default:
        throw new Error(`emit: unsupported JSON Schema type ${JSON.stringify(type)}`);
    }
  });
  return parts.join(' | ');
}

/** `readonly (A | B)[]` — a bare union inside an array type would bind wrongly. */
function wrapUnion(type) {
  return /[|&]/u.test(type) && !type.startsWith('(') ? `(${type})` : type;
}

function header(...body) {
  return [BANNER, REGENERATE_HINT, '', ...body].join('\n').replace(/\n+$/u, '') + '\n';
}

// ------------------------------------------------------------------------------------------------
// schemas.ts
// ------------------------------------------------------------------------------------------------
function emitSchemas(document) {
  const schemas = document.components?.schemas ?? {};
  const body = ['/** One type per `components.schemas` entry, in lexicographic order. */', ''];
  for (const name of sorted(schemas)) {
    const schema = schemas[name];
    const description = typeof schema.description === 'string' ? schema.description.trim() : '';
    if (description) {
      body.push('/**');
      for (const line of description.split('\n')) body.push(` * ${line}`.trimEnd());
      body.push(' */');
    }
    body.push(`export type ${name} = ${tsType(schema, 0)};`, '');
  }
  return header(...body);
}

// ------------------------------------------------------------------------------------------------
// errors.ts — the PRD §34.9 catalogue as a union plus two exhaustive maps.
// ------------------------------------------------------------------------------------------------
function errorCatalogue(document) {
  const responses = document.components?.responses ?? {};
  const rows = [];
  for (const name of sorted(responses)) {
    const response = responses[name];
    if (typeof response['x-error-code'] !== 'string') continue;
    rows.push({
      code: response['x-error-code'],
      status: response['x-http-status'],
      retryable: response['x-retryable'],
      component: name,
    });
  }
  return rows.sort((a, b) => a.code.localeCompare(b.code));
}

function emitErrors(document) {
  const rows = errorCatalogue(document);
  if (rows.length === 0) throw new Error('emit: the document declares no single-code error responses');
  const union = rows.map((row) => `  | ${JSON.stringify(row.code)}`).join('\n');
  const statuses = rows.map((row) => `  ${row.code}: ${row.status},`).join('\n');
  const retryable = rows.map((row) => `  ${row.code}: ${row.retryable},`).join('\n');
  return header(
    "import type { Error as ApiErrorObject, ErrorResponse } from './schemas.js';",
    '',
    '/** PRD §34.9, the complete error catalogue. */',
    'export type ErrorCode =',
    `${union};`,
    '',
    '/** PRD §16.1 uniform error shape. */',
    'export type ApiError = ApiErrorObject;',
    'export type ApiErrorResponse = ErrorResponse;',
    '',
    '/** The exact HTTP status PRD §34.9 assigns each code. */',
    'export const errorHttpStatusByCode: Readonly<Record<ErrorCode, number>> = {',
    statuses,
    '} as const;',
    '',
    '/** The PRD §34.9 Retry column, reduced to a boolean (sub-PRD D7). */',
    'export const errorRetryableByCode: Readonly<Record<ErrorCode, boolean>> = {',
    retryable,
    '} as const;',
    '',
    '/** Every code, in PRD §34.9 identifier order. */',
    `export const errorCodes: readonly ErrorCode[] = [${rows.map((row) => JSON.stringify(row.code)).join(', ')}] as const;`,
    '',
  );
}

// ------------------------------------------------------------------------------------------------
// paths.ts — the path/method -> operation map.
// ------------------------------------------------------------------------------------------------
function operationRows(document) {
  return operations(document)
    .map(({ path, method, operation }) => ({
      operationId: operation.operationId,
      method: method.toUpperCase(),
      path,
      operation,
    }))
    .sort((a, b) => a.operationId.localeCompare(b.operationId));
}

function emitPaths(document) {
  const rows = operationRows(document);
  const ids = rows.map((row) => row.operationId);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`emit: duplicate operationId ${duplicate}`);

  const entries = rows
    .map((row) => `  ${quoteKey(row.operationId)}: { method: ${JSON.stringify(row.method)}, path: ${JSON.stringify(row.path)} },`)
    .join('\n');
  const base = document.servers?.[0]?.url ?? '';
  return header(
    '/**',
    ' * The path/method map. Path keys are relative to the first server; PRD §16.2 writes them',
    ' * absolutely, so compose `apiBasePath + path` to get the PRD form.',
    ' */',
    `export const apiBasePath = ${JSON.stringify(base)} as const;`,
    '',
    'export const operations = {',
    entries,
    '} as const;',
    '',
    'export type OperationId = keyof typeof operations;',
    'export type HttpMethod = (typeof operations)[OperationId][\'method\'];',
    'export type ApiPath = (typeof operations)[OperationId][\'path\'];',
    '',
  );
}

// ------------------------------------------------------------------------------------------------
// operations.ts — request/response types per operation.
// ------------------------------------------------------------------------------------------------
function jsonSchemaType(document, holder) {
  const content = holder?.content ?? {};
  const media = content['application/json'];
  if (media?.schema) return tsType(media.schema, 1);
  if (content['text/event-stream']) return 'string';
  return null;
}

function emitOperations(document) {
  const rows = operationRows(document);
  const used = new Set();
  const body = [
    '/**',
    ' * One interface per operation, named `<PascalCaseOperationId>Operation`.',
    ' *',
    ' * `requestBody` is `never` when the operation takes none, `successResponse` is `never` when it',
    ' * returns no body (a `204`), and `errorCodes` is the union of the PRD §34.9 codes the operation',
    ' * declares — including those carried by a composite response, because an HTTP status is not',
    ' * one-to-one with a code.',
    ' */',
    '',
  ];
  const imports = new Set();

  for (const row of rows) {
    const name = `${pascalCase(row.operationId)}Operation`;
    if (used.has(name)) throw new Error(`emit: duplicate operation interface ${name}`);
    used.add(name);

    const request = jsonSchemaType(document, row.operation.requestBody) ?? 'never';
    const successes = [];
    const codes = new Set();
    for (const status of Object.keys(row.operation.responses ?? {}).sort()) {
      const response = row.operation.responses[status];
      const resolved = response.$ref
        ? document.components?.responses?.[response.$ref.split('/').pop()]
        : response;
      if (!resolved) continue;
      if (typeof resolved['x-error-code'] === 'string') codes.add(resolved['x-error-code']);
      for (const code of resolved['x-error-codes'] ?? []) codes.add(code);
      if (!/^2\d\d$/u.test(status)) continue;
      const type = jsonSchemaType(document, resolved);
      if (type) successes.push(type);
    }
    for (const match of `${request} ${successes.join(' ')}`.matchAll(/\b([A-Z][A-Za-z0-9]*)\b/gu)) {
      if (document.components?.schemas?.[match[1]]) imports.add(match[1]);
    }

    body.push(
      `export interface ${name} {`,
      `  readonly operationId: ${JSON.stringify(row.operationId)};`,
      `  readonly method: ${JSON.stringify(row.method)};`,
      `  readonly path: ${JSON.stringify(row.path)};`,
      `  readonly requestBody: ${request};`,
      `  readonly successResponse: ${successes.length > 0 ? successes.join(' | ') : 'never'};`,
      `  readonly errorCodes: ${codes.size > 0 ? [...codes].sort().map((code) => JSON.stringify(code)).join(' | ') : 'never'};`,
      '}',
      '',
    );
  }

  const importLine =
    imports.size > 0
      ? `import type { ${[...imports].sort().join(', ')} } from './schemas.js';`
      : null;
  return header(...(importLine ? [importLine, ''] : []), ...body);
}

// ------------------------------------------------------------------------------------------------
// index.ts
// ------------------------------------------------------------------------------------------------
/**
 * Schema names the barrel does not re-export.
 *
 * `Error` would shadow the global `Error` for every consumer importing the package barrel, and
 * `ErrorCode` collides with the identical union `errors.ts` derives from the §34.9 catalogue.
 * Both remain reachable from `./errors.js` as `ApiError` and `ErrorCode`, and both are still
 * exported by `schemas.ts` itself.
 */
const RESERVED_SCHEMA_EXPORTS = new Set(['Error', 'ErrorCode']);

function emitIndex(document) {
  const schemaNames = sorted(document.components?.schemas ?? {}).filter(
    (name) => !RESERVED_SCHEMA_EXPORTS.has(name),
  );
  const operationNames = operationRows(document).map((row) => `${pascalCase(row.operationId)}Operation`);
  return header(
    '/**',
    ' * The generated core FND-04 publishes and `PLTF-02` wraps. Types, `const` maps and unions only:',
    ' * there is no runtime path here, by design.',
    ' */',
    `export type { ${schemaNames.join(', ')} } from './schemas.js';`,
    `export type { ${operationNames.sort().join(', ')} } from './operations.js';`,
    "export type { ApiError, ApiErrorResponse, ErrorCode } from './errors.js';",
    "export { errorCodes, errorHttpStatusByCode, errorRetryableByCode } from './errors.js';",
    "export type { ApiPath, HttpMethod, OperationId } from './paths.js';",
    "export { apiBasePath, operations } from './paths.js';",
    '',
  );
}

/**
 * The complete generated tree, as `relativePath -> contents`.
 *
 * Keys are repository-relative and never absolute. No path under `schemas/openapi/baseline/` is
 * ever produced — advancing the baseline is an explicit reviewed commit, never a side effect of
 * `pnpm generate` (FND-04 deliverable 5), and `test/generated/determinism.test.ts` asserts it.
 */
export function emit(document) {
  const files = new Map();
  files.set(`${GENERATED_DIR}/schemas.ts`, emitSchemas(document));
  files.set(`${GENERATED_DIR}/errors.ts`, emitErrors(document));
  files.set(`${GENERATED_DIR}/paths.ts`, emitPaths(document));
  files.set(`${GENERATED_DIR}/operations.ts`, emitOperations(document));
  files.set(`${GENERATED_DIR}/index.ts`, emitIndex(document));
  return new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export { METHODS as HTTP_METHODS };
