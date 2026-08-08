/**
 * The event-binding emitter (FND-05 deliverable 4; PRD §20.1 "Generated OpenAPI/SDK/event/manifest
 * bindings MUST NOT be hand-edited").
 *
 * PURE. `emit()` reads `schemas/events/**` and returns a `Map<relativePath, sourceText>` covering the
 * whole of `packages/contracts/src/events/generated/**`. It writes nothing and never calls
 * `process.exit`, so `generate.mjs` (write), `check.mjs` (compare) and `test/events/generated.test.ts`
 * (assert) all exercise exactly the same code path.
 *
 * DETERMINISM is the whole point of `generated:check:events`, so: object keys are iterated in the order
 * `JSON.parse` preserves from the schema file; no timestamp, no absolute path, no `process.cwd()`
 * appears in the output; line endings are LF and every file ends with exactly one newline; indentation
 * is two spaces (`.editorconfig`).
 *
 * WHY `.mjs` AND NOT `.ts`: this repository declares no dependency in any workspace member manifest
 * (`tools/tests/skeleton.test.mjs`), so there is no TypeScript runner to execute a `.ts` generator.
 * `tsc` is configured with `allowJs: false`, so these files are never typechecked; `pnpm lint` does
 * cover them.
 *
 * The emitted TypeScript must survive `strict`, `exactOptionalPropertyTypes`,
 * `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules` and eslint — generated files
 * are not lint-ignored. Hence: `readonly` members, `export interface` / `export type` only, never
 * `any`, relative specifiers ending in `.js`, and `export type { … }` for type-only re-exports.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** packages/contracts */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** The repository root. */
export const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');
/** Where `generate.mjs` writes and `check.mjs` compares, relative to PACKAGE_ROOT. */
export const GENERATED_DIR = 'src/events/generated';

const BANNER = '// GENERATED FROM schemas/events/** — DO NOT EDIT (PRD §20.1)';
const SCHEMA_ROOT = 'schemas/events';

/**
 * Every `.ts` file currently under the generated tree, as paths relative to PACKAGE_ROOT with `/`
 * separators. Read-only, and lives here rather than in check.mjs so a test can import it without
 * executing the check script's top-level body.
 */
export function committedGeneratedFiles(packageRoot = PACKAGE_ROOT) {
  const found = [];
  const walk = (dir, prefix) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name.endsWith('.ts')) found.push(`${prefix}${entry.name}`);
    }
  };
  walk(join(packageRoot, GENERATED_DIR), `${GENERATED_DIR}/`);
  return found;
}

/** LF, and exactly one trailing newline. See the CRLF note in check.mjs. */
function render(lines) {
  return `${lines.join('\n')}\n`;
}

function readJson(absolutePath) {
  return JSON.parse(readFileSync(absolutePath, 'utf8').replace(/\r\n/g, '\n'));
}

