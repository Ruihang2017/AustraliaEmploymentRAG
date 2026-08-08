/**
 * A minimal JSON Schema draft-2020-12 validator covering EXACTLY the keywords
 * `schema/log-record.schema.json` uses: `type`, `properties`, `required`,
 * `additionalProperties: false`, `enum`, `pattern`, `minimum`, `maxLength`.
 *
 * WHY HAND-ROLLED. `tools/tests/skeleton.test.mjs` asserts every member manifest declares no
 * dependency, so no JSON-schema library may be added for this ticket.
 *
 * A validator that cannot fail discharges nothing, so `test/schema.test.ts` runs positive AND
 * negative controls over this function itself before using it on the real schema. It also refuses
 * any keyword it does not implement (`assertSupportedKeywords`), so a future schema edit that adds
 * `oneOf` or `$ref` fails loudly instead of being silently ignored.
 */

const SUPPORTED = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'enum',
  'pattern',
  'minimum',
  'maxLength',
  'x-generated-from',
  'x-schema-version',
]);

type Schema = Record<string, unknown>;

/** Throws if the schema uses a keyword this validator does not implement. */
export function assertSupportedKeywords(schema: Schema, path = '#'): void {
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) {
      throw new Error(`${path}: unsupported JSON Schema keyword "${key}"`);
    }
  }
  const properties = schema['properties'];
  if (properties !== undefined) {
    for (const [name, node] of Object.entries(properties as Record<string, Schema>)) {
      assertSupportedKeywords(node, `${path}/properties/${name}`);
    }
  }
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return false;
  }
}

/** Validates `value` against `schema`. Returns every violation; an empty array means valid. */
export function validate(schema: Schema, value: unknown, path = '#'): string[] {
  const errors: string[] = [];

  const type = schema['type'];
  if (typeof type === 'string' && !typeMatches(type, value)) {
    errors.push(`${path}: expected type ${type}`);
    return errors;
  }

  const allowed = schema['enum'];
  if (Array.isArray(allowed) && !allowed.includes(value)) {
    errors.push(`${path}: value is not in the enum`);
  }

  if (typeof value === 'string') {
    const pattern = schema['pattern'];
    if (typeof pattern === 'string' && !new RegExp(pattern).test(value)) {
      errors.push(`${path}: value does not match pattern`);
    }
    const maxLength = schema['maxLength'];
    if (typeof maxLength === 'number' && [...value].length > maxLength) {
      errors.push(`${path}: value is longer than maxLength`);
    }
  }

  if (typeof value === 'number') {
    const minimum = schema['minimum'];
    if (typeof minimum === 'number' && value < minimum) {
      errors.push(`${path}: value is below minimum`);
    }
  }

  if (typeMatches('object', value)) {
    const object = value as Record<string, unknown>;
    const properties = (schema['properties'] ?? {}) as Record<string, Schema>;

    const required = schema['required'];
    if (Array.isArray(required)) {
      for (const name of required) {
        if (!Object.hasOwn(object, String(name))) {
          errors.push(`${path}: missing required property "${String(name)}"`);
        }
      }
    }

    if (schema['additionalProperties'] === false) {
      for (const name of Object.keys(object)) {
        if (!Object.hasOwn(properties, name)) {
          errors.push(`${path}: additional property "${name}" is not permitted`);
        }
      }
    }

    for (const [name, node] of Object.entries(properties)) {
      if (!Object.hasOwn(object, name)) continue;
      errors.push(...validate(node, object[name], `${path}/${name}`));
    }
  }

  return errors;
}
