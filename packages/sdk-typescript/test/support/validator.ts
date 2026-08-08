/**
 * A JSON Schema 2020-12 validator over a CLOSED keyword subset, for the SSE fixture replay.
 *
 * ## Why a local one
 *
 * This package declares no dependency (plan §2.1), so `ajv` is not available to it, and `FND-05`'s
 * own subset validator lives under `packages/contracts/test/**`, which is excluded from that
 * package's `tsconfig` and written against Node globals this program does not declare. The plan
 * sanctions exactly this fallback: *"a minimal local structural validator under `test/support/` is
 * the fallback — never a new dependency."*
 *
 * ## Why a subset validator is honest
 *
 * A validator that silently ignores a keyword it does not understand proves nothing. So
 * `unsupportedKeywords()` reports every keyword used anywhere in a schema, and
 * `test/streaming.test.ts` asserts the whole `schemas/events/sse/v1/**` corpus uses ONLY the
 * keywords implemented below. Add a keyword to a schema and that assertion fails until it is
 * implemented here.
 */
import type { JsonObject, JsonValue } from './repo.js';

export const SUPPORTED_KEYWORDS: readonly string[] = Object.freeze([
  '$schema',
  '$id',
  '$comment',
  'title',
  'description',
  'type',
  'enum',
  'const',
  'pattern',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
]);

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every keyword used anywhere in `schema`. */
export function collectKeywords(schema: JsonObject): Set<string> {
  const found = new Set<string>();
  const walk = (node: JsonValue): void => {
    if (!isObject(node)) return;
    for (const [keyword, value] of Object.entries(node)) {
      found.add(keyword);
      if (keyword === 'properties' && isObject(value)) {
        for (const child of Object.values(value)) walk(child);
      } else if (keyword === 'items') {
        walk(value);
      } else if (keyword === 'additionalProperties' && isObject(value)) {
        walk(value);
      }
    }
  };
  walk(schema);
  return found;
}

export function unsupportedKeywords(schema: JsonObject): string[] {
  return [...collectKeywords(schema)].filter((keyword) => !SUPPORTED_KEYWORDS.includes(keyword)).sort();
}

function typeMatches(expected: string, value: JsonValue): boolean {
  switch (expected) {
    case 'object':
      return isObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
}

/** Structural violations of `schema` by `instance`. `[]` means valid. */
export function validate(schema: JsonObject, instance: JsonValue, path = '$'): string[] {
  const problems: string[] = [];

  const type = schema['type'];
  if (typeof type === 'string' && !typeMatches(type, instance)) {
    problems.push(`${path}: expected type ${type}`);
    return problems;
  }

  if ('const' in schema && JSON.stringify(schema['const']) !== JSON.stringify(instance)) {
    problems.push(`${path}: expected const ${JSON.stringify(schema['const'])}`);
  }

  const enumValues = schema['enum'];
  if (Array.isArray(enumValues) && !enumValues.some((v) => JSON.stringify(v) === JSON.stringify(instance))) {
    problems.push(`${path}: value is not one of the enum members`);
  }

  const pattern = schema['pattern'];
  if (typeof pattern === 'string' && typeof instance === 'string' && !new RegExp(pattern).test(instance)) {
    problems.push(`${path}: does not match ${pattern}`);
  }

  if (Array.isArray(instance)) {
    const minItems = schema['minItems'];
    if (typeof minItems === 'number' && instance.length < minItems) problems.push(`${path}: too few items`);
    const maxItems = schema['maxItems'];
    if (typeof maxItems === 'number' && instance.length > maxItems) problems.push(`${path}: too many items`);
    const items = schema['items'];
    if (isObject(items)) {
      instance.forEach((item, index) => problems.push(...validate(items, item, `${path}[${index}]`)));
    }
  }

  if (isObject(instance)) {
    const required = schema['required'];
    if (Array.isArray(required)) {
      for (const key of required) {
        if (typeof key === 'string' && !(key in instance)) problems.push(`${path}: missing required "${key}"`);
      }
    }
    const properties = isObject(schema['properties']) ? schema['properties'] : {};
    for (const [key, value] of Object.entries(instance)) {
      const child = properties[key];
      if (isObject(child)) {
        problems.push(...validate(child, value, `${path}.${key}`));
      } else if (schema['additionalProperties'] === false) {
        problems.push(`${path}: unexpected property "${key}"`);
      }
    }
  }

  return problems;
}
