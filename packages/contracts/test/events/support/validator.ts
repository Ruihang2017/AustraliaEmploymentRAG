/**
 * A JSON Schema 2020-12 validator over a CLOSED keyword subset.
 *
 * ## Why this exists instead of a library
 *
 * `tools/tests/skeleton.test.mjs` asserts every workspace member manifest declares no `dependencies`
 * and no `devDependencies`, so `ajv` (or anything else) cannot be added — and `tools/**` is FND-01's
 * file-scope. FND-05's Test-plan harness sentence is therefore discharged by repo-local code, recorded
 * in the ticket writeback and in sub-PRD v0.7 item (a).
 *
 * ## Why a subset validator is honest here
 *
 * A validator that silently ignores a keyword it does not understand proves nothing. So:
 * `collectKeywords()` reports every keyword used anywhere in a schema, and `schemas.test.ts` asserts
 * the whole `schemas/events/**` corpus uses ONLY the keywords listed below. The reading discharged is
 * therefore exact: *structural validity against the declared 2020-12 vocabulary subset, with the
 * subset proven complete over this corpus*. Add a keyword to a schema and the closure test fails until
 * the keyword is implemented here.
 *
 * Bundling the official 2020-12 meta-schema was considered and rejected: it uses `$dynamicRef`,
 * `$vocabulary` and `anyOf`, none of which this validator implements, so validating against it would
 * be vacuous — exactly the failure mode this design avoids.
 */
import type { JsonObject, JsonValue } from './load.js';

/**
 * Every keyword this validator understands, with its JSON Schema 2020-12 vocabulary section.
 * `$schema`, `$id` and `$comment` are Core (§8); `title`/`description` are Meta-Data (§9 of the
 * Validation spec); the rest are Validation assertions.
 */
export const SUPPORTED_KEYWORDS: Readonly<Record<string, string>> = Object.freeze({
  $schema: 'Core §8.1.1',
  $id: 'Core §8.2.1',
  $comment: 'Core §8.3',
  title: 'Meta-Data §9.1',
  description: 'Meta-Data §9.1',
  type: 'Validation §6.1.1',
  enum: 'Validation §6.1.2',
  const: 'Validation §6.1.3',
  pattern: 'Validation §6.3.3',
  properties: 'Applicator §10.3.2.1',
  required: 'Validation §6.5.3',
  additionalProperties: 'Applicator §10.3.2.3',
  items: 'Applicator §10.3.1.2',
  minItems: 'Validation §6.4.2',
  maxItems: 'Validation §6.4.1',
});

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every keyword used anywhere in `schema`, including inside `properties` and `items`. */
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
      }
    }
  };
  walk(schema);
  return found;
}

/** Keywords used by `schema` that this validator does not implement. */
export function unsupportedKeywords(schema: JsonObject): string[] {
  return [...collectKeywords(schema)]
    .filter((keyword) => !Object.prototype.hasOwnProperty.call(SUPPORTED_KEYWORDS, keyword))
    .sort();
}

function typeMatches(expected: string, value: JsonValue): boolean {
  if (expected === 'object') return isObject(value);
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'string') return typeof value === 'string';
  if (expected === 'boolean') return typeof value === 'boolean';
  if (expected === 'number') return typeof value === 'number';
  if (expected === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (expected === 'null') return value === null;
  throw new Error(`validator: unsupported "type" value ${JSON.stringify(expected)}`);
}

/**
 * Structural errors of `instance` against `schema`, each prefixed with its instance path.
 * An empty array means valid. Throws only on a schema this validator cannot interpret.
 */
export function validate(schema: JsonObject, instance: JsonValue, path = '$'): string[] {
  const errors: string[] = [];

  if (typeof schema['type'] === 'string' && !typeMatches(schema['type'], instance)) {
    errors.push(`${path}: expected type ${schema['type']}, got ${describe(instance)}`);
    return errors;
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    if (JSON.stringify(instance) !== JSON.stringify(schema['const'])) {
      errors.push(`${path}: expected const ${JSON.stringify(schema['const'])}, got ${describe(instance)}`);
    }
  }

  const enumeration = schema['enum'];
  if (Array.isArray(enumeration)) {
    const wanted = enumeration.map((member) => JSON.stringify(member));
    if (!wanted.includes(JSON.stringify(instance))) {
      errors.push(`${path}: ${describe(instance)} is not one of ${wanted.join(', ')}`);
    }
  }

  if (typeof schema['pattern'] === 'string' && typeof instance === 'string') {
    if (!new RegExp(schema['pattern'], 'u').test(instance)) {
      errors.push(`${path}: ${describe(instance)} does not match /${schema['pattern']}/`);
    }
  }

  if (isObject(instance)) {
    const properties = isObject(schema['properties']) ? schema['properties'] : undefined;
    const required = Array.isArray(schema['required']) ? schema['required'] : [];
    for (const key of required) {
      if (typeof key === 'string' && !Object.prototype.hasOwnProperty.call(instance, key)) {
        errors.push(`${path}: required property "${key}" is missing`);
      }
    }
    if (schema['additionalProperties'] === false && properties) {
      for (const key of Object.keys(instance)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`${path}: property "${key}" is not allowed (additionalProperties: false)`);
        }
      }
    }
    if (properties) {
      for (const [key, child] of Object.entries(properties)) {
        if (!Object.prototype.hasOwnProperty.call(instance, key)) continue;
        if (!isObject(child)) continue;
        errors.push(...validate(child, instance[key] as JsonValue, `${path}.${key}`));
      }
    }
  }

  if (Array.isArray(instance)) {
    const minItems = schema['minItems'];
    const maxItems = schema['maxItems'];
    if (typeof minItems === 'number' && instance.length < minItems) {
      errors.push(`${path}: has ${instance.length} items, minimum is ${minItems}`);
    }
    if (typeof maxItems === 'number' && instance.length > maxItems) {
      errors.push(`${path}: has ${instance.length} items, maximum is ${maxItems}`);
    }
    const items = schema['items'];
    if (isObject(items)) {
      instance.forEach((member, index) => {
        errors.push(...validate(items, member, `${path}[${index}]`));
      });
    }
  }

  return errors;
}

function describe(value: JsonValue): string {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value === null) return 'null';
  if (typeof value === 'object') return 'object';
  return JSON.stringify(value);
}