/** `alert.created` -> `AlertCreated`; `envelope` -> `Envelope`. */
function pascal(name) {
  return name
    .split(/[.\-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** `alert.created` -> `alert-created`: a dot in a file name reads as an extension. */
function fileStem(name) {
  return name.replace(/\./g, '-');
}

/** A JSDoc line, with the one sequence that could terminate the comment neutralised. */
function docComment(indent, text) {
  if (!text) return [];
  return [`${indent}/** ${String(text).replace(/\*\//g, '*\\/')} */`];
}

/** A schema node -> a TypeScript type expression, as `{ head, extraLines }`. */
function typeOf(node, indent) {
  if (Object.prototype.hasOwnProperty.call(node, 'const')) {
    return { head: JSON.stringify(node.const), extra: [] };
  }
  if (Array.isArray(node.enum)) {
    return { head: node.enum.map((member) => JSON.stringify(member)).join(' | '), extra: [] };
  }
  if (node.type === 'array') {
    const inner = typeOf(node.items ?? {}, indent);
    if (inner.extra.length > 0) {
      // An array of objects would need a nested block; no schema in this corpus has one, and a
      // silently wrong type is worse than a loud refusal.
      throw new Error('emit: arrays of object schemas are not supported yet');
    }
    return { head: `readonly ${inner.head}[]`, extra: [] };
  }
  if (node.type === 'object') {
    if (!node.properties) return { head: 'Readonly<Record<string, unknown>>', extra: [] };
    return { head: '{', extra: memberLines(node, `${indent}  `).concat(`${indent}}`) };
  }
  if (node.type === 'string') return { head: 'string', extra: [] };
  if (node.type === 'boolean') return { head: 'boolean', extra: [] };
  if (node.type === 'integer' || node.type === 'number') return { head: 'number', extra: [] };
  throw new Error(`emit: unsupported schema node (type: ${JSON.stringify(node.type)})`);
}

/** The `readonly key: T;` lines of an object schema, in the schema's own property order. */
function memberLines(schema, indent) {
  const required = new Set(schema.required ?? []);
  const lines = [];
  for (const [key, node] of Object.entries(schema.properties)) {
    lines.push(...docComment(indent, node.description));
    const optional = required.has(key) ? '' : '?';
    const { head, extra } = typeOf(node, indent);
    if (extra.length === 0) {
      lines.push(`${indent}readonly ${key}${optional}: ${head};`);
    } else {
      lines.push(`${indent}readonly ${key}${optional}: ${head}`);
      lines.push(...extra.slice(0, -1));
      lines.push(`${extra[extra.length - 1]};`);
    }
  }
  return lines;
}

function interfaceFile(schemaRelativePath, interfaceName, schema) {
  const lines = [BANNER, `// source: ${SCHEMA_ROOT}/${schemaRelativePath}`, ''];
  lines.push(...docComment('', schema.description));
  lines.push(`export interface ${interfaceName} {`);
  lines.push(...memberLines(schema, '  '));
  lines.push('}');
  return render(lines);
}

function constArrayFile(entries) {
  const lines = [BANNER, `// source: ${SCHEMA_ROOT}/registry.json`, ''];
  lines.push('/** The `schema_version` every schema in this version directory declares (PRD §16.1). */');
  lines.push("export const SCHEMA_VERSION = '1.0';");
  for (const [constName, typeName, values, doc] of entries) {
    lines.push('');
    lines.push(`/** ${doc} */`);
    lines.push(`export const ${constName} = [`);
    for (const value of values) lines.push(`  ${JSON.stringify(value)},`);
    lines.push('] as const;');
    lines.push('');
    lines.push(`export type ${typeName} = (typeof ${constName})[number];`);
  }
  return render(lines);
}

/**
 * Every generated file, keyed by its path relative to `packages/contracts`.
 *
 * @param {string} repoRoot repository root; defaults to this file's own repository.
 * @returns {Map<string, string>}
 */
export function emit(repoRoot = REPO_ROOT) {
  const schemaRoot = join(repoRoot, SCHEMA_ROOT);
  const registry = readJson(join(schemaRoot, 'registry.json'));
  const files = new Map();
  const exports = [];

  const emitOne = (schemaRelativePath, interfaceName, moduleRelativePath) => {
    const schema = readJson(join(schemaRoot, schemaRelativePath));
    files.set(
      `${GENERATED_DIR}/${moduleRelativePath}.ts`,
      interfaceFile(schemaRelativePath, interfaceName, schema),
    );
    exports.push([interfaceName, `./${moduleRelativePath}.js`]);
  };

  emitOne(registry.webhook.envelope.schema, 'WebhookEventEnvelope', 'webhook/v1/envelope');
  for (const [type, entry] of Object.entries(registry.webhook.types)) {
    emitOne(entry.schema, `${pascal(type)}Event`, `webhook/${entry.version}/${fileStem(type)}`);
  }
  for (const [type, entry] of Object.entries(registry.sse.types)) {
    emitOne(entry.schema, `${pascal(type)}SseEvent`, `sse/${entry.version}/${fileStem(type)}`);
  }

  files.set(
    `${GENERATED_DIR}/registry.ts`,
    constArrayFile([
      [
        'WEBHOOK_EVENT_TYPES',
        'WebhookEventTypeName',
        Object.keys(registry.webhook.types),
        'Registered webhook event types, in registry order (PRD §34.8).',
      ],
      [
        'SSE_EVENT_TYPES',
        'SseEventTypeName',
        Object.keys(registry.sse.types),
        'Allowed public SSE event types, in registry order (PRD §34.4).',
      ],
    ]),
  );

  const indexLines = [BANNER, `// source: ${SCHEMA_ROOT}/registry.json`, ''];
  for (const [name, specifier] of exports) {
    indexLines.push(`export type { ${name} } from '${specifier}';`);
  }
  indexLines.push(
    "export { SCHEMA_VERSION, WEBHOOK_EVENT_TYPES, SSE_EVENT_TYPES } from './registry.js';",
  );
  indexLines.push("export type { WebhookEventTypeName, SseEventTypeName } from './registry.js';");
  files.set(`${GENERATED_DIR}/index.ts`, render(indexLines));

  return files;
}
